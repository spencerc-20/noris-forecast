// types/territory.ts — Territory entry stored at forecast_v1/config/territories.
// Each entry maps a named territory to a rep and region.
// repId: null means the territory is Open (no assigned rep → Unassigned on import).
// stateCode: optional 2-letter code used as a fallback for CSV state→rep resolution.

export interface TerritoryEntry {
  id: string;           // Firebase push key
  territory: string;    // Display name e.g. "North East California", "Dallas, TX"
  region: string;       // Team label: INSIDE | TX | EAST | CENTRAL | EILEEN | CALIFORNIA | CANADA
  repId: string | null; // User ID of assigned rep; null = Open / no rep
  stateCode?: string;   // 2-letter US state or CA province code for fallback import matching
  notes?: string;       // Free-text (e.g. specific account names for shared states)
}
