// lib/import/sheet2Parser.ts — Parse Sheet2 (product family breakdown) and derive CustomerProfile.
//
// Sheet2 format: multi-row per customer. Customer name only on first row of each block.
// Columns: Customer, Product Family, Obligo/Credit, State, Qty, Sales $, Pareto Sales, ...
// "Total" rows (Product Family === "Total" or empty) are skipped.
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

function normalizeFamily(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, " ").trim();
}

function deriveProfile(productFamilies: Set<string>): CustomerProfile {
  let hasZygo = false;
  let hasPtery = false;
  let hasFullArch = false;
  let hasStandard = false;
  let hasClinical = false;

  for (const family of productFamilies) {
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

export interface CustomerProductSummary {
  /** Customer name as it appears in Sheet2 */
  customerName: string;
  state: string;
  productFamilies: Set<string>;
  profile: CustomerProfile;
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
      current = {
        customerName: rawCustomer,
        state,
        productFamilies: new Set(),
        profile: "new",
      };
    }

    if (!current) continue;

    // Skip Total rows and credit-only rows (we care about what they buy, not returns)
    if (!rawFamily || rawFamily.toLowerCase() === "total") continue;

    // Skip pure credit rows — obligo = order, credit = return
    const obligoCredit = (row["Obligo/Credit"] ?? "").toLowerCase().trim();
    if (obligoCredit === "credit") continue;

    // Skip DO NOT USE customers
    if (/\bdo\s+not\s+use\b/i.test(rawCustomer)) {
      current = null;
      continue;
    }

    current.productFamilies.add(rawFamily);
  }

  if (current) summaries.push(current);

  // Derive profile for each customer
  for (const summary of summaries) {
    summary.profile = deriveProfile(summary.productFamilies);
  }

  return summaries;
}
