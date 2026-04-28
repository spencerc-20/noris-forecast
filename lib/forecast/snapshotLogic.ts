// lib/forecast/snapshotLogic.ts — Snapshot construction, week tagging, and sparkline helpers.
// Snapshots are written every Monday (client-side trigger). The first Monday of each month
// also writes the "month_start" tag, which becomes the fixed reference for drift display.

import { format } from "date-fns";
import type {
  Customer,
  Deal,
  CustomerProfile,
  DealStage,
  DealStructure,
  LeadTemperature,
  LifecycleStatus,
  ProcedureTier,
  Snapshot,
  SnapshotDealEntry,
  SnapshotTag,
} from "@/types";
import { weightedValue, forecastTotal } from "./calculations";

// Full value lists for zero-initializing aggregate buckets
const TIER_KEYS: ProcedureTier[] = ["everything","full_arch","ra_only","standard","course","tools"];
const STRUCTURE_KEYS: DealStructure[] = ["standalone","package","bulk","combo","trial","mentorship"];
const STAGE_KEYS: DealStage[] = ["lead","discovery","quoted","verbal","won","lost"];
const LIFECYCLE_KEYS: LifecycleStatus[] = ["potential","new","existing","inactive","lost"];
const TEMP_KEYS: LeadTemperature[] = ["cold","warm","hot","engaged"];
const PROFILE_KEYS: CustomerProfile[] = ["new","tools_only","course_only","standard","ra_only","full_arch","everything"];

function zeroRecord<K extends string>(keys: K[]): Record<K, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
}

/** Which occurrence of Monday within the month (1–5). Only meaningful when date.getDay() === 1. */
export function getWeekNum(date: Date): 1 | 2 | 3 | 4 | 5 {
  return Math.ceil(date.getDate() / 7) as 1 | 2 | 3 | 4 | 5;
}

/** `week_1` … `week_5` tag for a Monday date. */
export function getWeekTag(date: Date): SnapshotTag {
  return `week_${getWeekNum(date)}` as SnapshotTag;
}

/**
 * Build a complete Snapshot from open deals and a customer lookup map.
 * `openDeals` must already be filtered to exclude won/lost.
 * `customerMap` is keyed by customerId — missing entries are handled gracefully.
 */
export function buildSnapshot(
  userId: string,
  month: string,
  tag: SnapshotTag,
  date: Date,
  openDeals: Deal[],
  customerMap: Record<string, Customer>
): Snapshot {
  const currentYear = date.getFullYear();

  const byTier = zeroRecord(TIER_KEYS);
  const byStructure = zeroRecord(STRUCTURE_KEYS);
  const byStage = zeroRecord(STAGE_KEYS);
  const byLifecycle = zeroRecord(LIFECYCLE_KEYS);
  const byTemperature = zeroRecord(TEMP_KEYS);
  const byProfile = zeroRecord(PROFILE_KEYS);
  const byCommissionStatus: Record<"new" | "existing" | "none", number> = {
    new: 0,
    existing: 0,
    none: 0,
  };

  const dealEntries: Record<string, SnapshotDealEntry> = {};

  for (const deal of openDeals) {
    const wv = deal.isForecastEligible ? weightedValue(deal) : 0;

    byTier[deal.procedureTier] += wv;
    byStructure[deal.dealStructure] += wv;
    byStage[deal.stage] += wv;

    const customer = customerMap[deal.customerId];
    if (customer) {
      byLifecycle[customer.lifecycleStatus] += wv;
      byTemperature[customer.leadTemperature] += wv;
      byProfile[customer.profile] += wv;

      const commVal = customer.commissionStatus?.[currentYear] ?? null;
      byCommissionStatus[commVal ?? "none"] += wv;
    }

    dealEntries[deal.id] = {
      dealId: deal.id,
      customerName: deal.customerName,
      procedureTier: deal.procedureTier,
      dealStructure: deal.dealStructure,
      stage: deal.stage,
      dealValue: deal.dealValue,
      closeProbability: deal.closeProbability,
      weightedValue: wv,
      isForecastEligible: deal.isForecastEligible,
      expectedCloseDate: deal.expectedCloseDate,
    };
  }

  return {
    userId,
    month,
    tag,
    snapshotDate: format(date, "yyyy-MM-dd"),
    takenAt: date.getTime(),
    totalForecast: forecastTotal(openDeals),
    dealCount: openDeals.length,
    byTier,
    byStructure,
    byStage,
    byLifecycle,
    byTemperature,
    byCommissionStatus,
    byProfile,
    deals: dealEntries,
  };
}

/**
 * Build sparkline data from monthly snapshots + a live "Now" trailing point.
 * Weekly snapshot points are sorted chronologically (week_1 → week_5).
 * Returns at least one point (the "Now" value) even before any snapshots exist.
 */
export function buildSparklineData(
  snapshots: Partial<Record<SnapshotTag, Snapshot>>,
  currentForecast: number
): { label: string; value: number }[] {
  const WEEK_TAGS: SnapshotTag[] = ["week_1","week_2","week_3","week_4","week_5"];
  const points: { label: string; value: number }[] = [];

  for (const tag of WEEK_TAGS) {
    const snap = snapshots[tag];
    if (snap) {
      points.push({ label: `Wk ${tag.replace("week_", "")}`, value: snap.totalForecast });
    }
  }

  // Always append the live value — makes the sparkline feel real-time
  points.push({ label: "Now", value: currentForecast });

  return points;
}
