// app/(app)/region/page.tsx — VP view: all regions rolled up with per-rep drill-down.
// Same data pattern as /team but across all regions. One-shot load + refresh.

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { RefreshCw, ArrowUpRight, ChevronDown, ChevronRight } from "lucide-react";
import { getDealsForUser } from "@/lib/firebase/deals";
import { getUsersByRegion } from "@/lib/firebase/users";
import { getMonthSnapshots } from "@/lib/firebase/snapshots";
import { useAuth } from "@/lib/firebase/auth";
import { isVP, isAdmin } from "@/lib/permissions/roles";
import { forecastTotal, formatCurrency, formatDelta } from "@/lib/forecast/calculations";
import { ALL_REGIONS } from "@/lib/forecast/regionConfig";
import { Button } from "@/components/ui/button";
import type { AppUser } from "@/types";

interface RepRow {
  user: AppUser;
  currentForecast: number;
  monthStartForecast: number | null;
  openDealCount: number;
}

interface RegionData {
  region: string;
  reps: RepRow[];
  totalCurrent: number;
  totalMonthStart: number;
}

export default function RegionPage() {
  const router = useRouter();
  const { appUser } = useAuth();
  const [regionData, setRegionData] = useState<RegionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const currentMonth = format(new Date(), "yyyy-MM");

  const loadData = useCallback(async () => {
    if (!appUser) return;
    if (!isVP(appUser) && !isAdmin(appUser)) {
      router.replace("/dashboard");
      return;
    }

    setLoading(true);
    try {
      const byRegion = await getUsersByRegion();

      // Load all rep data in parallel across all regions
      const allRegions = ALL_REGIONS.filter((r) => byRegion[r]?.length);

      const loaded = await Promise.all(
        allRegions.map(async (region) => {
          const reps = byRegion[region] ?? [];

          const repRows = await Promise.all(
            reps.map(async (rep) => {
              const [deals, snaps] = await Promise.all([
                getDealsForUser(rep.id),
                getMonthSnapshots(rep.id, currentMonth),
              ]);
              const openDeals = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
              return {
                user: rep,
                currentForecast: forecastTotal(openDeals),
                monthStartForecast: snaps["month_start"]?.totalForecast ?? null,
                openDealCount: openDeals.length,
              } satisfies RepRow;
            })
          );

          repRows.sort((a, b) => b.currentForecast - a.currentForecast);

          return {
            region,
            reps: repRows,
            totalCurrent: repRows.reduce((s, r) => s + r.currentForecast, 0),
            totalMonthStart: repRows.reduce(
              (s, r) => s + (r.monthStartForecast ?? r.currentForecast),
              0
            ),
          } satisfies RegionData;
        })
      );

      // Sort regions by total current forecast descending
      loaded.sort((a, b) => b.totalCurrent - a.totalCurrent);
      setRegionData(loaded);

      // Expand all regions by default
      const exp: Record<string, boolean> = {};
      for (const r of loaded) exp[r.region] = true;
      setExpanded(exp);

      setLastRefreshed(new Date());
    } finally {
      setLoading(false);
    }
  }, [appUser, currentMonth, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 5-second timeout: stop spinning and show empty state if data never arrives
  useEffect(() => {
    if (!loading) { setTimedOut(false); return; }
    const t = setTimeout(() => setTimedOut(true), 5000);
    return () => clearTimeout(t);
  }, [loading]);

  if (!appUser) return null;

  const grandCurrent = regionData.reduce((s, r) => s + r.totalCurrent, 0);
  const grandMonthStart = regionData.reduce((s, r) => s + r.totalMonthStart, 0);
  const grandDrift = grandCurrent - grandMonthStart;
  const grandDeals = regionData.reduce(
    (s, r) => s + r.reps.reduce((sr, rep) => sr + rep.openDealCount, 0),
    0
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">All Regions</h1>
          {lastRefreshed && (
            <p className="text-xs text-muted-foreground">
              Last refreshed {format(lastRefreshed, "h:mm a")}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadData}
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      {loading && !timedOut ? (
        <div className="flex justify-center py-16">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600" />
        </div>
      ) : regionData.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center text-sm text-muted-foreground">
          No pipeline data yet — reps need to create deals to populate this view.
        </div>
      ) : (
        <>
          {/* Grand total summary */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Total Month-Start", value: formatCurrency(grandMonthStart) },
              { label: "Total Current", value: formatCurrency(grandCurrent) },
              {
                label: "Total Drift",
                value: formatDelta(grandDrift),
                color: grandDrift >= 0 ? "text-emerald-600" : "text-red-600",
              },
              { label: "Open Deals", value: String(grandDeals) },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg border bg-white px-4 py-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-xl font-semibold tabular-nums mt-0.5 ${color ?? ""}`}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* Per-region tables */}
          <div className="space-y-3">
            {regionData.map((rd) => {
              const isOpen = expanded[rd.region] ?? true;
              const drift = rd.totalCurrent - rd.totalMonthStart;

              return (
                <div key={rd.region} className="rounded-lg border bg-white overflow-hidden">
                  {/* Region header row */}
                  <button
                    className="flex w-full items-center gap-3 px-4 py-3 bg-zinc-50 hover:bg-zinc-100 border-b"
                    onClick={() =>
                      setExpanded((e) => ({ ...e, [rd.region]: !e[rd.region] }))
                    }
                  >
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="font-semibold text-sm flex-1 text-left">
                      {rd.region}
                    </span>
                    <div className="flex items-center gap-6 text-sm tabular-nums">
                      <span className="text-muted-foreground">
                        {formatCurrency(rd.totalMonthStart)} →
                      </span>
                      <span className="font-medium">
                        {formatCurrency(rd.totalCurrent)}
                      </span>
                      <span
                        className={`font-medium ${
                          drift >= 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {formatDelta(drift)}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {rd.reps.reduce((s, r) => s + r.openDealCount, 0)} deals
                      </span>
                    </div>
                  </button>

                  {/* Rep rows */}
                  {isOpen && (
                    <div>
                      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_60px_40px] gap-4 px-4 py-2 border-b text-xs font-medium text-muted-foreground bg-white">
                        <div>Rep</div>
                        <div className="text-right">Month-Start</div>
                        <div className="text-right">Current</div>
                        <div className="text-right">Drift</div>
                        <div className="text-right">Deals</div>
                        <div />
                      </div>
                      {rd.reps.map((row) => {
                        const msf = row.monthStartForecast;
                        const repDrift = msf !== null ? row.currentForecast - msf : null;
                        return (
                          <button
                            key={row.user.id}
                            onClick={() => router.push(`/dashboard/${row.user.id}`)}
                            className="grid grid-cols-[2fr_1fr_1fr_1fr_60px_40px] gap-4 w-full px-4 py-2.5 border-b last:border-b-0 items-center hover:bg-zinc-50 text-left"
                          >
                            <p className="text-sm">{row.user.name}</p>
                            <p className="text-right text-sm tabular-nums text-muted-foreground">
                              {msf !== null ? formatCurrency(msf) : "—"}
                            </p>
                            <p className="text-right text-sm tabular-nums font-medium">
                              {formatCurrency(row.currentForecast)}
                            </p>
                            <p
                              className={`text-right text-sm tabular-nums font-medium ${
                                repDrift === null
                                  ? "text-muted-foreground"
                                  : repDrift >= 0
                                  ? "text-emerald-600"
                                  : "text-red-600"
                              }`}
                            >
                              {repDrift === null ? "—" : formatDelta(repDrift)}
                            </p>
                            <p className="text-right text-sm tabular-nums text-muted-foreground">
                              {row.openDealCount}
                            </p>
                            <div className="flex justify-end">
                              <ArrowUpRight size={14} className="text-muted-foreground" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
