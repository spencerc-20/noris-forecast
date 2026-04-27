// lib/forecast/regionConfig.ts — State-to-region mapping for Noris Medical territories.
// PLACEHOLDER VALUES — Spencer to provide actual region assignments before Session 2.
// When a state is not in the map, customers are assigned region "Unassigned" (not an error).

export const STATE_TO_REGION: Record<string, string> = {
  // TODO: replace with actual Noris region mapping (Spencer has CSV/list)
  AL: "Unassigned",
  AK: "Unassigned",
  AZ: "Unassigned",
  AR: "Unassigned",
  CA: "Unassigned",
  CO: "Unassigned",
  CT: "Unassigned",
  DE: "Unassigned",
  FL: "Unassigned",
  GA: "Unassigned",
  HI: "Unassigned",
  ID: "Unassigned",
  IL: "Unassigned",
  IN: "Unassigned",
  IA: "Unassigned",
  KS: "Unassigned",
  KY: "Unassigned",
  LA: "Unassigned",
  ME: "Unassigned",
  MD: "Unassigned",
  MA: "Unassigned",
  MI: "Unassigned",
  MN: "Unassigned",
  MS: "Unassigned",
  MO: "Unassigned",
  MT: "Unassigned",
  NE: "Unassigned",
  NV: "Unassigned",
  NH: "Unassigned",
  NJ: "Unassigned",
  NM: "Unassigned",
  NY: "Unassigned",
  NC: "Unassigned",
  ND: "Unassigned",
  OH: "Unassigned",
  OK: "Unassigned",
  OR: "Unassigned",
  PA: "Unassigned",
  RI: "Unassigned",
  SC: "Unassigned",
  SD: "Unassigned",
  TN: "Unassigned",
  TX: "Unassigned",
  UT: "Unassigned",
  VT: "Unassigned",
  VA: "Unassigned",
  WA: "Unassigned",
  WV: "Unassigned",
  WI: "Unassigned",
  WY: "Unassigned",
  DC: "Unassigned",
};

/**
 * Returns the Noris region for a US state code, or null if the state is not recognized.
 * Unrecognized states should be flagged for admin review — they are not an error.
 */
export function regionForState(state: string): string | null {
  const normalized = state.toUpperCase().trim();
  return STATE_TO_REGION[normalized] ?? null;
}
