// lib/import/sheet2Parser.ts — Parse Sheet2 (product family breakdown) and derive CustomerProfile.
//
// Sheet2 format: multi-row per customer. Customer name only on first row of each block.
// Columns: Customer, Product Family, Obligo/Credit, State, Qty, Sales $, Pareto Sales, ...
// "Total" rows (Product Family === "Total" or empty) are skipped.
// Credit rows (Obligo/Credit === "credit") are skipped — only obligo rows counted.
//
// Profile derivation from Noris Medical product families (conservative, never over-inflates):
//   Zygomatic Implant / Zygoma Drills + any full-arch implant → everything
//   Zygomatic Implant / Zygoma Drills / IMPLANTS PTERYFIT (alone) → ra_only
//   Multi Unit / Tuff / Tuff TT / UniCon / Mono Bendable → full_arch
//   Mono Implants / Abutments / Healing Caps / standard implant families → standard
//   Only tools/instruments/shipping/drills/credits → tools_only

import Papa from "papaparse";
import type { CustomerProfile } from "@/types";

const ZYGO_FAMILIES = new Set([
  "zygomatic implant",
  "zygoma drills",
  "zygomatic",
]);

const PTERY_FAMILIES = new Set([
  "implants pteryfit",
  "pteryfit",
  "pterygoid",
]);

const FULL_ARCH_FAMILIES = new Set([
  "multi unit",
  "tuff, tuff tt",
  "tuff",
  "implants tuff unicon",
  "unicon family",
  "mono bendable",
]);

const STANDARD_FAMILIES = new Set([
  "mono implants",
  "abutments",
  "healing caps",
  "transfers, ball attachments, ana",
  "dummy implants",
  "implants",
]);

const TOOLS_ONLY_FAMILIES = new Set([
  "tools",
  "instruments",
  "drills",
  "shipping",
  "default part family",
]);

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
 * match the ZYGO_FAMILIES / FULL_ARCH_FAMILIES / etc. sets.
 */
function normalizeFamily(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[_-]/g, " ") // reverse sanitization: _ and - → space
    .replace(/\s+/g, " ")
    .trim();
}

/** Derive a CustomerProfile from per-family qty+sales breakdown (obligo only). */
function deriveProfile(
  breakdown: Record<string, { qty: number; sales: number }>
): CustomerProfile {
  let hasZygo = false;
  let hasPtery = false;
  let hasFullArch = false;
  let hasStandard = false;
  let hasClinical = false;

  for (const family of Object.keys(breakdown)) {
    const normalized = normalizeFamily(family);
    if (ZYGO_FAMILIES.has(normalized)) { hasZygo = true; hasClinical = true; }
    else if (PTERY_FAMILIES.has(normalized)) { hasPtery = true; hasClinical = true; }
    else if (FULL_ARCH_FAMILIES.has(normalized)) { hasFullArch = true; hasClinical = true; }
    else if (STANDARD_FAMILIES.has(normalized)) { hasStandard = true; hasClinical = true; }
    else if (!TOOLS_ONLY_FAMILIES.has(normalized)) {
      // Unknown family — count as standard rather than dropping
      hasClinical = true;
    }
  }

  const hasZygoPtery = hasZygo || hasPtery;

  if (hasZygoPtery && hasFullArch) return "everything";
  if (hasZygoPtery) return "ra_only";
  if (hasFullArch) return "full_arch";
  if (hasStandard) return "standard";
  if (hasClinical) return "standard"; // unknown clinical family
  return "tools_only";
}

/** Parsed per-family numbers from a Sheet2 row — stored on the customer. */
export type ProductFamilyBreakdown = Record<string, { qty: number; sales: number }>;

export interface CustomerProductSummary {
  /** Customer name as it appears in Sheet2 */
  customerName: string;
  state: string;
  /** Per-family obligo totals: { "Zygomatic Implant": { qty: 2, sales: 14000 }, ... } */
  productFamilyBreakdown: ProductFamilyBreakdown;
  /** Highest procedure profile tier derived from productFamilyBreakdown */
  profile: CustomerProfile;
}

/** Parse a numeric value from a CSV cell — strips $, commas, whitespace. */
function parseCellNumber(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[$,\s]/g, "");
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : 0;
}

// ── Shared row processor (used by both sync and async parsers) ────────────────

/**
 * Apply one parsed CSV row to the running customer state.
 * Mutates `summaries` and returns the (possibly updated) `current` customer.
 */
function applyRow(
  row: Record<string, string>,
  summaries: CustomerProductSummary[],
  current: CustomerProductSummary | null
): CustomerProductSummary | null {
  const rawCustomer = (row["Customer"] ?? "").trim();
  const rawFamily = (row["Product Family"] ?? "").trim();
  const state = (row["State"] ?? "").trim().toUpperCase();

  if (rawCustomer) {
    if (current) summaries.push(current);
    // Skip DO NOT USE customers
    if (/\bdo\s+not\s+use\b/i.test(rawCustomer)) return null;
    return { customerName: rawCustomer, state, productFamilyBreakdown: {}, profile: "new" };
  }

  if (!current) return null;

  // Skip Total rows and rows with no product family
  if (!rawFamily || rawFamily.toLowerCase() === "total") return current;

  // Skip pure credit rows — obligo = order, credit = return
  const oc = (row["Obligo/Credit"] ?? "").toLowerCase().trim();
  if (oc === "credit") return current;

  // Accumulate qty + sales per family.
  // Key is sanitized for Firebase (no . # $ [ ] /); normalizeFamily() reverses
  // sanitization so deriveProfile() still matches the known family sets.
  const familyKey = sanitizeFamilyKey(rawFamily);
  const qty = parseCellNumber(row["Qty"]);
  const sales = parseCellNumber(row["Sales $"]);

  if (!current.productFamilyBreakdown[familyKey]) {
    current.productFamilyBreakdown[familyKey] = { qty: 0, sales: 0 };
  }
  current.productFamilyBreakdown[familyKey].qty += qty;
  current.productFamilyBreakdown[familyKey].sales += sales;
  return current;
}

function finalizeProfiles(summaries: CustomerProductSummary[]): void {
  for (const summary of summaries) {
    summary.profile = deriveProfile(summary.productFamilyBreakdown);
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
  finalizeProfiles(summaries);
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
        finalizeProfiles(summaries);
        onProgress?.(estimatedTotal, estimatedTotal);
        resolve(summaries);
      },

      error(err: Error) {
        reject(err);
      },
    });
  });
}
