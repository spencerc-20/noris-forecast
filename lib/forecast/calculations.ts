// lib/forecast/calculations.ts — Pure calculation helpers for deal values and forecast totals.
// All currency formatting uses Intl.NumberFormat. No raw math on Date objects.

import type { Deal } from "@/types";

/** Weighted value for a single deal: dealValue × closeProbability / 100 (rounded to nearest $). */
export function weightedValue(deal: Pick<Deal, "dealValue" | "closeProbability">): number {
  return Math.round((deal.dealValue * deal.closeProbability) / 100);
}

/**
 * Sum weighted values of all forecast-eligible, non-closed deals.
 * Won and Lost deals are excluded — they no longer need to be forecasted.
 */
export function forecastTotal(deals: Deal[]): number {
  return deals
    .filter(
      (d) =>
        d.isForecastEligible && d.stage !== "won" && d.stage !== "lost"
    )
    .reduce((sum, d) => sum + weightedValue(d), 0);
}

/** Format a dollar amount with no decimal places: $12,500 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/** Format a delta with a leading + or − sign: +$4,250 or −$1,000 */
export function formatDelta(value: number): string {
  const abs = formatCurrency(Math.abs(value));
  return value >= 0 ? `+${abs}` : `−${abs}`;
}
