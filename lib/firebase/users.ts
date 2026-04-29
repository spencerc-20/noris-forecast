// lib/firebase/users.ts — User reads/writes for forecast_v1/users.
// createUser uses a secondary Firebase app to avoid signing out the current admin.
// Disable/enable is DB-only (V1) — auth.ts rejects disabled users before Firebase call.

import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut as fbSignOut } from "firebase/auth";
import { ref, get, set, update } from "firebase/database";
import mainApp, { db } from "./client";
import type { AppUser } from "@/types";

const DB_ROOT = "forecast_v1";
const USERS_PATH = `${DB_ROOT}/users`;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** One-shot read of a single user. Returns null if not found. */
export async function getUser(userId: string): Promise<AppUser | null> {
  const snap = await get(ref(db, `${USERS_PATH}/${userId}`));
  if (!snap.exists()) return null;
  return { id: snap.key!, ...snap.val() } as AppUser;
}

/** All non-disabled users, sorted by name. */
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

/** All users including disabled — for admin panel. */
export async function getAllUsersAdmin(): Promise<AppUser[]> {
  const snap = await get(ref(db, USERS_PATH));
  if (!snap.exists()) return [];
  const users: AppUser[] = [];
  snap.forEach((child) => {
    users.push({ id: child.key!, ...child.val() } as AppUser);
  });
  return users.sort((a, b) => a.name.localeCompare(b.name));
}

/** All non-disabled reps in a specific region. */
export async function getUsersForRegion(region: string): Promise<AppUser[]> {
  const all = await getAllUsers();
  return all.filter((u) => u.region === region && u.role === "rep");
}

/** All non-disabled users grouped by region (reps only). */
export async function getUsersByRegion(): Promise<Record<string, AppUser[]>> {
  const all = await getAllUsers();
  const grouped: Record<string, AppUser[]> = {};
  for (const u of all) {
    if (u.role !== "rep") continue;
    if (!grouped[u.region]) grouped[u.region] = [];
    grouped[u.region].push(u);
  }
  return grouped;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface CreateUserData {
  name: string;
  email: string;
  role: AppUser["role"];
  region: string;
  managerId?: string | null;
}

/**
 * Create a Firebase Auth user (password = email) and write the DB record.
 * Uses a temporary secondary Firebase app so the admin stays signed in.
 */
export async function createUser(data: CreateUserData): Promise<AppUser> {
  const tempApp = initializeApp(mainApp.options, `create-user-${Date.now()}`);
  const tempAuth = getAuth(tempApp);

  let uid: string;
  try {
    const cred = await createUserWithEmailAndPassword(tempAuth, data.email, data.email);
    uid = cred.user.uid;
  } finally {
    await fbSignOut(tempAuth);
    await deleteApp(tempApp);
  }

  const now = Date.now();
  const record: Omit<AppUser, "id"> = {
    name: data.name,
    email: data.email,
    role: data.role,
    region: data.region,
    managerId: data.managerId ?? null,
    disabled: false,
    createdAt: now,
    lastLoginAt: null,
  };

  await set(ref(db, `${USERS_PATH}/${uid}`), record);
  return { id: uid, ...record };
}

/** Update mutable fields on a user's DB record (name, role, region, managerId). */
export async function updateUserRecord(
  userId: string,
  updates: Partial<Pick<AppUser, "name" | "role" | "region" | "managerId">>
): Promise<void> {
  await update(ref(db, `${USERS_PATH}/${userId}`), updates);
}

/**
 * Toggle the disabled flag on a user. Disabled users are rejected by auth.ts
 * before the Firebase Auth call — their auth account stays intact so re-enable works.
 */
export async function setUserDisabled(userId: string, disabled: boolean): Promise<void> {
  await update(ref(db, `${USERS_PATH}/${userId}`), { disabled });
}
