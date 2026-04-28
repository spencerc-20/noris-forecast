// lib/forecast/lifecycleStatus.ts — automatic lifecycle transition helpers.
// Manual transitions (declaring lost, win-back) live in the UI layer.
// See CLAUDE.md 4.3 for full state machine.

import type { LifecycleStatus } from "@/types";

interface WonDeal {
  closedAt: number | null;
}

/**
 * Promote lifecycle when a deal closes won.
 * potential / new / inactive → existing. existing and lost stay unchanged.
 */
export function promoteLifecycleOnWin(current: LifecycleStatus): LifecycleStatus {
  if (current === "potential" || current === "new" || current === "inactive") {
    return "existing";
  }
  return current;
}

/**
 * Flag as inactive if no current-year activity (orders or import revenue).
 * Only affects existing — never demotes potential, new, or lost.
 */
export function flagInactiveIfNoActivity(
  current: LifecycleStatus,
  currentYear: number,
  annualRevenue: Record<number, number>,
  wonDeals: WonDeal[]
): LifecycleStatus {
  if (current !== "existing") return current;

  const hasActivity =
    (annualRevenue[currentYear] ?? 0) > 0 ||
    wonDeals.some(
      (d) =>
        d.closedAt !== null &&
        new Date(d.closedAt).getFullYear() === currentYear
    );

  return hasActivity ? current : "inactive";
}
