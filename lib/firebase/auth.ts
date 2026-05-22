// lib/firebase/auth.ts — Auth helpers for the email-as-password scheme.
// Deliberate product decision: password = email. Admin sets it on user creation. See README.
// signIn() checks disabled flag before calling Firebase to avoid wasted auth attempts.
// Login attempts log to /loginLog/{userId}/{timestamp}.
//
// FIREBASE RULE NOTE: /forecast_v1/users must be publicly readable (no auth required)
// so the login page can list rep names. See updated rules in CLAUDE.md section 10.
// Also add ".indexOn": ["email"] to the users node for orderByChild("email") to work efficiently.

"use client";

import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  ref,
  get,
  set,
  query,
  orderByChild,
  equalTo,
} from "firebase/database";
import { useEffect, useState } from "react";
import { auth, db } from "./client";
import type { AppUser } from "@/types";

const DB_ROOT = "forecast_v1";

/**
 * Sign in with the given email + optional explicit password.
 *
 * REVAMP auth model (post pre-final-details checkpoint):
 *   - role === "rep"             → password === email (auto, no prompt)
 *   - role === "manager"         → password === email (rep enters their email)
 *   - role === "admin"           → password === "Noris!2026" (or whatever the
 *                                  rep entered in the prompt)
 *
 * The caller is responsible for prompting for a password when the role needs
 * one. If `passwordOverride` is null/undefined we fall back to email-as-password
 * (the legacy default, still right for reps and current managers).
 *
 * Looking up the user by email first lets us cheaply check the `disabled`
 * flag before burning a Firebase Auth call on a banned account.
 */
export async function signIn(
  email: string,
  passwordOverride?: string
): Promise<AppUser> {
  // 1. Look up user by email to check disabled flag before Firebase call
  const usersQuery = query(
    ref(db, `${DB_ROOT}/users`),
    orderByChild("email"),
    equalTo(email)
  );
  const snapshot = await get(usersQuery);

  if (!snapshot.exists()) {
    throw new Error("No account found for that email. Contact your admin.");
  }

  let userId = "";
  let userData: Omit<AppUser, "id"> | null = null;
  snapshot.forEach((child) => {
    userId = child.key!;
    userData = child.val() as Omit<AppUser, "id">;
  });

  if (!userId || !userData) throw new Error("Account lookup failed.");

  const userRecord = userData as Omit<AppUser, "id">;

  if (userRecord.disabled) {
    throw new Error("This account is disabled. Contact your admin.");
  }

  // 2. Sign in — password defaults to email (legacy), can be overridden.
  const password = passwordOverride ?? email;
  await signInWithEmailAndPassword(auth, email, password);

  // 3. Log successful attempt
  await set(ref(db, `${DB_ROOT}/loginLog/${userId}/${Date.now()}`), {
    success: true,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
  });

  return { id: userId, ...userRecord } as AppUser;
}

/** Sign out the current user. */
export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

/** One-shot current Firebase user, or null. */
export async function getCurrentUser(): Promise<FirebaseUser | null> {
  return auth.currentUser;
}

/**
 * React hook for auth state.
 * Subscribes to Firebase Auth, loads the AppUser record from /users on sign-in.
 * Returns { user, appUser, loading }.
 */
export function useAuth() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const snap = await get(ref(db, `${DB_ROOT}/users/${firebaseUser.uid}`));
        if (snap.exists()) {
          setAppUser({ id: firebaseUser.uid, ...snap.val() } as AppUser);
        } else {
          setAppUser(null);
        }
      } else {
        setAppUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { user, appUser, loading };
}
