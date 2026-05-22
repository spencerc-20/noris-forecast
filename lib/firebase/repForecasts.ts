// lib/firebase/repForecasts.ts — Per-rep per-month gut-call forecast number.
//
// Stored separately from the per-customer row math. Path:
//   forecast_v1/repForecasts/{repId}/{YYYY-MM} : number   (dollars, integer)
//
// This is the rep's manual "I think I'll do $X this month" number — the V2
// VP-forecast-box equivalent. Independent of weighted/combined totals; the
// dashboard renders both side-by-side so managers can see the rep's own
// call AND the math.

import { ref, get, set, onValue } from "firebase/database";
import { db } from "./client";

const REP_FORECASTS_PATH = "forecast_v1/repForecasts";

/** Read a single rep's forecast for a given month (returns null if unset). */
export async function getRepForecast(
  repId: string,
  monthKey: string
): Promise<number | null> {
  const snap = await get(ref(db, `${REP_FORECASTS_PATH}/${repId}/${monthKey}`));
  if (!snap.exists()) return null;
  const v = snap.val();
  return typeof v === "number" ? v : null;
}

/** Live subscription: callback fires every time the rep's forecast for the month changes. */
export function subscribeToRepForecast(
  repId: string,
  monthKey: string,
  callback: (value: number | null) => void
): () => void {
  return onValue(ref(db, `${REP_FORECASTS_PATH}/${repId}/${monthKey}`), (snap) => {
    if (!snap.exists()) callback(null);
    else {
      const v = snap.val();
      callback(typeof v === "number" ? v : null);
    }
  });
}

/** Write the rep's forecast for a month. Pass null to clear it. */
export async function setRepForecast(
  repId: string,
  monthKey: string,
  value: number | null
): Promise<void> {
  await set(ref(db, `${REP_FORECASTS_PATH}/${repId}/${monthKey}`), value);
}

/**
 * One-shot read of every rep's forecast for a given month. Useful for the
 * /team and /region rollups that want to display the manual calls alongside
 * the computed totals (one fetch instead of N).
 *
 * Returns: { repId: forecast$ } — reps with no forecast set are omitted.
 */
export async function getAllRepForecastsForMonth(
  monthKey: string
): Promise<Record<string, number>> {
  const snap = await get(ref(db, REP_FORECASTS_PATH));
  if (!snap.exists()) return {};
  const out: Record<string, number> = {};
  snap.forEach((child) => {
    const repId = child.key!;
    const monthVal = child.child(monthKey).val();
    if (typeof monthVal === "number") out[repId] = monthVal;
  });
  return out;
}
