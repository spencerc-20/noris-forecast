// lib/forecast/repMetrics.ts — Summary calculations for the unified rep list.
//
// REVAMP v2.0:
//   • NEW customers contribute weightedTotal = expectedMonthlyTotal × closeProbability / 100
//   • EXISTING customers contribute expectedMonthly + actualThisMonth
//   • Combined forecast = new weighted + existing expected (existing actual is informational)
//   • on-track % = sum(actualThisMonth) / sum(expectedMonthly) across existing customers

import type { Customer } from "@/types";

export interface RepMetrics {
  /** Number of NEW pipeline customers in the input set. */
  newCount: number;
  /** Sum of weighted-total dollars across NEW customers. */
  newWeightedTotal: number;

  /** Number of EXISTING recurring customers in the input set. */
  existingCount: number;
  /** Sum of expectedMonthly across EXISTING customers. */
  existingExpected: number;
  /** Sum of actualThisMonth across EXISTING customers. */
  existingActual: number;

  /** newWeightedTotal + existingExpected — the combined month forecast. */
  combinedForecast: number;
  /**
   * existingActual / existingExpected as a percentage (0–100+, rounded integer).
   * null if existingExpected === 0 (nothing to measure against).
   */
  existingOnTrackPct: number | null;
}

/** Per-customer weighted total ($) — for the row's projected column. */
export function weightedTotalFor(c: Customer): number {
  const dollars = c.expectedMonthlyTotal ?? 0;
  const prob    = c.closeProbability ?? 0;
  return Math.round(dollars * (prob / 100));
}

/** Per-customer on-track % (0–100+, or null when no expected baseline). */
export function onTrackPctFor(c: Customer): number | null {
  const expected = c.expectedMonthly ?? 0;
  if (expected <= 0) return null;
  const actual = c.actualThisMonth ?? 0;
  return Math.round((actual / expected) * 100);
}

/** Bucket an on-track percentage into a status colour band. */
export type OnTrackStatus = "on_track" | "close" | "behind" | "unknown";
export function onTrackStatusFor(pct: number | null): OnTrackStatus {
  if (pct == null) return "unknown";
  if (pct >= 100) return "on_track";
  if (pct >= 90)  return "close";
  return "behind";
}

/** Roll up metrics across a customer set (filtered or full). */
export function calcRepMetrics(customers: Customer[]): RepMetrics {
  let newCount = 0;
  let newWeightedTotal = 0;
  let existingCount = 0;
  let existingExpected = 0;
  let existingActual = 0;

  for (const c of customers) {
    if (c.pipelineType === "existing") {
      existingCount   += 1;
      existingExpected += c.expectedMonthly ?? 0;
      existingActual   += c.actualThisMonth ?? 0;
    } else {
      newCount += 1;
      newWeightedTotal += weightedTotalFor(c);
    }
  }

  const combinedForecast = newWeightedTotal + existingExpected;
  const existingOnTrackPct =
    existingExpected > 0 ? Math.round((existingActual / existingExpected) * 100) : null;

  return {
    newCount,
    newWeightedTotal,
    existingCount,
    existingExpected,
    existingActual,
    combinedForecast,
    existingOnTrackPct,
  };
}

/** Format a dollar amount as "$1,234" (no decimals — these are forecast estimates). */
export function formatDollars(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}
