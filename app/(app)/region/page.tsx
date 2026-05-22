// app/(app)/region/page.tsx — Admin/VP region picker.
//
// Lists every region as a clickable card with at-a-glance metrics for the
// selected month. Clicking a card drills into /team?region=X which renders
// the same regional rollup a Regional Manager sees.
//
// Permissions: layout shows this only to VP / Admin. Plain reps + managers
// don't have the nav link; URL-typing would just render an empty list
// (Firebase rules enforce the real read boundary).

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/firebase/auth";
import { getUsersByRegion } from "@/lib/firebase/users";
import { subscribeToAllCustomers } from "@/lib/firebase/customers";
import { calcRepMetrics, formatDollars, onTrackStatusFor } from "@/lib/forecast/repMetrics";
import { currentMonthKey, customerViewedAt, monthLabel } from "@/lib/forecast/monthData";
import { MetricCards } from "@/components/rep/MetricCards";
import type { AppUser, Customer } from "@/types";

const ON_TRACK_TEXT: Record<ReturnType<typeof onTrackStatusFor>, string> = {
  on_track: "text-[color:var(--good)]",
  close:    "text-[color:var(--warn)]",
  behind:   "text-[color:var(--bad)]",
  unknown:  "text-[color:var(--muted-spec)]",
};

export default function RegionPage() {
  const { appUser } = useAuth();
  const searchParams = useSearchParams();
  const viewMonth = searchParams.get("month") || currentMonthKey();

  const [byRegion, setByRegion]   = useState<Record<string, AppUser[]>>({});
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!appUser) return;
    getUsersByRegion().then(setByRegion);
  }, [appUser]);

  useEffect(() => {
    if (!appUser) return;
    return subscribeToAllCustomers((next) => {
      setCustomers(next);
      setLoading(false);
    });
  }, [appUser]);

  // Pre-compute per-region metrics + grand totals.
  // Only `inPipeline === true` customers are counted; each is viewed at the
  // selected month so the cards reflect what reps are pitching THIS month.
  const { regionRows, grandTotals } = useMemo(() => {
    const regions = Object.keys(byRegion).sort();

    // Map ownerId → region for fast lookup.
    const ownerRegion = new Map<string, string>();
    for (const [region, users] of Object.entries(byRegion)) {
      for (const u of users) ownerRegion.set(u.id, region);
    }

    // Filter once, then bucket by region.
    const liveCustomers = customers
      .filter((c) => c.inPipeline === true && ownerRegion.has(c.ownerId))
      .map((c) => customerViewedAt(c, viewMonth));

    const buckets: Record<string, Customer[]> = {};
    for (const c of liveCustomers) {
      const r = ownerRegion.get(c.ownerId)!;
      (buckets[r] ??= []).push(c);
    }

    const regionRows = regions.map((region) => ({
      region,
      reps: byRegion[region] ?? [],
      totals: calcRepMetrics(buckets[region] ?? []),
    }));

    return { regionRows, grandTotals: calcRepMetrics(liveCustomers) };
  }, [byRegion, customers, viewMonth]);

  if (!appUser) return null;

  const monthDisplay = monthLabel(viewMonth);
  const totalReps = Object.values(byRegion).reduce((sum, list) => sum + list.length, 0);

  return (
    <div className="mx-auto max-w-[1300px] px-[22px] py-7 space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[18px] font-semibold text-[color:var(--text-spec)] leading-tight">
            All Regions
          </h1>
          <p className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--muted-spec)] mt-1">
            {monthDisplay} · {regionRows.length} region{regionRows.length === 1 ? "" : "s"} · {totalReps} rep{totalReps === 1 ? "" : "s"}
          </p>
        </div>
        <span className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--muted-spec)]">
          Click a region to drill in
        </span>
      </div>

      {/* Grand-total cards across every region. */}
      <MetricCards metrics={grandTotals} />

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[color:var(--border-spec)] border-t-[color:var(--noris)]" />
        </div>
      ) : regionRows.length === 0 ? (
        <div className="rounded-xl border border-[color:var(--border-spec)] bg-[color:var(--surface)] py-10 text-center text-[13px] text-[color:var(--muted-spec)]">
          No reps configured yet.
        </div>
      ) : (
        // Region grid — each card is a Link into /team?region=…
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {regionRows.map(({ region, reps, totals }) => {
            const trackStatus = onTrackStatusFor(totals.existingOnTrackPct);
            const trackLabel  = totals.existingOnTrackPct == null ? "—" : `${totals.existingOnTrackPct}%`;
            return (
              <Link
                key={region}
                href={{ pathname: "/team", query: { region, ...(viewMonth !== currentMonthKey() ? { month: viewMonth } : {}) } }}
                className="
                  group block rounded-xl border border-[color:var(--border-spec)]
                  bg-[color:var(--surface)] px-4 py-3.5
                  hover:border-[color:var(--noris)]/60 hover:bg-[color:var(--surface-2)]/30
                  transition-colors
                "
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-[color:var(--text-spec)] truncate">
                      {region}
                    </p>
                    <p className="text-[11px] text-[color:var(--muted-spec)] tabular-nums mt-0.5">
                      {reps.length} rep{reps.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <ChevronRight
                    size={14}
                    className="text-[color:var(--muted-spec)] group-hover:text-[color:var(--noris)] transition-colors"
                  />
                </div>

                {/* Quick at-a-glance rollup. */}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--muted-spec)]">
                      Combined
                    </p>
                    <p className="text-[15px] font-semibold tabular-nums text-[color:var(--text-spec)] mt-0.5">
                      {formatDollars(totals.combinedForecast)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--muted-spec)]">
                      On track
                    </p>
                    <p className={`text-[15px] font-semibold tabular-nums mt-0.5 ${ON_TRACK_TEXT[trackStatus]}`}>
                      {trackLabel}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-[color:var(--border-spec)]/60">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.08em] text-[color:var(--muted-spec)]">
                      New weighted
                    </p>
                    <p className="text-[12px] tabular-nums text-[color:var(--text-spec)] mt-0.5">
                      {formatDollars(totals.newWeightedTotal)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.08em] text-[color:var(--muted-spec)]">
                      Existing exp.
                    </p>
                    <p className="text-[12px] tabular-nums text-[color:var(--text-spec)] mt-0.5">
                      {formatDollars(totals.existingExpected)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.08em] text-[color:var(--muted-spec)]">
                      Existing act.
                    </p>
                    <p className="text-[12px] tabular-nums text-[color:var(--text-spec)] mt-0.5">
                      {formatDollars(totals.existingActual)}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
