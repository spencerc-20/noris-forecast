// app/(auth)/login/page.tsx — Role-grouped login.
//
// REVAMP auth model:
//   - Reps             → click name, immediate sign-in (no password prompt)
//   - Regional Managers → click name → password prompt → sign-in
//   - Admin            → click "Admin" → password prompt → sign-in
//                        (admin password = "Noris!2026")
//
// Under the hood we still call Firebase signInWithEmailAndPassword. Reps use
// email-as-password; managers default to email-as-password (rep types the
// email); admin uses whatever they typed (which had better be "Noris!2026").

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { get, ref } from "firebase/database";
import { db } from "@/lib/firebase/client";
import { signIn, useAuth } from "@/lib/firebase/auth";
import { defaultRoute } from "@/lib/permissions/roles";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { UserRole } from "@/types";

interface UserListItem {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export default function LoginPage() {
  const router = useRouter();
  const { user, appUser, loading: authLoading } = useAuth();

  const [users, setUsers]           = useState<UserListItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [selected, setSelected]     = useState<UserListItem | null>(null);
  const [password, setPassword]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  /** Which rep button is mid-passwordless-sign-in (for the dimmed state). */
  const [signingInRepId, setSigningInRepId] = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  // Already signed in → redirect to role-appropriate home
  useEffect(() => {
    if (!authLoading && user && appUser) {
      router.replace(defaultRoute(appUser));
    }
  }, [user, appUser, authLoading, router]);

  // Load the non-disabled user list
  useEffect(() => {
    async function loadUsers() {
      try {
        const snap = await get(ref(db, "forecast_v1/users"));
        if (snap.exists()) {
          const items: UserListItem[] = [];
          snap.forEach((child) => {
            const val = child.val();
            if (!val.disabled) {
              items.push({
                id: child.key!,
                name: val.name,
                email: val.email,
                role: val.role,
              });
            }
          });
          items.sort((a, b) => a.name.localeCompare(b.name));
          setUsers(items);
        }
      } catch {
        // Rules may block unauthenticated reads — see CLAUDE.md note on /forecast_v1/users
      } finally {
        setUsersLoading(false);
      }
    }
    loadUsers();
  }, []);

  /** Direct sign-in path used for reps (no password prompt). */
  async function passwordlessSignIn(u: UserListItem) {
    setError(null);
    setSigningInRepId(u.id);
    try {
      const loggedIn = await signIn(u.email);
      router.replace(defaultRoute(loggedIn));
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "Sign in failed.";
      // If the rep's Firebase Auth record drifted (e.g. admin changed their
      // password), surface that clearly so the rep doesn't think the app is broken.
      setError(
        raw.includes("auth/")
          ? "Sign-in failed. Please contact Spencer to reset your account."
          : raw
      );
    } finally {
      setSigningInRepId(null);
    }
  }

  /** Password-gated sign-in path used for managers + admin. */
  async function gatedSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    setSubmitting(true);
    try {
      const loggedIn = await signIn(selected.email, password);
      router.replace(defaultRoute(loggedIn));
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "Sign in failed.";
      if (
        raw.includes("auth/invalid-credential") ||
        raw.includes("auth/wrong-password") ||
        raw.includes("auth/user-not-found")
      ) {
        setError("Wrong password. Try again, or contact Spencer.");
      } else {
        setError(raw);
      }
    } finally {
      setSubmitting(false);
    }
  }

  /** Handler for a name click — dispatches to passwordless or gated based on role. */
  function handlePick(u: UserListItem) {
    if (u.role === "rep") {
      void passwordlessSignIn(u);
    } else {
      setSelected(u);
      setPassword("");
      setError(null);
    }
  }

  if (authLoading) return null;

  // Group the user list by role. VPs fall in with managers since the role
  // model still has both but the visible label is just "Regional Manager".
  const reps     = users.filter((u) => u.role === "rep");
  const managers = users.filter((u) => u.role === "manager" || u.role === "vp");
  const admins   = users.filter((u) => u.role === "admin");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        {/* Branding */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="h-2 w-2 rounded-full bg-[color:var(--noris)]" />
            <span className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--muted-spec)]">
              Noris Medical
            </span>
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight text-[color:var(--text-spec)]">
            Sales Forecast
          </h1>
          <p className="mt-1 text-[12px] text-[color:var(--muted-spec)]">
            Pick your name to sign in.
          </p>
        </div>

        {usersLoading ? (
          <div className="py-10 text-center">
            <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-[color:var(--border-spec)] border-t-[color:var(--noris)]" />
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[color:var(--border-spec)] p-8 text-center">
            <p className="text-[13px] text-[color:var(--muted-spec)]">
              No users configured yet.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Reps — passwordless */}
            <RoleSection
              title="Reps"
              subtitle="Click your name — no password needed."
              users={reps}
              onPick={handlePick}
              busyId={signingInRepId}
            />

            {/* Regional Managers — password */}
            {managers.length > 0 && (
              <RoleSection
                title="Regional Managers"
                subtitle="Password required."
                users={managers}
                onPick={handlePick}
                busyId={null}
              />
            )}

            {/* Admin — password */}
            {admins.length > 0 && (
              <RoleSection
                title="Admin"
                subtitle="Password required."
                users={admins.map((u) => ({ ...u, name: "Admin" }))}
                onPick={handlePick}
                busyId={null}
                accent
              />
            )}
          </div>
        )}

        {/* Error shown outside any specific section so it's visible after
            a failed passwordless rep sign-in too. */}
        {error && !selected && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      {/* Password modal for managers + admin */}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sign in as {selected?.name}</DialogTitle>
            <DialogDescription>
              {selected?.role === "admin"
                ? "Enter the admin password to continue."
                : "Enter your password to continue."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={gatedSignIn} className="mt-2 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Section of the picker: title + grid of name buttons. */
function RoleSection({
  title,
  subtitle,
  users,
  onPick,
  busyId,
  accent,
}: {
  title: string;
  subtitle: string;
  users: UserListItem[];
  onPick: (u: UserListItem) => void;
  /** If a passwordless sign-in is in flight, dim that button. */
  busyId: string | null;
  /** Highlight (admin gets the noris-red tint). */
  accent?: boolean;
}) {
  if (users.length === 0) return null;
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2 px-0.5">
        <h2 className="text-[11px] uppercase tracking-[0.14em] font-semibold text-[color:var(--text-spec)]/85">
          {title}
        </h2>
        <p className="text-[10px] text-[color:var(--muted-spec)]">{subtitle}</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {users.map((u) => {
          const busy = busyId === u.id;
          return (
            <button
              key={u.id}
              disabled={busy}
              onClick={() => onPick(u)}
              className={`
                rounded-lg border px-3.5 py-3 text-[13px] font-medium text-left
                transition-colors focus:outline-none focus-visible:ring-2
                ${
                  accent
                    ? "border-[color:var(--noris)]/45 bg-[color:var(--noris)]/10 text-[color:var(--text-spec)] hover:border-[color:var(--noris)] hover:bg-[color:var(--noris)]/15 focus-visible:ring-[color:var(--noris)]"
                    : "border-[color:var(--border-spec)] bg-[color:var(--surface)] text-[color:var(--text-spec)] hover:border-[color:var(--noris)]/50 hover:bg-[color:var(--surface-2)] focus-visible:ring-[color:var(--noris)]"
                }
                ${busy ? "opacity-50 cursor-not-allowed" : ""}
              `}
            >
              {u.name}
            </button>
          );
        })}
      </div>
    </section>
  );
}
