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

/** Parse Sheet2 CSV into per-customer product summaries. */
export function parseSheet2(csvText: string): CustomerProductSummary[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: false, // keep empty rows — customer name appears only on first row per block
    transformHeader: (h) => h.trim(),
  });

  const summaries: CustomerProductSummary[] = [];
  let current: CustomerProductSummary | null = null;

  for (const row of result.data) {
    const rawCustomer = (row["Customer"] ?? "").trim();
    const rawFamily = (row["Product Family"] ?? "").trim();
    const state = (row["State"] ?? "").trim().toUpperCase();

    // New customer block
    if (rawCustomer) {
      if (current) summaries.push(current);

      // Skip DO NOT USE customers
      if (/\bdo\s+not\s+use\b/i.test(rawCustomer)) {
        current = null;
        continue;
      }

      current = {
        customerName: rawCustomer,
        state,
        productFamilyBreakdown: {},
        profile: "new",
      };
    }

    if (!current) continue;

    // Skip Total rows and rows with no product family
    if (!rawFamily || rawFamily.toLowerCase() === "total") continue;

    // Skip pure credit rows — obligo = order, credit = return
    const obligoCredit = (row["Obligo/Credit"] ?? "").toLowerCase().trim();
    if (obligoCredit === "credit") continue;

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
  }

  if (current) summaries.push(current);

  // Derive profile for each customer from their breakdown
  for (const summary of summaries) {
    summary.profile = deriveProfile(summary.productFamilyBreakdown);
  }

  return summaries;
}
