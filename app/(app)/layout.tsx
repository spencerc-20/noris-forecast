// app/(app)/layout.tsx — Authenticated shell. Redirects to /login if not signed in.
//
// REVAMP v2.0: slim ~58px sticky topbar — brand left, role-scoped nav center,
// month label + user/sign-out right. Dark palette throughout.

"use client";

import { Suspense, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth, signOut } from "@/lib/firebase/auth";
import { isAdmin, isManager, isVP } from "@/lib/permissions/roles";
import { MonthStepper } from "@/components/rep/MonthStepper";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, appUser, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[color:var(--border-spec)] border-t-[color:var(--noris)]" />
      </div>
    );
  }

  if (!user || !appUser) return null;

  // Admin doesn't get Dashboard or Team — they live above the per-rep view
  // and only need the Region overview + the Admin panel.
  const navLinks = [
    { href: "/dashboard", label: "Dashboard", show: !isAdmin(appUser) },
    { href: "/team",      label: "Team",      show: isManager(appUser) || isVP(appUser) },
    { href: "/region",    label: "Region",    show: isVP(appUser) || isAdmin(appUser) },
    { href: "/admin",     label: "Admin",     show: isAdmin(appUser) },
  ].filter((l) => l.show);

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Slim sticky topbar — ~58px, dark surface ─────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-[color:var(--border-spec)] bg-[color:var(--surface)]/95 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--surface)]/80">
        <div className="grid grid-cols-3 items-center h-[58px] px-[22px]">
          {/* Brand + nav */}
          <div className="flex items-center gap-6 min-w-0">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-[color:var(--text-spec)] whitespace-nowrap"
            >
              <span
                className="h-2 w-2 rounded-full bg-[color:var(--noris)]"
                aria-hidden
              />
              Noris Forecast
            </Link>
            <nav className="flex items-center gap-1 min-w-0">
              {navLinks.map(({ href, label }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${
                      active
                        ? "bg-[color:var(--surface-2)] text-[color:var(--text-spec)] font-medium"
                        : "text-[color:var(--muted-spec)] hover:text-[color:var(--text-spec)] hover:bg-[color:var(--surface-2)]/60"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Month stepper center — drives the ?month=YYYY-MM URL param */}
          <div className="flex justify-center">
            <Suspense fallback={<span className="text-[12px] text-[color:var(--muted-spec)]">—</span>}>
              <MonthStepper />
            </Suspense>
          </div>

          {/* User + sign-out */}
          <div className="flex items-center justify-end gap-3">
            <span className="text-[12px] text-[color:var(--muted-spec)]">
              {appUser.name}
            </span>
            <button
              onClick={handleSignOut}
              className="text-[11px] text-[color:var(--muted-spec)] hover:text-[color:var(--text-spec)] transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
