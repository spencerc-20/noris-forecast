// lib/import/sheet2Parser.ts — Parse Sheet2 (product family breakdown) and derive DocType.
//
// Sheet2 format: multi-row per customer. Customer name only on first row of each block.
// Columns: Customer, Product Family, Obligo/Credit, State, Qty, Sales $, Pareto Sales, ...
// "Total" rows (Product Family === "Total" or empty) are skipped.
// Credit rows (Obligo/Credit === "credit") are skipped — only obligo rows counted.
//
// Product family groups (qty only — sales ignored for classification):
//   RA group   : Zygomatic Implant, Zygoma Drills, IMPLANTS PTERYFIT
//   TUFF group : Tuff, Tuff Pro Implant, Implants Tuff UniCon, Unicon Family
//   Other impl : MBI Implant, MBI N/C Implant, Mono Bendable, Mono Implants, Multi Unit
//   Tools/supply: everything else — ignored for classification
//
// REVAMP v2.0 doc-type rules (evaluated in order):
//   1. No implant units at all (only tools/courses/supplies)        → "other"
//   2. RA + TUFF both present:
//        raFraction >= 0.80                                          → "ra_only"
//        raFraction <= 0.15                                          → "full_arch"
//        otherwise (meaningful mix, neither dominates)               → "full_arch_ra"
//   3. TUFF only, no RA                                              → "full_arch"
//   4. RA only, no TUFF                                              → "ra_only"
//   5. Only Other implants (MBI/Mono/Multi Unit), no TUFF/RA         → "singles"
//
// "everything" is reserved for the heaviest mixed accounts. The classifier
// never auto-outputs it — Spencer assigns it manually (or via future threshold
// tuning on stored profileRatios).

import Papa from "papaparse";
import type { DocType } from "@/types";

// ── Product family classification sets ────────────────────────────────────────
// Keys are in LOWERCASE SANITIZED FORM — exactly as stored in Firebase after
// sanitizeFamilyKey(), but lowercased.  The classifier uses familyKey.toLowerCase()
// for direct lookup, avoiding the fragile normalizeFamily() reverse-transform.
//
// Actual stored keys (from Firebase survey of all 31 distinct keys, 2026-04-30):
//   RA    : Zygomatic_Implant  Zygoma_Drills  IMPLANTS_PTERYFIT
//   TUFF  : Tuff,_Tuff_TT  Tuff_Pro_Implant  Implants_Tuff_UniCon  Unicon_Family
//   Other : Multi_Unit  Mono_Implants  Mono_Bendable  MBI_N-C_Implant  MBI_Implant
//   Tools : everything else (Abutments, Healing_Caps, Screws, Transfers,_Ball_Attachments,_Ana,
//           Drills, Instruments, Kits_with_tools, Tools, Diamond_Burr, Empty_Cassettes,
//           Augma_Product, Shipping, Marketing_Warehouse, Default_part_family,
//           Plastic_for_Casting,_Locks, Dummy_Implants, Onyx_Implant, Cortical_Implant, …)

const RA_FAMILIES = new Set([
  "zygomatic_implant",
  "zygoma_drills",
  "implants_pteryfit",
]);

const TUFF_FAMILIES = new Set([
  "tuff,_tuff_tt",        // "Tuff, Tuff TT" → sanitised "Tuff,_Tuff_TT" → lower "tuff,_tuff_tt"
  "tuff_pro_implant",
  "implants_tuff_unicon",
  "unicon_family",
]);

const OTHER_IMPLANT_FAMILIES = new Set([
  "multi_unit",
  "mono_implants",
  "mono_bendable",
  "mbi_n-c_implant",      // "MBI N/C Implant" → sanitised "MBI_N-C_Implant" → lower "mbi_n-c_implant"
  "mbi_implant",
]);

// Everything else is treated as tools/supplies and ignored for profile classification.

// ── Thresholds (stored as ratios for Spencer to audit/tune) ───────────────────
// raFraction = raUnits / (tuffUnits + raUnits), only when BOTH > 0
//   >= 0.80 → ra_only       (RA dominant, handful of TUFFs)
//   <= 0.15 → full_arch     (TUFF dominant, only a couple RA)
//   else    → full_arch_ra  (both meaningful — the mixed bucket)
const RA_ONLY_THRESHOLD = 0.80;
const FULL_ARCH_THRESHOLD = 0.15;

// ── Helper types ─────────────────────────────────────────────────────────────

/** Raw unit/ratio breakdown stored on each customer for auditing and threshold tuning. */
export interface ProfileRatios {
  tuffUnits: number;
  raUnits: number;
  otherUnits: number;
  /** tuffUnits as % of total clinical units (0–100, integer) */
  tuffPct: number;
  /** raUnits as % of total clinical units (0–100, integer) */
  raPct: number;
  /** otherUnits as % of total clinical units (0–100, integer) */
  otherPct: number;
}

/** Parsed per-family numbers from a Sheet2 row — stored on the customer. */
export type ProductFamilyBreakdown = Record<string, { qty: number; sales: number }>;

export interface CustomerProductSummary {
  /** Customer name as it appears in Sheet2 */
  customerName: string;
  state: string;
  /** Per-family obligo totals: { "Zygomatic_Implant": { qty: 2, sales: 14000 }, ... } */
  productFamilyBreakdown: ProductFamilyBreakdown;
  /** Derived doc-type from REVAMP v2.0 TUFF/RA majority logic */
  docType: DocType;
  /** Raw unit counts and percentages for auditing/threshold tuning */
  profileRatios: ProfileRatios;
}

// ── Key sanitization (Firebase-safe keys) ────────────────────────────────────

/**
 * Sanitize a product family name for use as a Firebase Realtime Database key.
 * Firebase forbids: . # $ [ ] and / (path separator).
 * Strategy: / → hyphen, everything else forbidden + spaces → underscore.
 * Example: "MBI N/C Implant" → "MBI_N-C_Implant"
 */
function sanitizeFamilyKey(name: string): string {
  return name
    .replace(/\//g, "-")         // path separator → hyphen (preserves readability)
    .replace(/[.#$[\] ]/g, "_"); // . # $ [ ] and spaces → underscore
}

/**
 * Normalize a (possibly sanitized) family key for set-membership lookups.
 * Converts underscores and hyphens back to spaces so sanitized keys still
 * match the RA_FAMILIES / TUFF_FAMILIES / etc. sets.
 * E.g. "MBI_N-C_Implant" → "mbi n c implant" → matches OTHER_IMPLANT_FAMILIES ✓
 */
function normalizeFamily(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[_-]/g, " ") // reverse sanitization: _ and - → space
    .replace(/\s+/g, " ")
    .trim();
}

// ── Doc-type derivation ───────────────────────────────────────────────────────

/**
 * Derive DocType and ProfileRatios from per-family qty breakdown.
 * Uses obligo qty only (credit rows are stripped at parse time).
 * See REVAMP_SPEC v2.0 — never auto-outputs "everything" (reserved for manual assignment).
 */
export function deriveDocTypeAndRatios(
  breakdown: ProductFamilyBreakdown
): { docType: DocType; profileRatios: ProfileRatios } {
  let tuffUnits = 0;
  let raUnits = 0;
  let otherUnits = 0;

  for (const [familyKey, { qty }] of Object.entries(breakdown)) {
    // Use familyKey.toLowerCase() directly — the family sets contain lowercase sanitized keys
    // (e.g. "tuff,_tuff_tt") so we avoid the fragile normalizeFamily() path where commas
    // and other non-space/underscore chars survive and cause silent mismatches.
    const lowerKey = familyKey.toLowerCase();
    if (RA_FAMILIES.has(lowerKey))               raUnits += qty;
    else if (TUFF_FAMILIES.has(lowerKey))         tuffUnits += qty;
    else if (OTHER_IMPLANT_FAMILIES.has(lowerKey)) otherUnits += qty;
    // else: tools/supplies — not counted in clinical units
  }

  const totalClinical = tuffUnits + raUnits + otherUnits;

  // Percentages as 0–100 integers (round-trip safe for Firebase)
  const tuffPct = totalClinical > 0 ? Math.round((tuffUnits / totalClinical) * 100) : 0;
  const raPct   = totalClinical > 0 ? Math.round((raUnits   / totalClinical) * 100) : 0;
  const otherPct = totalClinical > 0 ? Math.round((otherUnits / totalClinical) * 100) : 0;

  const profileRatios: ProfileRatios = { tuffUnits, raUnits, otherUnits, tuffPct, raPct, otherPct };

  let docType: DocType;

  if (totalClinical === 0) {
    // Rule 1: No implant units at all — tools / courses / supplies only.
    docType = "other";
  } else if (tuffUnits > 0 && raUnits > 0) {
    // Rule 2: RA + TUFF both present — split by majority.
    const raFraction = raUnits / (tuffUnits + raUnits);
    if (raFraction >= RA_ONLY_THRESHOLD)        docType = "ra_only";
    else if (raFraction <= FULL_ARCH_THRESHOLD) docType = "full_arch";
    else                                        docType = "full_arch_ra";
  } else if (tuffUnits > 0) {
    // Rule 3: TUFF only.
    docType = "full_arch";
  } else if (raUnits > 0) {
    // Rule 4: RA only.
    docType = "ra_only";
  } else {
    // Rule 5: Only Other implants (MBI / Mono / Multi Unit), no TUFF / RA.
    docType = "singles";
  }

  return { docType, profileRatios };
}

// ── Shared row processor ──────────────────────────────────────────────────────

/**
 * Apply one parsed CSV row to the running customer state.
 * Mutates `summaries` and returns the (possibly updated) `current` customer.
 * Note: docType/profileRatios are placeholder until finalizeDocTypes() is called.
 */
function applyRow(
  row: Record<string, string>,
  summaries: CustomerProductSummary[],
  current: CustomerProductSummary | null
): CustomerProductSummary | null {
  const rawCustomer = (row["Customer"] ?? "").trim();
  const rawFamily   = (row["Product Family"] ?? "").trim();
  const state       = (row["State"] ?? "").trim().toUpperCase();

  if (rawCustomer) {
    if (current) summaries.push(current);
    // Skip DO NOT USE customers
    if (/\bdo\s+not\s+use\b/i.test(rawCustomer)) return null;
    return {
      customerName: rawCustomer,
      state,
      productFamilyBreakdown: {},
      docType: "other",
      profileRatios: { tuffUnits: 0, raUnits: 0, otherUnits: 0, tuffPct: 0, raPct: 0, otherPct: 0 },
    };
  }

  if (!current) return null;

  // Skip Total rows and rows with no product family
  if (!rawFamily || rawFamily.toLowerCase() === "total") return current;

  // Skip pure credit rows — obligo = order, credit = return
  const oc = (row["Obligo/Credit"] ?? "").toLowerCase().trim();
  if (oc === "credit") return current;

  // Accumulate qty + sales per family.
  // Key is sanitized for Firebase (no . # $ [ ] /); normalizeFamily() reverses
  // sanitization so deriveDocTypeAndRatios() still matches the known family sets.
  const familyKey = sanitizeFamilyKey(rawFamily);
  const qty   = parseCellNumber(row["Qty"]);
  const sales = parseCellNumber(row["Sales $"]);

  if (!current.productFamilyBreakdown[familyKey]) {
    current.productFamilyBreakdown[familyKey] = { qty: 0, sales: 0 };
  }
  current.productFamilyBreakdown[familyKey].qty   += qty;
  current.productFamilyBreakdown[familyKey].sales += sales;
  return current;
}

/** Parse a numeric value from a CSV cell — strips $, commas, whitespace. */
function parseCellNumber(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[$,\s]/g, "");
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : 0;
}

function finalizeDocTypes(summaries: CustomerProductSummary[]): void {
  for (const summary of summaries) {
    const { docType, profileRatios } = deriveDocTypeAndRatios(summary.productFamilyBreakdown);
    summary.docType = docType;
    summary.profileRatios = profileRatios;
  }
}

// ── Synchronous parser (kept for non-browser contexts, e.g. scripts/) ─────────

/** Parse Sheet2 CSV into per-customer product summaries (synchronous). */
export function parseSheet2(csvText: string): CustomerProductSummary[] {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: false,
    transformHeader: (h) => h.trim(),
  });

  const summaries: CustomerProductSummary[] = [];
  let current: CustomerProductSummary | null = null;
  for (const row of data) current = applyRow(row, summaries, current);
  if (current) summaries.push(current);
  finalizeDocTypes(summaries);
  return summaries;
}

// ── Async streaming parser (for browser use — keeps UI responsive) ─────────────

/**
 * Async version of parseSheet2. Uses PapaParse's chunk API with pause/resume so
 * the browser event loop gets control between 64 KB chunks — preventing the main
 * thread from freezing on large files (≥ 10 MB / 100 k rows).
 *
 * Calls onProgress(parsedRows, estimatedTotalRows) after every chunk.
 * Use in browser code; fall back to parseSheet2 in Node scripts.
 */
export function parseSheet2Async(
  csvText: string,
  onProgress?: (parsed: number, total: number) => void
): Promise<CustomerProductSummary[]> {
  // Fast newline count for progress denominator (~5 ms for 10 MB)
  const estimatedTotal = (csvText.match(/\n/g) ?? []).length;

  return new Promise<CustomerProductSummary[]>((resolve, reject) => {
    const summaries: CustomerProductSummary[] = [];
    let current: CustomerProductSummary | null = null;
    let rowsProcessed = 0;

    Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: false,
      transformHeader: (h) => h.trim(),
      // 64 KB per chunk → ~320–640 rows/chunk at typical row sizes.
      // Balances throughput vs how often we yield to the event loop.
      chunkSize: 1024 * 64,

      chunk(results: Papa.ParseResult<Record<string, string>>, parser: Papa.Parser) {
        // Pause before processing so we hold the slot open for resume().
        parser.pause();
        for (const row of results.data) {
          current = applyRow(row, summaries, current);
          rowsProcessed++;
        }
        onProgress?.(rowsProcessed, estimatedTotal);
        // Yield to the event loop (lets React re-render the progress counter),
        // then continue with the next chunk.
        setTimeout(() => parser.resume(), 0);
      },

      complete() {
        if (current) summaries.push(current);
        finalizeDocTypes(summaries);
        onProgress?.(estimatedTotal, estimatedTotal);
        resolve(summaries);
      },

      error(err: Error) {
        reject(err);
      },
    });
  });
}
