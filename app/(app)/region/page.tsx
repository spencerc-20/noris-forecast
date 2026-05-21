// app/(app)/region/page.tsx — VP view: every rep across every region.
//
// REVAMP v2.0: total roll-up metric cards at the top, then one expandable
// rollup table per region (alpha-sorted). Same RepRollupRow drilldown as /team.

"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useAuth } from "@/lib/firebase/auth";
import { getUsersByRegion } from "@/lib/firebase/users";
import { subscribeToAllCustomers } from "@/lib/firebase/customers";
import { calcRepMetrics, formatDollars } from "@/lib/forecast/repMetrics";
import { MetricCards } from "@/components/rep/MetricCards";
import { RepRollupTable, type RepRollupEntry } from "@/components/rollup/RepRollupTable";
import type { AppUser, Customer } from "@/types";

export default function RegionPage() {
  const { appUser } = useAuth();

  const [byRegion, setByRegion] = useState<Record<string, AppUser[]>>({});
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Build per-region entry lists; also keep an "all customers" totals view.
  const { regionBlocks, allCustomers } = useMemo(() => {
    const customersByOwner = new Map<string, Customer[]>();
    for (const c of customers) {
      const arr = customersByOwner.get(c.ownerId) ?? [];
      arr.push(c);
      customersByOwner.set(c.ownerId, arr);
    }

    const regions = Object.keys(byRegion).sort();
    const regionBlocks = regions.map((regionName) => {
      const reps = byRegion[regionName] ?? [];
      const entries: RepRollupEntry[] = reps
        .map((r) => ({
          name: r.name,
          region: regionName,
          customers: customersByOwner.get(r.id) ?? [],
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const regionCustomers = entries.flatMap((e) => e.customers);
      return {
        regionName,
        entries,
        totals: calcRepMetrics(regionCustomers),
      };
    });

    // All customers across all reps (not just unassigned-region ones)
    const allOwnerIds = new Set(
      Object.values(byRegion).flat().map((u) => u.id)
    );
    const allCustomers = customers.filter((c) => allOwnerIds.has(c.ownerId));

    return { regionBlocks, allCustomers };
  }, [byRegion, customers]);

  const grandTotals = useMemo(() => calcRepMetrics(allCustomers), [allCustomers]);

  if (!appUser) return null;

  const monthLabel = format(new Date(), "MMMM yyyy");
  const totalReps = Object.values(byRegion).reduce((sum, list) => sum + list.length, 0);

  return (
    <div className="mx-auto max-w-[1300px] px-[22px] py-7 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[18px] font-semibold text-[color:var(--text-spec)] leading-tight">
            All Regions
          </h1>
          <p className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--muted-spec)] mt-1">
            {monthLabel} · {regionBlocks.length} region{regionBlocks.length === 1 ? "" : "s"} · {totalReps} rep{totalReps === 1 ? "" : "s"}
          </p>
        </div>
        <span className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--muted-spec)]">
          Read-only
        </span>
      </div>

      <MetricCards metrics={grandTotals} />

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[color:var(--border-spec)] border-t-[color:var(--noris)]" />
        </div>
      ) : regionBlocks.length === 0 ? (
        <div className="rounded-xl border border-[color:var(--border-spec)] bg-[color:var(--surface)] py-10 text-center text-[13px] text-[color:var(--muted-spec)]">
          No reps configured yet.
        </div>
      ) : (
        regionBlocks.map((block) => (
          <div key={block.regionName} className="space-y-2">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-[13px] font-semibold text-[color:var(--text-spec)]">
                {block.regionName}
              </h2>
              <p className="text-[11px] text-[color:var(--muted-spec)] tabular-nums">
                Combined {formatDollars(block.totals.combinedForecast)} · {block.entries.length} rep{block.entries.length === 1 ? "" : "s"}
              </p>
            </div>
            <RepRollupTable
              reps={block.entries}
              emptyLabel="No reps in this region yet."
            />
          </div>
        ))
      )}
    </div>
  );
}
