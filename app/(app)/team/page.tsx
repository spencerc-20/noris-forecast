// app/(app)/team/page.tsx — Manager view: rep rollup for the manager's region.
//
// REVAMP v2.0: rolled-up metric cards across all reps in the region, plus the
// expandable rep table. Read-only — managers click a rep row to see that rep's
// customers inline.
//
// Manager scope is determined by:
//   - manager  → their own region
//   - VP/admin → also lands here, but sees their default region (region from appUser)
//                — for the full multi-region view use /region instead.

"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useAuth } from "@/lib/firebase/auth";
import { getUsersForRegion } from "@/lib/firebase/users";
import { subscribeToAllCustomers } from "@/lib/firebase/customers";
import { isManager, isVP, isAdmin } from "@/lib/permissions/roles";
import { calcRepMetrics } from "@/lib/forecast/repMetrics";
import { MetricCards } from "@/components/rep/MetricCards";
import { RepRollupTable, type RepRollupEntry } from "@/components/rollup/RepRollupTable";
import type { AppUser, Customer } from "@/types";

export default function TeamPage() {
  const { appUser } = useAuth();

  const [reps, setReps] = useState<AppUser[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  // Permission gate — block plain reps (and unauthenticated). Layout already
  // redirects unauthenticated, but a rep nav-typing to /team should be sent home.
  useEffect(() => {
    if (!appUser) return;
    if (!isManager(appUser) && !isVP(appUser) && !isAdmin(appUser)) {
      // We don't router.replace here — keep the page accessible at the URL but show empty;
      // the layout will hide the nav link for reps so they shouldn't land here anyway.
    }
  }, [appUser]);

  // Load reps for the manager's region (one-shot).
  useEffect(() => {
    if (!appUser) return;
    getUsersForRegion(appUser.region).then(setReps);
  }, [appUser]);

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
  // otherwise inflate the totals with phantom pipeline.
  const { entries, regionCustomers } = useMemo(() => {
    const repIds = new Set(reps.map((r) => r.id));
    const regionCustomers = customers.filter(
      (c) => repIds.has(c.ownerId) && c.inPipeline === true
    );
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
  }, [reps, customers]);

  // Region-wide metrics roll up across every customer owned by any rep in the region.
  const totals = useMemo(() => calcRepMetrics(regionCustomers), [regionCustomers]);

  if (!appUser) return null;

  const monthLabel = format(new Date(), "MMMM yyyy");

  return (
    <div className="mx-auto max-w-[1300px] px-[22px] py-7 space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[18px] font-semibold text-[color:var(--text-spec)] leading-tight">
            Team — {appUser.region}
          </h1>
          <p className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--muted-spec)] mt-1">
            {monthLabel} · {reps.length} rep{reps.length === 1 ? "" : "s"}
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
