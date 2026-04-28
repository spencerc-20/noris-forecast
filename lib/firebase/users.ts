// lib/firebase/users.ts — User reads for forecast_v1/users.
// Writes (createUser, disableUser) live in the admin panel (Session 8).
// No index needed for V1 — team sizes are small enough to load all and filter client-side.

import { ref, get } from "firebase/database";
import { db } from "./client";
import type { AppUser } from "@/types";

const DB_ROOT = "forecast_v1";
const USERS_PATH = `${DB_ROOT}/users`;

/** One-shot read of a single user. Returns null if not found. */
export async function getUser(userId: string): Promise<AppUser | null> {
  const snap = await get(ref(db, `${USERS_PATH}/${userId}`));
  if (!snap.exists()) return null;
  return { id: snap.key!, ...snap.val() } as AppUser;
}

/** One-shot read of all non-disabled users. */
export async function getAllUsers(): Promise<AppUser[]> {
  const snap = await get(ref(db, USERS_PATH));
  if (!snap.exists()) return [];
  const users: AppUser[] = [];
  snap.forEach((child) => {
    const u = { id: child.key!, ...child.val() } as AppUser;
    if (!u.disabled) users.push(u);
  });
  return users.sort((a, b) => a.name.localeCompare(b.name));
}

/** All non-disabled reps in a specific region. */
export async function getUsersForRegion(region: string): Promise<AppUser[]> {
  const all = await getAllUsers();
  return all.filter((u) => u.region === region && u.role === "rep");
}

/** All non-disabled users grouped by region. */
export async function getUsersByRegion(): Promise<Record<string, AppUser[]>> {
  const all = await getAllUsers();
  const grouped: Record<string, AppUser[]> = {};
  for (const u of all) {
    if (u.role !== "rep") continue; // manager views show reps only
    if (!grouped[u.region]) grouped[u.region] = [];
    grouped[u.region].push(u);
  }
  return grouped;
}
