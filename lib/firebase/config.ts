// lib/firebase/config.ts — Admin-managed config stored at forecast_v1/config.
// Territory CRUD: getTerritories, subscribeToTerritories, addTerritory, updateTerritory,
// deleteTerritory, initializeTerritoriesIfNeeded (seeds from TERRITORY_SEED on first load).
// Legacy stateToRepMap functions kept for migration compatibility.

import { ref, get, set, update, remove, push, onValue } from "firebase/database";
import { db } from "./client";
import { TERRITORY_SEED } from "@/lib/forecast/regionConfig";
import type { TerritoryEntry } from "@/types";
import type { AppUser } from "@/types";

const CONFIG_PATH = "forecast_v1/config";
const TERRITORIES_PATH = `${CONFIG_PATH}/territories`;

// ── Territory reads ───────────────────────────────────────────────────────────

/** One-shot read of all territory entries. Returns [] if none configured. */
export async function getTerritories(): Promise<TerritoryEntry[]> {
  const snap = await get(ref(db, TERRITORIES_PATH));
  if (!snap.exists()) return [];
  const result: TerritoryEntry[] = [];
  snap.forEach((child) => {
    result.push({ id: child.key!, ...child.val() } as TerritoryEntry);
  });
  return result;
}

/** Live listener — calls callback whenever territories change. Returns unsubscribe fn. */
export function subscribeToTerritories(
  callback: (territories: TerritoryEntry[]) => void
): () => void {
  const unsub = onValue(ref(db, TERRITORIES_PATH), (snap) => {
    const result: TerritoryEntry[] = [];
    if (snap.exists()) {
      snap.forEach((child) => {
        result.push({ id: child.key!, ...child.val() } as TerritoryEntry);
      });
    }
    callback(result);
  });
  return unsub;
}

// ── Territory writes ──────────────────────────────────────────────────────────

/** Add a new territory entry. Returns the new entry with its generated id. */
export async function addTerritory(
  entry: Omit<TerritoryEntry, "id">
): Promise<TerritoryEntry> {
  const newRef = push(ref(db, TERRITORIES_PATH));
  // Remove undefined keys so Firebase doesn't store them
  const payload: Record<string, unknown> = {
    territory: entry.territory,
    region: entry.region,
    repId: entry.repId ?? null,
  };
  if (entry.stateCode) payload.stateCode = entry.stateCode;
  if (entry.notes) payload.notes = entry.notes;
  await set(newRef, payload);
  return { id: newRef.key!, ...payload } as TerritoryEntry;
}

/** Partial update to a territory entry (territory, region, repId, stateCode, notes). */
export async function updateTerritory(
  id: string,
  updates: Partial<Omit<TerritoryEntry, "id">>
): Promise<void> {
  await update(ref(db, `${TERRITORIES_PATH}/${id}`), updates);
}

/** Delete a territory entry by its push key. */
export async function deleteTerritory(id: string): Promise<void> {
  await remove(ref(db, `${TERRITORIES_PATH}/${id}`));
}

// ── Seed ─────────────────────────────────────────────────────────────────────

/**
 * Seeds territories from TERRITORY_SEED if the node is empty.
 * Matches seed repName → AppUser.name (case-insensitive, falls back to first-name match).
 * Skips seeding if any territories already exist.
 */
export async function initializeTerritoriesIfNeeded(users: AppUser[]): Promise<void> {
  const snap = await get(ref(db, TERRITORIES_PATH));
  if (snap.exists()) return; // already seeded

  // Build name → userId map with fallbacks
  const exactMap = new Map<string, string>(); // lower(full name) → id
  const firstMap = new Map<string, string>(); // lower(first name) → id (first match wins)

  for (const u of users) {
    if (u.disabled) continue;
    exactMap.set(u.name.toLowerCase().trim(), u.id);
    const first = u.name.split(" ")[0].toLowerCase().trim();
    if (!firstMap.has(first)) firstMap.set(first, u.id);
  }

  function resolveRepId(repName: string | null): string | null {
    if (!repName) return null;
    const lower = repName.toLowerCase().trim();
    return (
      exactMap.get(lower) ??
      firstMap.get(lower) ??
      // Last resort: first word of seed name matches full word in user name
      [...exactMap.entries()].find(([n]) => n.split(" ")[0] === lower.split(" ")[0])?.[1] ??
      null
    );
  }

  const updates: Record<string, unknown> = {};
  for (const seed of TERRITORY_SEED) {
    const key = push(ref(db, TERRITORIES_PATH)).key!;
    const payload: Record<string, unknown> = {
      territory: seed.territory,
      region: seed.region,
      repId: resolveRepId(seed.repName),
    };
    if (seed.stateCode) payload.stateCode = seed.stateCode;
    if (seed.notes) payload.notes = seed.notes;
    updates[key] = payload;
  }

  await update(ref(db, TERRITORIES_PATH), updates);
}

// ── Legacy stateToRepMap (kept for migration) ─────────────────────────────────

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
