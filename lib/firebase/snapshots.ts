// lib/firebase/snapshots.ts — Snapshot reads/writes for forecast_v1/snapshots/{userId}/{YYYY-MM}/{tag}.
// Snapshots are written client-side on Mondays via maybeWriteWeeklySnapshot().
// No Firebase index needed — paths are known and direct.

import { ref, get, set, onValue } from "firebase/database";
import { format } from "date-fns";
import { db } from "./client";
import { buildSnapshot, getWeekTag, getWeekNum } from "@/lib/forecast/snapshotLogic";
import type { Customer, Deal, Snapshot, SnapshotTag } from "@/types";

const DB_ROOT = "forecast_v1";

function snapRef(userId: string, month: string, tag: SnapshotTag) {
  return ref(db, `${DB_ROOT}/snapshots/${userId}/${month}/${tag}`);
}

/** One-shot read of a single snapshot. Returns null if not written yet. */
export async function getSnapshot(
  userId: string,
  month: string,
  tag: SnapshotTag
): Promise<Snapshot | null> {
  const snap = await get(snapRef(userId, month, tag));
  if (!snap.exists()) return null;
  return snap.val() as Snapshot;
}

/** Write a snapshot. Overwrites any existing value at the same path. */
export async function writeSnapshot(
  userId: string,
  month: string,
  tag: SnapshotTag,
  snapshot: Snapshot
): Promise<void> {
  await set(snapRef(userId, month, tag), snapshot);
}

/** One-shot read of all snapshots for a month. Returns an empty object if none. */
export async function getMonthSnapshots(
  userId: string,
  month: string
): Promise<Partial<Record<SnapshotTag, Snapshot>>> {
  const snap = await get(ref(db, `${DB_ROOT}/snapshots/${userId}/${month}`));
  if (!snap.exists()) return {};
  return snap.val() as Partial<Record<SnapshotTag, Snapshot>>;
}

/**
 * Real-time subscription to all snapshots for a given month.
 * Fires immediately with current data, then on every write.
 */
export function subscribeToMonthSnapshots(
  userId: string,
  month: string,
  callback: (snapshots: Partial<Record<SnapshotTag, Snapshot>>) => void
): () => void {
  const r = ref(db, `${DB_ROOT}/snapshots/${userId}/${month}`);
  return onValue(r, (snap) => {
    callback(
      snap.exists()
        ? (snap.val() as Partial<Record<SnapshotTag, Snapshot>>)
        : {}
    );
  });
}

/**
 * Client-side Monday snapshot trigger. Call on dashboard load.
 *
 * Rules:
 * - Only fires on Mondays (by local clock)
 * - Writes the week_N snapshot for this Monday — skips if already exists
 * - On the first Monday of the month, also writes month_start (write-once, never overwritten)
 *
 * `customerMap` should be keyed by customerId for aggregate breakdowns.
 */
export async function maybeWriteWeeklySnapshot(
  userId: string,
  deals: Deal[],
  customerMap: Record<string, Customer>
): Promise<void> {
  const today = new Date();
  if (today.getDay() !== 1) return; // Not Monday — bail

  const month = format(today, "yyyy-MM");
  const weekTag = getWeekTag(today);

  // Deduplicate: don't rewrite if already captured this Monday
  const existing = await getSnapshot(userId, month, weekTag);
  if (existing) return;

  const openDeals = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
  const snapshot = buildSnapshot(userId, month, weekTag, today, openDeals, customerMap);

  await writeSnapshot(userId, month, weekTag, snapshot);

  // Write month_start on first Monday of the month (write-once — never overwrite)
  if (getWeekNum(today) === 1) {
    const msExisting = await getSnapshot(userId, month, "month_start");
    if (!msExisting) {
      await writeSnapshot(userId, month, "month_start", {
        ...snapshot,
        tag: "month_start",
      });
    }
  }
}
