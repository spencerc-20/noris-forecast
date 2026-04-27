// types/taxonomy.ts — Shared enum types and constants for deal/customer classification

export type ProcedureTier =
  | "everything"
  | "full_arch"
  | "ra_only"
  | "standard"
  | "course"
  | "tools";

export type DealStructure =
  | "standalone"
  | "package"
  | "bulk"
  | "combo"
  | "trial"
  | "mentorship";

export type DealStage =
  | "lead"
  | "discovery"
  | "quoted"
  | "verbal"
  | "won"
  | "lost";

export type CustomerProfile =
  | "new"
  | "tools_only"
  | "course_only"
  | "standard"
  | "ra_only"
  | "full_arch"
  | "everything";

export type LifecycleStatus =
  | "potential"
  | "new"
  | "existing"
  | "inactive"
  | "lost";

export type LeadTemperature = "cold" | "warm" | "hot" | "engaged";

export type CommissionStatusValue = "new" | "existing" | null;

export type UserRole = "rep" | "manager" | "vp" | "admin";

export type RevenueDataSource = "csv_import" | "live_deals";

/** Rank map for procedure tiers — lower number = higher tier. Used for profile derivation. */
export const TIER_RANK: Record<ProcedureTier, number> = {
  everything: 1,
  full_arch: 2,
  ra_only: 3,
  standard: 4,
  course: 5,
  tools: 6,
};

/** Forecast-eligible deal structures count toward the $ forecast. */
export const FORECAST_ELIGIBLE_STRUCTURES: DealStructure[] = [
  "standalone",
  "package",
  "bulk",
  "combo",
];

/** Default close probability (0-100) per stage. */
export const STAGE_DEFAULT_PROBABILITY: Record<DealStage, number> = {
  lead: 10,
  discovery: 25,
  quoted: 50,
  verbal: 75,
  won: 100,
  lost: 0,
};
