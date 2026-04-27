// lib/firebase/auth.ts — Auth helpers for the email-as-password scheme.
// Deliberate product decision: password = email. Admin sets it on user creation.
// signIn() checks disabled flag in /users before attempting Firebase auth.
// Login attempts are logged to /loginLog/{userId}/{timestamp}.

"use client";

import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { ref, get, set, serverTimestamp } from "firebase/database";
import { useEffect, useState } from "react";
import { auth, db } from "./client";
import type { AppUser } from "@/types";

const DB_ROOT = "forecast_v1";

/** Sign in using email-as-password scheme. Rejects disabled users before Firebase call. */
export async function signIn(email: string): Promise<AppUser> {
  // TODO: implement in Session 1 — needs /users lookup by email to check disabled flag
  // 1. Query /users where email === email to find userId + check disabled
  // 2. If disabled, throw "Account disabled"
  // 3. signInWithEmailAndPassword(auth, email, email)
  // 4. Log to /loginLog/{userId}/{timestamp} { success: true, userAgent }
  // 5. Return AppUser
  throw new Error("Not yet implemented — Session 1 wires this up");
}

/** Sign out current user. */
export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

/** One-shot current user lookup — returns null if not authenticated. */
export async function getCurrentUser(): Promise<FirebaseUser | null> {
  return auth.currentUser;
}

/** React hook for auth state. Returns { user, appUser, loading }. */
export function useAuth() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  // TODO: implement in Session 1 — subscribe to onAuthStateChanged, load AppUser from /users
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // TODO: load AppUser from /users/{firebaseUser.uid}
        setAppUser(null);
      } else {
        setAppUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { user, appUser, loading };
}
