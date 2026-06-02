// lib/forecast/csvExport.ts — Pipeline export helpers + single-region CSV builder.
//
// Two-format world:
//   - manager region-scoped export → CSV (single sheet, simple)
//   - admin org-wide export → XLSX with one tab per region + Summary
// Both formats share the row-building helpers below so the column shape can
// never drift between them. The XLSX builder lives in xlsxExport.ts.
//
// NOTE: This file has zero React imports and zero side effects on load. The
// XLSX builder is in a separate file so the heavy SheetJS library can be
// dynamically imported there without dragging it into pages that only need
// CSV.

import type { AppUser, Customer, CloseWindow } from "@/types";
import { DOC_TYPE_LABELS } from "@/types";
import {
  calcRepMetrics,
  onTrackPctFor,
  weightedTotalFor,
} from "./repMetrics";

// ── CSV primitives ──────────────────────────────────────────────────────────

/**
 * RFC 4180 escape: if the value contains a comma, double-quote, or any line
 * terminator, wrap in double quotes and double any internal quotes. Numbers
 * are coerced to strings first so an integer 1234 emits as `1234`.
 */
function csvCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (s === "") return "";
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

// ── Status / timeline label resolution ──────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  new_potential:    "New Potential",
  actively_working: "Actively Working",
  closed:           "Closed",
  prospecting:      "New Potential", // legacy alias
};

/**
 * Status column value for the export.
 *
 * NEW rows: default to "New Potential" when the stored value is null/unknown.
 * This mirrors the rep dashboard UI, which shows "New Potential" for any
 * un-touched NEW row — the previous exporter wrote a blank cell here, which
 * confused Spencer's review (e.g. 14 of Emma McLeod's NEW rows looked
 * status-less).
 *
 * EXISTING rows: always blank (the column doesn't apply to them).
 */
function statusLabelForExport(c: Customer): string {
  if (c.pipelineType !== "new") return "";
  const raw = c.newStatus;
  if (raw == null) return "New Potential";
  return STATUS_LABEL[raw] ?? "New Potential";
}

function timelineLabel(w: CloseWindow | undefined): string {
  return w ? `${w} days` : "";
}

// ── Shared row builders (consumed by both CSV and XLSX) ─────────────────────

export const PER_CUSTOMER_HEADER = [
  "Month",
  "Region",
  "Rep",
  "Customer / Practice",
  "Type",
  "Doc-Type",
  "Status",
  "Timeline",
  "Expected $",
  "Close %",
  "Actual $",
  "Weighted $",
  "On-Track %",
  "Strategy Notes",
];

export const PER_REP_HEADER = [
  "",
  "Region",
  "Rep",
  "New Weighted $",
  "Existing Expected $",
  "Existing Actual $",
  "Combined Forecast $",
  "Manual Forecast Box $",
];

export const PER_REGION_HEADER = [
  "",
  "Region",
  "",
  "New Weighted $",
  "Existing Expected $",
  "Existing Actual $",
  "Combined Forecast $",
  "",
];

function customerLabelOf(c: Customer): string {
  return c.practiceName ? `${c.name} / ${c.practiceName}` : c.name;
}

/**
 * Per-customer row as a typed array (numbers stay numeric so XLSX gets
 * real numbers in $/% columns; the CSV path stringifies via csvCell()).
 */
export function customerRowCells(
  c: Customer,
  monthKey: string,
  usersById: Map<string, AppUser>
): (string | number)[] {
  const owner = usersById.get(c.ownerId);
  const isNew = c.pipelineType === "new";
  const pct = onTrackPctFor(c);
  return [
    monthKey,
    owner?.region ?? "",
    owner?.name ?? "",
    customerLabelOf(c),
    isNew ? "New" : "Existing",
    DOC_TYPE_LABELS[c.docType] ?? c.docType,
    statusLabelForExport(c),
    isNew ? timelineLabel(c.closeWindow) : "",
    isNew
      ? Math.round(c.expectedMonthlyTotal ?? 0)
      : Math.round(c.expectedMonthly ?? 0),
    isNew ? Math.round(c.closeProbability ?? 0) : "",
    isNew ? "" : Math.round(c.actualThisMonth ?? 0),
    isNew ? Math.round(weightedTotalFor(c)) : "",
    isNew ? "" : pct == null ? "" : Math.round(pct),
    c.notes ?? "",
  ];
}

export function bucketByRep(customers: Customer[]): Map<string, Customer[]> {
  const out = new Map<string, Customer[]>();
  for (const c of customers) {
    const arr = out.get(c.ownerId);
    if (arr) arr.push(c);
    else out.set(c.ownerId, [c]);
  }
  return out;
}

export function bucketByRegion(
  customers: Customer[],
  usersById: Map<string, AppUser>
): Map<string, Customer[]> {
  const out = new Map<string, Customer[]>();
  for (const c of customers) {
    const region = usersById.get(c.ownerId)?.region ?? "—";
    const arr = out.get(region);
    if (arr) arr.push(c);
    else out.set(region, [c]);
  }
  return out;
}

export function repSummaryCells(
  repId: string,
  repCustomers: Customer[],
  usersById: Map<string, AppUser>,
  repForecasts: Record<string, number>
): (string | number)[] {
  const owner = usersById.get(repId);
  const m = calcRepMetrics(repCustomers);
  const manual = repForecasts[repId];
  return [
    "Rep total",
    owner?.region ?? "",
    owner?.name ?? "",
    Math.round(m.newWeightedTotal),
    Math.round(m.existingExpected),
    Math.round(m.existingActual),
    Math.round(m.combinedForecast),
    manual == null ? "" : Math.round(manual),
  ];
}

export function regionSummaryCells(
  region: string,
  regionCustomers: Customer[]
): (string | number)[] {
  const m = calcRepMetrics(regionCustomers);
  return [
    "Region total",
    region,
    "",
    Math.round(m.newWeightedTotal),
    Math.round(m.existingExpected),
    Math.round(m.existingActual),
    Math.round(m.combinedForecast),
    "",
  ];
}

export function grandTotalCells(allCustomers: Customer[]): (string | number)[] {
  const g = calcRepMetrics(allCustomers);
  return [
    "GRAND TOTAL",
    "",
    "",
    Math.round(g.newWeightedTotal),
    Math.round(g.existingExpected),
    Math.round(g.existingActual),
    Math.round(g.combinedForecast),
    "",
  ];
}

// ── Single-region CSV (used by /team manager export) ────────────────────────

export interface CsvExportInputs {
  monthKey: string;
  /** Customers in scope — already inPipeline filtered + viewed-at-month. */
  customers: Customer[];
  usersById: Map<string, AppUser>;
  repForecasts: Record<string, number>;
}

/**
 * Build a single-region CSV string. Deterministic sort so the same month
 * exported twice produces byte-identical output.
 */
export function buildPipelineCsv({
  monthKey,
  customers,
  usersById,
  repForecasts,
}: CsvExportInputs): string {
  const lines: string[] = [];

  // Section 1: per-customer rows.
  lines.push(csvRow(PER_CUSTOMER_HEADER));
  const sorted = customers.slice().sort((a, b) => {
    const na = usersById.get(a.ownerId)?.name ?? "";
    const nb = usersById.get(b.ownerId)?.name ?? "";
    if (na !== nb) return na.localeCompare(nb);
    return a.name.localeCompare(b.name);
  });
  for (const c of sorted) {
    lines.push(csvRow(customerRowCells(c, monthKey, usersById)));
  }

  // Section 2: summary — per-rep, per-region (1 row), grand total.
  lines.push("");
  lines.push(csvRow(["── Summary ──"]));

  lines.push("");
  lines.push(csvRow(PER_REP_HEADER));
  const byRep = bucketByRep(customers);
  const repIdsSorted = Array.from(byRep.keys()).sort((a, b) => {
    return (usersById.get(a)?.name ?? "").localeCompare(usersById.get(b)?.name ?? "");
  });
  for (const repId of repIdsSorted) {
    lines.push(csvRow(repSummaryCells(repId, byRep.get(repId) ?? [], usersById, repForecasts)));
  }

  lines.push("");
  lines.push(csvRow(PER_REGION_HEADER));
  const byRegion = bucketByRegion(customers, usersById);
  for (const region of Array.from(byRegion.keys()).sort()) {
    lines.push(csvRow(regionSummaryCells(region, byRegion.get(region) ?? [])));
  }

  lines.push("");
  lines.push(csvRow(grandTotalCells(customers)));

  return lines.join("\r\n") + "\r\n";
}

// ── Browser download trigger ────────────────────────────────────────────────

export function downloadCsv(filename: string, csv: string): void {
  // UTF-8 BOM so Excel opens accented names correctly.
  const BOM = "﻿";
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function csvFilenameFor(monthKey: string, suffix?: string): string {
  return suffix
    ? `NorisForecast_${monthKey}_${suffix}.csv`
    : `NorisForecast_${monthKey}.csv`;
}
