// lib/forecast/regionConfig.ts — Territory seed data and region helpers.
// TERRITORY_SEED is the initial data written to Firebase on first Admin load.
// After seeding, all territory edits go through Firebase (Admin → Territory Map tab).
// STATE_TO_REGION is kept as a lightweight region-only fallback for UI labeling.

// ── Seed data type ────────────────────────────────────────────────────────────

export interface TerritorySeedEntry {
  territory: string;       // Display name matching CSV "territory" values
  region: string;          // Team label
  repName: string | null;  // Matched to AppUser.name on seed; null = Open territory
  stateCode?: string;      // 2-letter state code for import fallback matching
  notes?: string;
}

// ── Territory seed ────────────────────────────────────────────────────────────
// Source: "Territory Allocation 2026.xlsx – General" (imported 2026-04-27)
// Ambiguous states (multiple non-null repIds for the same stateCode) are flagged
// Unassigned by the bulk importer so admins can manually assign them.
//
// INSIDE — Charlotte L: AZ, DC, MD, MN, VA, WY
// INSIDE — Spencer: CT, ME, NH, RI, VT, WA
// INSIDE — Emma: AL, CO, HI, ID, MI, MS, ND, UT
// INSIDE — Suzanne: AK, DE, IA, KS, LA, NE, SD
// INSIDE — Michelle: AR, IN, MT, NM, OK, OR, WV, WI, PR
// TX — Kaylie G: Dallas. Austin / Houston / San Antonio = Open
// EAST — Ivan: FL; Tara: NC, SC + specific VA accounts (ambiguous with Charlotte L)
// CENTRAL — Misha: GA; Sam: IL, MO; Beka: KY; Nick: OH; Shaun: TN
// EILEEN — Ben: MA; Eileen: NJ, NY (incl. Long Island); Malcom: PA
// CALIFORNIA — Brent: NE CA; Roei: S CA; Jennifer: NV. CA is ambiguous (2 reps).
// CANADA — Open pending rep assignment

export const TERRITORY_SEED: TerritorySeedEntry[] = [
  // ── INSIDE — Charlotte L ─────────────────────────────────────────────────
  { territory: "Arizona",    region: "INSIDE", repName: "Charlotte L", stateCode: "AZ" },
  { territory: "DC",         region: "INSIDE", repName: "Charlotte L", stateCode: "DC" },
  { territory: "Maryland",   region: "INSIDE", repName: "Charlotte L", stateCode: "MD" },
  { territory: "Minnesota",  region: "INSIDE", repName: "Charlotte L", stateCode: "MN" },
  { territory: "Virginia",   region: "INSIDE", repName: "Charlotte L", stateCode: "VA",
    notes: "Primary VA rep (INSIDE). Tara handles select EAST accounts — VA is ambiguous on bulk import." },
  { territory: "Wyoming",    region: "INSIDE", repName: "Charlotte L", stateCode: "WY" },

  // ── INSIDE — Spencer ─────────────────────────────────────────────────────
  { territory: "Connecticut",   region: "INSIDE", repName: "Spencer", stateCode: "CT" },
  { territory: "Maine",         region: "INSIDE", repName: "Spencer", stateCode: "ME" },
  { territory: "New Hampshire", region: "INSIDE", repName: "Spencer", stateCode: "NH" },
  { territory: "Rhode Island",  region: "INSIDE", repName: "Spencer", stateCode: "RI" },
  { territory: "Vermont",       region: "INSIDE", repName: "Spencer", stateCode: "VT" },
  { territory: "Washington",    region: "INSIDE", repName: "Spencer", stateCode: "WA" },

  // ── INSIDE — Emma ────────────────────────────────────────────────────────
  { territory: "Alabama",      region: "INSIDE", repName: "Emma", stateCode: "AL" },
  { territory: "Colorado",     region: "INSIDE", repName: "Emma", stateCode: "CO" },
  { territory: "Hawaii",       region: "INSIDE", repName: "Emma", stateCode: "HI" },
  { territory: "Idaho",        region: "INSIDE", repName: "Emma", stateCode: "ID" },
  { territory: "Michigan",     region: "INSIDE", repName: "Emma", stateCode: "MI" },
  { territory: "Mississippi",  region: "INSIDE", repName: "Emma", stateCode: "MS" },
  { territory: "North Dakota", region: "INSIDE", repName: "Emma", stateCode: "ND" },
  { territory: "Utah",         region: "INSIDE", repName: "Emma", stateCode: "UT" },

  // ── INSIDE — Suzanne ─────────────────────────────────────────────────────
  { territory: "Alaska",       region: "INSIDE", repName: "Suzanne", stateCode: "AK" },
  { territory: "Delaware",     region: "INSIDE", repName: "Suzanne", stateCode: "DE" },
  { territory: "Iowa",         region: "INSIDE", repName: "Suzanne", stateCode: "IA" },
  { territory: "Kansas",       region: "INSIDE", repName: "Suzanne", stateCode: "KS" },
  { territory: "Louisiana",    region: "INSIDE", repName: "Suzanne", stateCode: "LA" },
  { territory: "Nebraska",     region: "INSIDE", repName: "Suzanne", stateCode: "NE" },
  { territory: "South Dakota", region: "INSIDE", repName: "Suzanne", stateCode: "SD" },

  // ── INSIDE — Michelle ────────────────────────────────────────────────────
  { territory: "Arkansas",     region: "INSIDE", repName: "Michelle", stateCode: "AR" },
  { territory: "Indiana",      region: "INSIDE", repName: "Michelle", stateCode: "IN" },
  { territory: "Montana",      region: "INSIDE", repName: "Michelle", stateCode: "MT" },
  { territory: "New Mexico",   region: "INSIDE", repName: "Michelle", stateCode: "NM" },
  { territory: "Oklahoma",     region: "INSIDE", repName: "Michelle", stateCode: "OK" },
  { territory: "Oregon",       region: "INSIDE", repName: "Michelle", stateCode: "OR" },
  { territory: "West Virginia",region: "INSIDE", repName: "Michelle", stateCode: "WV" },
  { territory: "Wisconsin",    region: "INSIDE", repName: "Michelle", stateCode: "WI" },
  { territory: "Puerto Rico",  region: "INSIDE", repName: "Michelle", stateCode: "PR" },

  // ── TX ───────────────────────────────────────────────────────────────────
  // TX is ambiguous on bulk import (mixed non-null + null entries for same stateCode)
  { territory: "Dallas, TX",       region: "TX", repName: "Kaylie G", stateCode: "TX" },
  { territory: "Austin, TX",       region: "TX", repName: null,       stateCode: "TX",
    notes: "Open territory — assign manually" },
  { territory: "Houston, TX",      region: "TX", repName: null,       stateCode: "TX",
    notes: "Open territory — assign manually" },
  { territory: "San Antonio, TX",  region: "TX", repName: null,       stateCode: "TX",
    notes: "Open territory — assign manually" },

  // ── EAST ─────────────────────────────────────────────────────────────────
  { territory: "Florida",                  region: "EAST", repName: "Ivan", stateCode: "FL" },
  { territory: "North Carolina",           region: "EAST", repName: "Tara", stateCode: "NC" },
  { territory: "South Carolina",           region: "EAST", repName: "Tara", stateCode: "SC" },
  { territory: "Virginia (Tara accounts)", region: "EAST", repName: "Tara", stateCode: "VA",
    notes: "Roanoke oral surgery + Paradigm-P3 locations. VA is ambiguous — bulk import → Unassigned." },

  // ── CENTRAL ──────────────────────────────────────────────────────────────
  { territory: "Georgia",   region: "CENTRAL", repName: "Misha", stateCode: "GA" },
  { territory: "Illinois",  region: "CENTRAL", repName: "Sam",   stateCode: "IL" },
  { territory: "Kentucky",  region: "CENTRAL", repName: "Beka",  stateCode: "KY" },
  { territory: "Missouri",  region: "CENTRAL", repName: "Sam",   stateCode: "MO" },
  { territory: "Ohio",      region: "CENTRAL", repName: "Nick",  stateCode: "OH" },
  { territory: "Tennessee", region: "CENTRAL", repName: "Shaun", stateCode: "TN" },

  // ── EILEEN (Northeast) ───────────────────────────────────────────────────
  { territory: "Massachusetts", region: "EILEEN", repName: "Ben",    stateCode: "MA" },
  { territory: "New Jersey",    region: "EILEEN", repName: "Eileen", stateCode: "NJ" },
  { territory: "New York",      region: "EILEEN", repName: "Eileen", stateCode: "NY" },
  { territory: "Long Island",   region: "EILEEN", repName: "Eileen", stateCode: "NY",
    notes: "Long Island is part of NY state; both entries map to Eileen." },
  { territory: "Pennsylvania",  region: "EILEEN", repName: "Malcom", stateCode: "PA" },

  // ── CALIFORNIA ───────────────────────────────────────────────────────────
  // CA is ambiguous on bulk import (2 reps for same stateCode)
  { territory: "North East California", region: "CALIFORNIA", repName: "Brent", stateCode: "CA" },
  { territory: "South California",      region: "CALIFORNIA", repName: "Roei",  stateCode: "CA" },
  { territory: "Nevada",                region: "CALIFORNIA", repName: "Jennifer", stateCode: "NV" },

  // ── CANADA ───────────────────────────────────────────────────────────────
  { territory: "Canada", region: "CANADA", repName: null,
    notes: "Canada territory — assign rep when ready" },
];

// ── Region helpers ────────────────────────────────────────────────────────────

/** All distinct region names used across the app (dropdowns, filters, badges). */
export const ALL_REGIONS = [
  "INSIDE",
  "TX",
  "EAST",
  "CENTRAL",
  "EILEEN",
  "CALIFORNIA",
  "CANADA",
] as const;

export type NorisRegion = (typeof ALL_REGIONS)[number];

/**
 * Lightweight state→region map for UI labeling (e.g. on customer records).
 * This is NOT used for CSV import rep assignment — that derives from Firebase territories.
 * Virginia defaults to INSIDE here; EAST overlap is handled on the customer record.
 */
export const STATE_TO_REGION: Record<string, string> = {
  // INSIDE
  AL: "INSIDE", AK: "INSIDE", AZ: "INSIDE", AR: "INSIDE", CO: "INSIDE",
  CT: "INSIDE", DC: "INSIDE", DE: "INSIDE", HI: "INSIDE", ID: "INSIDE",
  IN: "INSIDE", IA: "INSIDE", KS: "INSIDE", LA: "INSIDE", ME: "INSIDE",
  MD: "INSIDE", MI: "INSIDE", MN: "INSIDE", MS: "INSIDE", MT: "INSIDE",
  NE: "INSIDE", NH: "INSIDE", NM: "INSIDE", ND: "INSIDE", OK: "INSIDE",
  OR: "INSIDE", RI: "INSIDE", SD: "INSIDE", UT: "INSIDE", VT: "INSIDE",
  VA: "INSIDE", WA: "INSIDE", WV: "INSIDE", WI: "INSIDE", WY: "INSIDE",
  PR: "INSIDE",
  // TX
  TX: "TX",
  // EAST
  FL: "EAST", NC: "EAST", SC: "EAST",
  // CENTRAL
  GA: "CENTRAL", IL: "CENTRAL", KY: "CENTRAL", MO: "CENTRAL",
  OH: "CENTRAL", TN: "CENTRAL",
  // EILEEN
  MA: "EILEEN", NJ: "EILEEN", NY: "EILEEN", PA: "EILEEN",
  // CALIFORNIA
  CA: "CALIFORNIA", NV: "CALIFORNIA",
};

/**
 * Returns the Noris region for a 2-letter US state/territory code.
 * Returns null if the code is not in the map.
 */
export function regionForState(state: string): string | null {
  const normalized = state.toUpperCase().trim();
  return STATE_TO_REGION[normalized] ?? null;
}
