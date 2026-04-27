// types/snapshot.ts — Snapshot interface for forecast_v1/snapshots/{userId}/{YYYY-MM}/{tag}

import type { CommissionStatusValue, CustomerProfile, DealStage, DealStructure, LeadTemperature, LifecycleStatus, ProcedureTier } from "./taxonomy";

export type SnapshotTag = "month_start" | "week_1" | "week_2" | "week_3" | "week_4" | "week_5";

export interface SnapshotDealEntry {
  dealId: string;
  customerName: string;
  procedureTier: ProcedureTier;
  dealStructure: DealStructure;
  stage: DealStage;
  dealValue: number;
  closeProbability: number;
  weightedValue: number;
  isForecastEligible: boolean;
  expectedCloseDate: string;
}

export interface Snapshot {
  userId: string;
  month: string; // "YYYY-MM"
  tag: SnapshotTag;
  snapshotDate: string; // ISO date "YYYY-MM-DD"
  takenAt: number; // Unix timestamp ms

  // Totals
  totalForecast: number; // sum of weightedValue for forecast-eligible deals
  dealCount: number;

  // Aggregates
  byTier: Record<ProcedureTier, number>;
  byStructure: Record<DealStructure, number>;
  byStage: Record<DealStage, number>;
  byLifecycle: Record<LifecycleStatus, number>;
  byTemperature: Record<LeadTemperature, number>;
  byCommissionStatus: Record<Exclude<CommissionStatusValue, null> | "none", number>;
  byProfile: Record<CustomerProfile, number>;

  // Deal snapshot (for drift comparison)
  deals: Record<string, SnapshotDealEntry>;
}
