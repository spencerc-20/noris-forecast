// lib/forecast/xlsxExport.ts — Multi-tab pipeline workbook (admin export from /region).
//
// Critical: the SheetJS library (`xlsx`) is loaded via `await import("xlsx")`
// INSIDE the builder function. It is NOT a top-level import. Why:
//
//   The library is ~500 KB and uses CommonJS-interop. When previously
//   imported eagerly from this module, Next/Webpack pulled it into the
//   /region page bundle. Something in xlsx's module init (likely a fallback
//   `require("crypto")` or similar in the umbrella distro) disrupted React's
//   hydration on that page and surfaced as the rules-of-hooks check tripping
//   (Minified React error #310 in production).
//
//   Dynamic import code-splits it into its own chunk that only loads when
//   the admin actually clicks "Export Excel". The /region page bundle stays
//   small and clean, and module init can't interfere with React render.

import type { AppUser, Customer } from "@/types";
import {
  PER_CUSTOMER_HEADER,
  PER_REP_HEADER,
  PER_REGION_HEADER,
  bucketByRegion,
  bucketByRep,
  customerRowCells,
  grandTotalCells,
  regionSummaryCells,
  repSummaryCells,
} from "./csvExport";

export interface XlsxExportInputs {
  monthKey: string;
  customers: Customer[];        // inPipeline filtered + viewed-at-month
  usersById: Map<string, AppUser>;
  repForecasts: Record<string, number>;
}

/**
 * Excel sheet names: max 31 chars, no `\ / ? * [ ] :`. Dedupe collisions
 * with a `(2)` suffix so two regions sanitising to the same name don't
 * crash the writer.
 */
function safeSheetName(name: string, taken: Set<string>): string {
  let cleaned = (name || "").replace(/[\\/?*[\]:]/g, "_").slice(0, 31).trim();
  if (!cleaned) cleaned = "Region";
  let candidate = cleaned;
  let n = 2;
  while (taken.has(candidate.toLowerCase())) {
    const suffix = ` (${n})`;
    candidate = cleaned.slice(0, 31 - suffix.length) + suffix;
    n += 1;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Build the workbook. Async because xlsx is dynamically imported.
 * Returns ArrayBuffer suitable for the Blob constructor in downloadXlsx().
 */
export async function buildPipelineXlsx({
  monthKey,
  customers,
  usersById,
  repForecasts,
}: XlsxExportInputs): Promise<ArrayBuffer> {
  // Dynamic import — see header comment for why this is critical.
  const XLSX = await import("xlsx");

  const wb = XLSX.utils.book_new();

  // ── One worksheet per region (alphabetical) ──────────────────────────────
  const byRegion = bucketByRegion(customers, usersById);
  const regionNames = Array.from(byRegion.keys()).sort();
  const usedNames = new Set<string>();

  for (const region of regionNames) {
    const regionCustomers = byRegion.get(region) ?? [];

    // Sort by rep name → customer name. Region is implicit on this tab so it's
    // still present in the row (col 2) for paste-into-master scenarios.
    const sorted = regionCustomers.slice().sort((a, b) => {
      const na = usersById.get(a.ownerId)?.name ?? "";
      const nb = usersById.get(b.ownerId)?.name ?? "";
      if (na !== nb) return na.localeCompare(nb);
      return a.name.localeCompare(b.name);
    });

    const rows: (string | number)[][] = [
      PER_CUSTOMER_HEADER,
      ...sorted.map((c) => customerRowCells(c, monthKey, usersById)),
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [
      { wch: 9 },   // Month
      { wch: 12 },  // Region
      { wch: 18 },  // Rep
      { wch: 36 },  // Customer / Practice
      { wch: 9 },   // Type
      { wch: 14 },  // Doc-Type
      { wch: 16 },  // Status
      { wch: 10 },  // Timeline
      { wch: 12 },  // Expected $
      { wch: 9 },   // Close %
      { wch: 12 },  // Actual $
      { wch: 12 },  // Weighted $
      { wch: 11 },  // On-Track %
      { wch: 40 },  // Strategy Notes
    ];

    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(region, usedNames));
  }

  // ── Summary worksheet ────────────────────────────────────────────────────
  const summaryRows: (string | number)[][] = [];
  summaryRows.push(["── Summary ──"]);
  summaryRows.push([]);

  summaryRows.push(PER_REP_HEADER);
  const byRep = bucketByRep(customers);
  const repIdsSorted = Array.from(byRep.keys()).sort((a, b) => {
    const ua = usersById.get(a);
    const ub = usersById.get(b);
    const ra = ua?.region ?? "";
    const rb = ub?.region ?? "";
    if (ra !== rb) return ra.localeCompare(rb);
    return (ua?.name ?? "").localeCompare(ub?.name ?? "");
  });
  for (const repId of repIdsSorted) {
    summaryRows.push(
      repSummaryCells(repId, byRep.get(repId) ?? [], usersById, repForecasts)
    );
  }
  summaryRows.push([]);

  summaryRows.push(PER_REGION_HEADER);
  for (const region of regionNames) {
    summaryRows.push(regionSummaryCells(region, byRegion.get(region) ?? []));
  }
  summaryRows.push([]);

  summaryRows.push(grandTotalCells(customers));

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  summaryWs["!cols"] = [
    { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 14 },
    { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 18 },
  ];

  XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

// ── Browser download trigger ────────────────────────────────────────────────

export function downloadXlsx(filename: string, buffer: ArrayBuffer): void {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function xlsxFilenameFor(monthKey: string): string {
  return `NorisForecast_${monthKey}.xlsx`;
}
