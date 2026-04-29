// lib/import/csvParser.ts — CSV parsing using papaparse. Handles two formats:
//   Sheet1: Customer, State, "YYYY Total Sales", ... — revenue by year
//   Generic: customer_name, state, revenue_YYYY, ... — generic format
// Skips "(DO NOT USE)" rows and the "Total Sales" summary column.

import Papa from "papaparse";
import type { ImportRow } from "@/types";

// Matches "2023 Total Sales", "2024 Total Sales", etc.
const YEAR_TOTAL_COL = /^(\d{4})\s+total\s+sales$/i;
// Matches "revenue_2023", "revenue 2023", etc.
const REVENUE_COL = /^revenue[_\s](\d{4})$/i;

// Maps CSV column name variants to ImportRow field names
const FIELD_MAP: Record<string, keyof ImportRow> = {
  customer: "customerName",
  customer_name: "customerName",
  customername: "customerName",
  name: "customerName",
  "doctor name": "customerName",
  doctor_name: "customerName",
  state: "state",
  practice_name: "practiceName",
  practicename: "practiceName",
  practice: "practiceName",
  phone: "phone",
  email: "email",
  address: "address",
  notes: "notes",
  current_systems: "currentSystems",
  currentsystems: "currentSystems",
  noris_implant_use: "norisImplantUse",
  norisimplantuse: "norisImplantUse",
  primary_pain_point: "primaryPainPoint",
  primarypainpoint: "primaryPainPoint",
};

// Columns that carry no import-relevant data and should be skipped
const SKIP_COLS = new Set(["total sales", "totalsales", "total"]);

/** Strip currency formatting: "$313,171.00" → 313171.00 */
function parseCurrencyValue(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "").trim();
  if (cleaned === "" || cleaned === "--" || cleaned === "-") return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/**
 * Attempt to split "Dr. Name - Practice Name" into name and practiceName.
 * Only splits on " - " (space-dash-space) and only if both parts are non-trivial.
 * "NHOMS - Nashua" → name="NHOMS", practiceName="Nashua"
 * "Dr. Smith - Happy Smiles Dental" → name="Dr. Smith", practiceName="Happy Smiles Dental"
 */
const US_STATE_RE = /^[A-Z]{2}$/;

function splitNameAndPractice(raw: string): { name: string; practiceName: string } {
  const sep = raw.indexOf(" - ");
  if (sep === -1) return { name: raw.trim(), practiceName: "" };
  const left = raw.slice(0, sep).trim();
  const right = raw.slice(sep + 3).trim();
  // Don't split if either side is too short, or right side is a state abbreviation/location code
  if (left.length < 2 || right.length < 4 || US_STATE_RE.test(right)) {
    return { name: raw.trim(), practiceName: "" };
  }
  return { name: left, practiceName: right };
}

export interface ParseResult {
  rows: ImportRow[];
  columnMapping: Record<string, string>;
  rawColumnNames: string[];
  /** "sheet1" = YYYY Total Sales format; "generic" = revenue_YYYY format */
  detectedFormat: "sheet1" | "generic";
}

/** Parse a CSV string into ImportRow[]. Non-throwing — errors surface via csvValidator.ts. */
export function parseCsv(csvText: string): ParseResult {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const rawColumnNames = result.meta.fields ?? [];
  const columnMapping: Record<string, string> = {};

  // Detect format by checking if any column matches "YYYY Total Sales"
  const isSheet1 = rawColumnNames.some((c) => YEAR_TOTAL_COL.test(c.trim()));
  const detectedFormat = isSheet1 ? "sheet1" : "generic";

  // Build column mapping
  for (const col of rawColumnNames) {
    const normalized = col.toLowerCase().replace(/\s+/g, "_");
    const normalizedRaw = col.toLowerCase().trim();

    if (SKIP_COLS.has(normalizedRaw)) continue;

    const yearTotalMatch = YEAR_TOTAL_COL.exec(col.trim());
    const revColMatch = REVENUE_COL.exec(normalized);

    if (yearTotalMatch) {
      columnMapping[col] = `revenue_${yearTotalMatch[1]}`;
    } else if (revColMatch) {
      columnMapping[col] = `revenue_${revColMatch[1]}`;
    } else if (FIELD_MAP[normalized] || FIELD_MAP[normalizedRaw]) {
      columnMapping[col] = (FIELD_MAP[normalized] ?? FIELD_MAP[normalizedRaw]) as string;
    }
  }

  const rows: ImportRow[] = result.data
    .map((rawRow, i) => {
      const annualRevenue: Record<number, number> = {};

      // Extract revenue columns
      for (const col of rawColumnNames) {
        const normalizedRaw = col.toLowerCase().trim();
        if (SKIP_COLS.has(normalizedRaw)) continue;

        const yearTotalMatch = YEAR_TOTAL_COL.exec(col.trim());
        const revColMatch = REVENUE_COL.exec(col.toLowerCase().replace(/\s+/g, "_"));

        const yearMatch = yearTotalMatch ?? revColMatch;
        if (yearMatch) {
          const year = parseInt(yearMatch[1], 10);
          const raw = rawRow[col] ?? "";
          const value = parseCurrencyValue(raw);
          // Include non-zero values (including negative returns)
          if (value !== null && value !== 0) {
            annualRevenue[year] = value;
          }
        }
      }

      // Build the base row
      const row: ImportRow = {
        rowIndex: i,
        customerName: "",
        state: "",
        annualRevenue,
      };

      // Map standard fields
      for (const col of rawColumnNames) {
        const normalized = col.toLowerCase().replace(/\s+/g, "_");
        const normalizedRaw = col.toLowerCase().trim();
        const field = FIELD_MAP[normalized] ?? FIELD_MAP[normalizedRaw];
        if (field && field !== "annualRevenue") {
          (row as unknown as Record<string, unknown>)[field] = rawRow[col]?.trim() ?? "";
        }
      }

      return row;
    })
    .map((row) => {
      // For Sheet1: attempt to split "Dr. Name - Practice Name"
      if (isSheet1 && row.customerName && !row.practiceName) {
        const { name, practiceName } = splitNameAndPractice(row.customerName);
        return { ...row, customerName: name, practiceName };
      }
      return row;
    });

  return { rows, columnMapping, rawColumnNames, detectedFormat };
}
