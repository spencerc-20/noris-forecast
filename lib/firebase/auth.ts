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
 * Sign in using email-as-password scheme.
 * Looks up the user by email first to check the disabled flag, then calls Firebase.
 * Password equals email — this is a deliberate product decision (see README).
 */
export async function signIn(email: string): Promise<AppUser> {
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

  // 2. Sign in — password equals email (deliberate product decision)
  await signInWithEmailAndPassword(auth, email, email);

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
