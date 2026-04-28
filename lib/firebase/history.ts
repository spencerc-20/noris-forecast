// lib/firebase/history.ts — Edit history reads/writes for forecast_v1/editHistory/{recordId}/{logId}.
// Used for both deals and customers. Reps see last 30 days; managers see full history.

import {
  ref,
  push,
  set,
  get,
  query,
  orderByChild,
  limitToLast,
  startAt,
} from "firebase/database";
import { db } from "./client";

const DB_ROOT = "forecast_v1";

export interface EditLogEntry {
  timestamp: number; // Unix ms
  userId: string;
  field: string; // field name that changed; "_created" or "_deleted" for lifecycle events
  oldValue: unknown;
  newValue: unknown;
  reason?: string; // populated when closeProbability is overridden
}

/** Append one edit log entry under /editHistory/{recordId}/{autoId}. */
export async function logEdit(
  recordId: string,
  entry: EditLogEntry
): Promise<void> {
  const logRef = push(ref(db, `${DB_ROOT}/editHistory/${recordId}`));
  await set(logRef, entry);
}

/**
 * Fetch edit history for a deal or customer, newest first.
 * @param sinceTimestamp - Unix ms. Pass `Date.now() - 30 * 86400000` to limit to last 30 days.
 * @param limit - Max entries to return (default 100).
 */
export async function getEditHistory(
  recordId: string,
  options: { sinceTimestamp?: number; limit?: number } = {}
): Promise<EditLogEntry[]> {
  const { sinceTimestamp, limit = 100 } = options;
  const histRef = ref(db, `${DB_ROOT}/editHistory/${recordId}`);

  const q = sinceTimestamp
    ? query(
        histRef,
        orderByChild("timestamp"),
        startAt(sinceTimestamp),
        limitToLast(limit)
      )
    : query(histRef, orderByChild("timestamp"), limitToLast(limit));

  const snap = await get(q);
  if (!snap.exists()) return [];

  const entries: EditLogEntry[] = [];
  snap.forEach((child) => { entries.push(child.val() as EditLogEntry); });
  return entries.sort((a, b) => b.timestamp - a.timestamp); // newest first
}
