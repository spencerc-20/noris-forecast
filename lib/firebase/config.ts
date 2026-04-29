// lib/firebase/config.ts — Admin-managed config stored at forecast_v1/config.
// stateToRepMap: maps 2-letter state codes to rep userIds for bulk CSV import auto-assignment.

import { ref, get, set } from "firebase/database";
import { db } from "./client";

const CONFIG_PATH = "forecast_v1/config";

/** Returns the state→repId map, or {} if not yet configured. */
export async function getStateToRepMap(): Promise<Record<string, string>> {
  const snap = await get(ref(db, `${CONFIG_PATH}/stateToRepMap`));
  if (!snap.exists()) return {};
  return snap.val() as Record<string, string>;
}

/** Persists the full state→repId map (overwrites previous). */
export async function saveStateToRepMap(map: Record<string, string>): Promise<void> {
  await set(ref(db, `${CONFIG_PATH}/stateToRepMap`), map);
}
