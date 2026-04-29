// lib/import/csvValidator.ts — Validates ImportRow[] and returns ImportError[] for bad rows.

import type { ImportRow, ImportError } from "@/types";

const VALID_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DC","DE","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
  "NJ","NM","NY","NC","ND","OH","OK","OR","PA","PR","RI","SC","SD","TN","TX",
  "UT","VT","VA","WA","WV","WI","WY",
]);

export interface ValidationResult {
  errors: ImportError[];
  validRows: ImportRow[];
  invalidRowIndices: Set<number>;
}

/** Validate parsed rows. Returns errors per row and the set of valid rows. */
export function validateRows(rows: ImportRow[]): ValidationResult {
  const errors: ImportError[] = [];
  const invalidRowIndices = new Set<number>();

  for (const row of rows) {
    // Skip rows flagged as DO NOT USE
    if (/\bdo\s+not\s+use\b/i.test(row.customerName ?? "")) {
      errors.push({
        rowIndex: row.rowIndex,
        field: "customerName",
        message: `Skipped: flagged as "DO NOT USE"`,
        rawValue: row.customerName,
      });
      invalidRowIndices.add(row.rowIndex);
      continue;
    }

    // customerName required
    if (!row.customerName?.trim()) {
      errors.push({
        rowIndex: row.rowIndex,
        field: "customerName",
        message: "Customer name is required",
        rawValue: row.customerName,
      });
      invalidRowIndices.add(row.rowIndex);
    }

    // state: required + must be valid 2-letter code
    if (!row.state?.trim()) {
      errors.push({
        rowIndex: row.rowIndex,
        field: "state",
        message: "State is required",
        rawValue: row.state,
      });
      invalidRowIndices.add(row.rowIndex);
    } else if (!VALID_STATES.has(row.state.trim().toUpperCase())) {
      errors.push({
        rowIndex: row.rowIndex,
        field: "state",
        message: `Unknown state code "${row.state}"`,
        rawValue: row.state,
      });
      invalidRowIndices.add(row.rowIndex);
    }

    // Revenue values must be non-negative
    for (const [yearStr, value] of Object.entries(row.annualRevenue)) {
      if (typeof value !== "number" || isNaN(value) || value < 0) {
        errors.push({
          rowIndex: row.rowIndex,
          field: `revenue_${yearStr}`,
          message: `Revenue for ${yearStr} must be a non-negative number`,
          rawValue: String(value),
        });
        invalidRowIndices.add(row.rowIndex);
      }
    }
  }

  const validRows = rows.filter((r) => !invalidRowIndices.has(r.rowIndex));
  return { errors, validRows, invalidRowIndices };
}
