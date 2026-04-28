// lib/forecast/commissionStatus.ts — computeCommissionStatus() for audit-grade records.
// Rule (CLAUDE.md 4.4): new = ordered this year AND NOT last year; existing = both; null = neither.
// "Ordered" = closedAt in that year, OR annualRevenue[year] > 0 from import.

import type { CommissionStatusValue } from "@/types";

interface WonDeal {
  closedAt: number | null;
}

/**
 * Returns true if the customer ordered (or had revenue) in `year`.
 */
export function orderedInYear(
  year: number,
  annualRevenue: Record<number, number>,
  wonDeals: WonDeal[]
): boolean {
  if ((annualRevenue[year] ?? 0) > 0) return true;
  return wonDeals.some(
    (d) => d.closedAt !== null && new Date(d.closedAt).getFullYear() === year
  );
}

/**
 * Recompute commission status for the given years.
 * Returns a partial map covering only the requested years — merge with existing before writing.
 */
export function computeCommissionStatus(
  years: number[],
  annualRevenue: Record<number, number>,
  wonDeals: WonDeal[]
): Record<number, CommissionStatusValue> {
  const result: Record<number, CommissionStatusValue> = {};
  for (const year of years) {
    if (!orderedInYear(year, annualRevenue, wonDeals)) {
      result[year] = null;
    } else {
      result[year] = orderedInYear(year - 1, annualRevenue, wonDeals)
        ? "existing"
        : "new";
    }
  }
  return result;
}
