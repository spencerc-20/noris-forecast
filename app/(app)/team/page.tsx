// app/(app)/team/page.tsx — Region rollup view.
//
// REVAMP v2.0: rolled-up metric cards across all reps in a region, plus the
// expandable rep table. Read-only — viewer clicks a rep row to see that rep's
// customers inline.
//
// Region scope:
//   - manager → their own appUser.region (URL ?region= ignored for safety)
//   - VP / admin → the URL `?region=Name` if provided, else their default region
// This is how an admin drills into a specific region from /region's picker.

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useAuth } from "@/lib/firebase/auth";
import { getUsersForRegion } from "@/lib/firebase/users";
import { subscribeToAllCustomers } from "@/lib/firebase/customers";
import { isManager, isVP, isAdmin } from "@/lib/permissions/roles";
import { calcRepMetrics } from "@/lib/forecast/repMetrics";
import { currentMonthKey, customerViewedAt, monthLabel } from "@/lib/forecast/monthData";
import { MetricCards } from "@/components/rep/MetricCards";
import { RepRollupTable, type RepRollupEntry } from "@/components/rollup/RepRollupTable";
import type { AppUser, Customer } from "@/types";

export default function TeamPage() {
  const { appUser } = useAuth();
  const searchParams = useSearchParams();
  const viewMonth = searchParams.get("month") || currentMonthKey();
  // ?region= is honoured only for VP / admin. Managers always see their own
  // region regardless of URL — this is a permission boundary, not just UI sugar.
  const requestedRegion = searchParams.get("region");
  const viewerCanPickRegion = !!appUser && (isVP(appUser) || isAdmin(appUser));
  const activeRegion =
    viewerCanPickRegion && requestedRegion
      ? requestedRegion
      : appUser?.region ?? "";

  const [reps, setReps] = useState<AppUser[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  // Permission note — the layout hides /team from plain reps, so URL-typing
  // is the only way for a rep to land here. We leave the page renderable
  // but the rep won't be able to read other reps' data via Firebase rules
  // (rules enforce the real boundary).
  useEffect(() => {
    if (!appUser) return;
    if (!isManager(appUser) && !isVP(appUser) && !isAdmin(appUser)) return;
  }, [appUser]);

  // Reload reps when activeRegion changes (admin nav between regions).
  useEffect(() => {
    if (!activeRegion) return;
    getUsersForRegion(activeRegion).then(setReps);
  }, [activeRegion]);

  // Live subscription to all customers — we slice client-side to just the
  // ones owned by reps in this region.
  useEffect(() => {
    if (!appUser) return;
    return subscribeToAllCustomers((next) => {
      setCustomers(next);
      setLoading(false);
    });
  }, [appUser]);

  // ── Roll up rep entries ─────────────────────────────────────────────────────
  // Only `inPipeline === true` customers count — background CSV records would
  // otherwise inflate the totals with phantom pipeline. Customers are
  // viewed-at-month so the rollup respects the topbar stepper.
  const { entries, regionCustomers } = useMemo(() => {
    const repIds = new Set(reps.map((r) => r.id));
    const regionCustomers = customers
      .filter((c) => repIds.has(c.ownerId) && c.inPipeline === true)
      .map((c) => customerViewedAt(c, viewMonth));
    const byRep = new Map<string, Customer[]>();
    for (const c of regionCustomers) {
      const arr = byRep.get(c.ownerId) ?? [];
      arr.push(c);
      byRep.set(c.ownerId, arr);
    }
    const entries: RepRollupEntry[] = reps
      .map((r) => ({
        name: r.name,
        region: r.region,
        customers: byRep.get(r.id) ?? [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { entries, regionCustomers };
  }, [reps, customers, viewMonth]);

  // Region-wide metrics roll up across every customer owned by any rep in the region.
  const totals = useMemo(() => calcRepMetrics(regionCustomers), [regionCustomers]);

  if (!appUser) return null;

  const monthDisplay = monthLabel(viewMonth);

  // Admin/VP drilled in from /region get a back link so they can hop between regions.
  const showBackToRegions = viewerCanPickRegion && !!requestedRegion;

  return (
    <div className="mx-auto max-w-[1300px] px-[22px] py-7 space-y-5">
      <div className="flex items-end justify-between">
        <div>
          {showBackToRegions && (
            <Link
              href="/region"
              className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.1em] text-[color:var(--muted-spec)] hover:text-[color:var(--text-spec)] mb-1.5"
            >
              <ChevronLeft size={11} />
              All regions
            </Link>
          )}
          <h1 className="text-[18px] font-semibold text-[color:var(--text-spec)] leading-tight">
            Team — {activeRegion || "—"}
          </h1>
          <p className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--muted-spec)] mt-1">
            {monthDisplay} · {reps.length} rep{reps.length === 1 ? "" : "s"}
          </p>
        </div>
        <span className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--muted-spec)]">
          Read-only
        </span>
      </div>

      <MetricCards metrics={totals} />

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[color:var(--border-spec)] border-t-[color:var(--noris)]" />
        </div>
      ) : (
        <RepRollupTable reps={entries} emptyLabel="No reps in this region yet." />
      )}
    </div>
  );
}
