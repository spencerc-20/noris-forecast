// lib/forecast/regionConfig.ts — State-to-region mapping for Noris Medical territories.
// Source: "Territory Allocation 2026.xlsx - General.csv" imported 2026-04-27.
// Regions match the "Team" column in the spreadsheet: INSIDE, TX, EAST, CENTRAL, EILEEN, CALIFORNIA.
// Edit via Admin → State→Region tab; this file is the code-level default/fallback.
//
// Notes from source data:
// - Virginia: Charlotte L (INSIDE) covers the full state; Tara (EAST) handles specific accounts
//   (Roanoke oral surgery, Paradigm-P3 locations). State-level default = INSIDE.
//   Account-level overrides are set on the customer record.
// - Texas: TX team covers specific cities (Austin, Dallas, Houston, San Antonio).
//   All TX state code → "TX" region.
// - California: Split between Brent (NE CA) and Roei (S CA) — same CALIFORNIA team.
// - Nevada: Assigned to CALIFORNIA team (Jennifer).
// - Puerto Rico (PR): Assigned to INSIDE (Michelle).
// - DC: Assigned to INSIDE (Charlotte L).

export const STATE_TO_REGION: Record<string, string> = {
  // INSIDE team
  AL: "INSIDE", // Emma
  AK: "INSIDE", // Suzanne
  AZ: "INSIDE", // Charlotte L
  AR: "INSIDE", // Michelle
  CO: "INSIDE", // Emma
  CT: "INSIDE", // Spencer
  DC: "INSIDE", // Charlotte L
  DE: "INSIDE", // Suzanne
  HI: "INSIDE", // Emma
  ID: "INSIDE", // Emma
  IN: "INSIDE", // Michelle
  IA: "INSIDE", // Suzanne
  KS: "INSIDE", // Suzanne
  LA: "INSIDE", // Suzanne
  ME: "INSIDE", // Spencer
  MD: "INSIDE", // Charlotte L
  MI: "INSIDE", // Emma
  MN: "INSIDE", // Charlotte L
  MS: "INSIDE", // Emma
  MT: "INSIDE", // Michelle
  NE: "INSIDE", // Suzanne
  NH: "INSIDE", // Spencer
  NM: "INSIDE", // Michelle
  ND: "INSIDE", // Emma
  OK: "INSIDE", // Michelle
  OR: "INSIDE", // Michelle
  RI: "INSIDE", // Spencer
  SD: "INSIDE", // Suzanne
  UT: "INSIDE", // Emma
  VT: "INSIDE", // Spencer
  VA: "INSIDE", // Charlotte L (primary; some accounts belong to EAST — override on customer record)
  WA: "INSIDE", // Spencer
  WV: "INSIDE", // Michelle
  WI: "INSIDE", // Michelle
  WY: "INSIDE", // Charlotte L
  PR: "INSIDE", // Michelle (Puerto Rico)

  // TX team
  TX: "TX", // Open / Kaylie G — covers Austin, Dallas, Houston, San Antonio

  // EAST team
  FL: "EAST", // Ivan
  NC: "EAST", // Tara
  SC: "EAST", // Tara

  // CENTRAL team
  GA: "CENTRAL", // Misha
  IL: "CENTRAL", // Sam
  KY: "CENTRAL", // Beka
  MO: "CENTRAL", // Sam
  OH: "CENTRAL", // Nick (RM)
  TN: "CENTRAL", // Shaun

  // EILEEN team (Northeast)
  MA: "EILEEN", // Ben
  NJ: "EILEEN", // Eileen
  NY: "EILEEN", // Eileen (includes Long Island)
  PA: "EILEEN", // Malcom

  // CALIFORNIA team
  CA: "CALIFORNIA", // Brent (NE CA) + Roei (S CA)
  NV: "CALIFORNIA", // Jennifer
};

/**
 * Returns the Noris region for a 2-letter US state/territory code.
 * Returns null if the code is not in the map — caller should flag for admin review.
 */
export function regionForState(state: string): string | null {
  const normalized = state.toUpperCase().trim();
  return STATE_TO_REGION[normalized] ?? null;
}

/** All distinct region names, for use in dropdowns and filter lists. */
export const ALL_REGIONS = [
  "INSIDE",
  "TX",
  "EAST",
  "CENTRAL",
  "EILEEN",
  "CALIFORNIA",
] as const;

export type NorisRegion = (typeof ALL_REGIONS)[number];
