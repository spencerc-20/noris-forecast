// app/(auth)/login/page.tsx — Login: name picker grid → email modal → Firebase signIn.
// Auth model: password = email (deliberate product decision — see README).
// User list reads from /forecast_v1/users — requires that path to be publicly readable.
// See updated Firebase rules in CLAUDE.md section 10.

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

interface UserListItem {
  id: string;
  name: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { user, appUser, loading: authLoading } = useAuth();

  const [users, setUsers] = useState<UserListItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [selected, setSelected] = useState<UserListItem | null>(null);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in → go to their default route
  useEffect(() => {
    if (!authLoading && user && appUser) {
      router.replace(defaultRoute(appUser));
    }
  }, [user, appUser, authLoading, router]);

  // Load non-disabled user list for the name picker
  useEffect(() => {
    async function loadUsers() {
      try {
        const snap = await get(ref(db, "forecast_v1/users"));
        if (snap.exists()) {
          const items: UserListItem[] = [];
          snap.forEach((child) => {
            const val = child.val();
            if (!val.disabled) {
              items.push({ id: child.key!, name: val.name });
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const loggedInUser = await signIn(email.trim().toLowerCase());
      router.replace(defaultRoute(loggedInUser));
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "Sign in failed.";
      if (
        raw.includes("auth/invalid-credential") ||
        raw.includes("auth/wrong-password") ||
        raw.includes("auth/user-not-found")
      ) {
        setError("Email not recognized. Check for typos or contact your admin.");
      } else {
        setError(raw);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Don't flash the login UI while checking auth state
  if (authLoading) return null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
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
            Select your name to sign in.
          </p>
        </div>

        {/* User grid */}
        {usersLoading ? (
          <div className="py-10 text-center">
            <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-[color:var(--border-spec)] border-t-[color:var(--noris)]" />
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[color:var(--border-spec)] p-8 text-center">
            <p className="text-[13px] text-[color:var(--muted-spec)]">
              No users configured yet.
            </p>
            <p className="mt-1 text-[11px] text-[color:var(--muted-spec)]/70">
              Add users via Firebase Console and make sure /forecast_v1/users is
              publicly readable.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {users.map((u) => (
              <button
                key={u.id}
                className="rounded-lg border border-[color:var(--border-spec)] bg-[color:var(--surface)] px-4 py-3.5 text-[13px] font-medium text-left text-[color:var(--text-spec)] hover:border-[color:var(--noris)]/50 hover:bg-[color:var(--surface-2)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--noris)]"
                onClick={() => {
                  setSelected(u);
                  setEmail("");
                  setError(null);
                }}
              >
                {u.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Email sign-in dialog */}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sign in as {selected?.name}</DialogTitle>
            <DialogDescription>
              Enter your email address to continue.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="mt-2 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@norismedical.com"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
