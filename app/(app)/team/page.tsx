// app/(app)/team/page.tsx — Manager view of all reps in their region.
// Shows month-start, current forecast, drift, and open deal count per rep.
// Data loaded one-shot on mount; refresh button re-fetches.

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { RefreshCw, ArrowUpRight } from "lucide-react";
import { getDealsForUser } from "@/lib/firebase/deals";
import { getUsersForRegion } from "@/lib/firebase/users";
import { getMonthSnapshots } from "@/lib/firebase/snapshots";
import { useAuth } from "@/lib/firebase/auth";
import { isManager, isVP, isAdmin } from "@/lib/permissions/roles";
import { forecastTotal, formatCurrency, formatDelta } from "@/lib/forecast/calculations";
import { Button } from "@/components/ui/button";
import type { AppUser } from "@/types";

interface RepRow {
  user: AppUser;
  currentForecast: number;
  monthStartForecast: number | null;
  openDealCount: number;
  wonThisMonth: number;
}

export default function TeamPage() {
  const router = useRouter();
  const { appUser } = useAuth();
  const [rows, setRows] = useState<RepRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const currentMonth = format(new Date(), "yyyy-MM");

  const loadData = useCallback(async () => {
    if (!appUser) return;
    if (!isManager(appUser) && !isVP(appUser) && !isAdmin(appUser)) {
      router.replace("/dashboard");
      return;
    }

    setLoading(true);
    try {
      const reps = await getUsersForRegion(appUser.region);

      const loaded = await Promise.all(
        reps.map(async (rep) => {
          const [deals, snaps] = await Promise.all([
            getDealsForUser(rep.id),
            getMonthSnapshots(rep.id, currentMonth),
          ]);

          const openDeals = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
          const currentForecast = forecastTotal(openDeals);

          const monthStart = format(new Date(), "yyyy-MM");
          const wonThisMonth = deals.filter(
            (d) =>
              d.stage === "won" &&
              d.closedAt !== null &&
              format(new Date(d.closedAt), "yyyy-MM") === monthStart
          ).length;

          return {
            user: rep,
            currentForecast,
            monthStartForecast: snaps["month_start"]?.totalForecast ?? null,
            openDealCount: openDeals.length,
            wonThisMonth,
          } satisfies RepRow;
        })
      );

      setRows(loaded.sort((a, b) => b.currentForecast - a.currentForecast));
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

  const totalCurrent = rows.reduce((s, r) => s + r.currentForecast, 0);
  const totalMonthStart = rows.reduce(
    (s, r) => s + (r.monthStartForecast ?? r.currentForecast),
    0
  );
  const totalDrift = totalCurrent - totalMonthStart;

  return (
    <div className="mx-auto max-w-5xl px-6 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{appUser.region} — Team View</h1>
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
      ) : rows.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center text-sm text-muted-foreground">
          No pipeline data yet — reps need to create deals to populate this view.
        </div>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          {/* Column headers */}
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_60px_40px] gap-4 px-4 py-2.5 border-b bg-zinc-50 text-xs font-medium text-muted-foreground">
            <div>Rep</div>
            <div className="text-right">Month-Start</div>
            <div className="text-right">Current</div>
            <div className="text-right">Drift</div>
            <div className="text-right">Deals</div>
            <div />
          </div>

          {/* Rep rows */}
          {rows.map((row) => {
            const msf = row.monthStartForecast;
            const drift = msf !== null ? row.currentForecast - msf : null;
            const driftPos = drift !== null && drift >= 0;

            return (
              <button
                key={row.user.id}
                onClick={() => router.push(`/dashboard/${row.user.id}`)}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_60px_40px] gap-4 w-full px-4 py-3 border-b last:border-b-0 items-center hover:bg-zinc-50 text-left"
              >
                <div>
                  <p className="font-medium text-sm">{row.user.name}</p>
                  {row.wonThisMonth > 0 && (
                    <p className="text-xs text-emerald-600">
                      {row.wonThisMonth} won this month
                    </p>
                  )}
                </div>
                <div className="text-right tabular-nums text-sm">
                  {msf !== null ? formatCurrency(msf) : (
                    <span className="text-muted-foreground text-xs">No baseline</span>
                  )}
                </div>
                <div className="text-right tabular-nums text-sm font-medium">
                  {formatCurrency(row.currentForecast)}
                </div>
                <div className={`text-right tabular-nums text-sm font-medium ${
                  drift === null
                    ? "text-muted-foreground"
                    : driftPos
                    ? "text-emerald-600"
                    : "text-red-600"
                }`}>
                  {drift === null ? "—" : formatDelta(drift)}
                </div>
                <div className="text-right text-sm text-muted-foreground tabular-nums">
                  {row.openDealCount}
                </div>
                <div className="flex justify-end">
                  <ArrowUpRight size={14} className="text-muted-foreground" />
                </div>
              </button>
            );
          })}

          {/* Totals row */}
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_60px_40px] gap-4 px-4 py-3 bg-zinc-50 border-t text-sm font-semibold">
            <div>Total</div>
            <div className="text-right tabular-nums">{formatCurrency(totalMonthStart)}</div>
            <div className="text-right tabular-nums">{formatCurrency(totalCurrent)}</div>
            <div className={`text-right tabular-nums ${
              totalDrift >= 0 ? "text-emerald-600" : "text-red-600"
            }`}>
              {formatDelta(totalDrift)}
            </div>
            <div className="text-right tabular-nums text-muted-foreground">
              {rows.reduce((s, r) => s + r.openDealCount, 0)}
            </div>
            <div />
          </div>
        </div>
      )}
    </div>
  );
}
