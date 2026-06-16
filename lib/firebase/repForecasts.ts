// lib/firebase/repForecasts.ts — Per-rep per-month forecast + pace tracking.
//
// Storage shape (post-migrateRepForecastsToObject):
//
//   forecast_v1/repForecasts/{repId}/{YYYY-MM} = {
//     forecast?:        number,   // rep's manual gut-call for the month
//     currentRevenue?:  number,   // rep's running revenue tally for the month
//   }
//
// Back-compat: any path that's still a bare scalar (`= 5000`) is interpreted
// as `{forecast: 5000, currentRevenue: undefined}` on read. Writes always
// target the sub-key (.../forecast or .../currentRevenue), which means
// RTDB auto-creates the wrapper object if needed. The migration script
// `scripts/migrateRepForecastsToObject.py` ran against prod and converted
// every pre-existing scalar — leaving the back-compat read paths as belt-
// and-braces for any record that might predate it.

import { ref, get, set, onValue } from "firebase/database";
import { db } from "./client";

const REP_FORECASTS_PATH = "forecast_v1/repForecasts";

// ── Internal: normalize either shape to {forecast?, currentRevenue?} ────────

interface RepMonthEntry {
  forecast?: number;
  currentRevenue?: number;
}

function normalize(value: unknown): RepMonthEntry {
  if (value == null) return {};
  if (typeof value === "number") return { forecast: value };
  if (typeof value === "object") {
    const v = value as { forecast?: unknown; currentRevenue?: unknown };
    return {
      forecast:       typeof v.forecast       === "number" ? v.forecast       : undefined,
      currentRevenue: typeof v.currentRevenue === "number" ? v.currentRevenue : undefined,
    };
  }
  return {};
}

// ── Forecast ────────────────────────────────────────────────────────────────

/** Read a single rep's forecast for a given month (returns null if unset). */
export async function getRepForecast(
  repId: string,
  monthKey: string
): Promise<number | null> {
  const snap = await get(ref(db, `${REP_FORECASTS_PATH}/${repId}/${monthKey}`));
  if (!snap.exists()) return null;
  return normalize(snap.val()).forecast ?? null;
}

/** Live subscription: callback fires every time the rep's forecast changes. */
export function subscribeToRepForecast(
  repId: string,
  monthKey: string,
  callback: (value: number | null) => void
): () => void {
  return onValue(ref(db, `${REP_FORECASTS_PATH}/${repId}/${monthKey}`), (snap) => {
    callback(snap.exists() ? normalize(snap.val()).forecast ?? null : null);
  });
}

/** Write the rep's forecast for a month. Pass null to clear it. */
export async function setRepForecast(
  repId: string,
  monthKey: string,
  value: number | null
): Promise<void> {
  // Target the /forecast sub-key directly. RTDB upgrades a scalar parent
  // into an object the first time you write a child — but the migration
  // already did that for every existing scalar, so this is normally just
  // a flat write into an existing object.
  await set(ref(db, `${REP_FORECASTS_PATH}/${repId}/${monthKey}/forecast`), value);
}

// ── Current revenue (Pace tracker) ──────────────────────────────────────────

/** Read a rep's running revenue for the month (returns null if unset). */
export async function getRepCurrentRevenue(
  repId: string,
  monthKey: string
): Promise<number | null> {
  const snap = await get(ref(db, `${REP_FORECASTS_PATH}/${repId}/${monthKey}`));
  if (!snap.exists()) return null;
  return normalize(snap.val()).currentRevenue ?? null;
}

/** Live subscription: rep's running revenue for the month. */
export function subscribeToRepCurrentRevenue(
  repId: string,
  monthKey: string,
  callback: (value: number | null) => void
): () => void {
  return onValue(ref(db, `${REP_FORECASTS_PATH}/${repId}/${monthKey}`), (snap) => {
    callback(snap.exists() ? normalize(snap.val()).currentRevenue ?? null : null);
  });
}

/** Write the rep's running revenue. Pass null to clear it. */
export async function setRepCurrentRevenue(
  repId: string,
  monthKey: string,
  value: number | null
): Promise<void> {
  await set(ref(db, `${REP_FORECASTS_PATH}/${repId}/${monthKey}/currentRevenue`), value);
}

// ── Bulk: every rep's forecast for a month (used by the CSV/XLSX exports) ────

/** One-shot read of every rep's forecast for `monthKey`. Omits unset reps. */
export async function getAllRepForecastsForMonth(
  monthKey: string
): Promise<Record<string, number>> {
  const snap = await get(ref(db, REP_FORECASTS_PATH));
  if (!snap.exists()) return {};
  const out: Record<string, number> = {};
  snap.forEach((child) => {
    const repId = child.key!;
    const monthVal = child.child(monthKey).val();
    const f = normalize(monthVal).forecast;
    if (f != null) out[repId] = f;
  });
  return out;
}
