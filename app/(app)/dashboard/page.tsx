// app/(app)/dashboard/page.tsx — Rep's pipeline: live Firebase subscription, snapshot drift,
// and weekly snapshot trigger (Mondays only).

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { isSameMonth, addMonths, parseISO, format } from "date-fns";
import { subscribeToUserDeals } from "@/lib/firebase/deals";
import { getCustomersForUser } from "@/lib/firebase/customers";
import { subscribeToMonthSnapshots, maybeWriteWeeklySnapshot } from "@/lib/firebase/snapshots";
import { useAuth } from "@/lib/firebase/auth";
import { forecastTotal } from "@/lib/forecast/calculations";
import { buildSparklineData } from "@/lib/forecast/snapshotLogic";
import { ForecastHeader } from "@/components/forecast/ForecastHeader";
import { SmartFilters, type DateFilter } from "@/components/forecast/SmartFilters";
import { DealList } from "@/components/forecast/DealList";
import { DealCreateModal } from "@/components/forecast/DealCreateModal";
import { Button } from "@/components/ui/button";
import type { Customer, Deal, LeadTemperature, ProcedureTier, Snapshot, SnapshotTag } from "@/types";

export default function DashboardPage() {
  const router = useRouter();
  const { appUser } = useAuth();

  const [deals, setDeals] = useState<Deal[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [monthSnapshots, setMonthSnapshots] = useState<Partial<Record<SnapshotTag, Snapshot>>>({});
  const [dealsLoading, setDealsLoading] = useState(true);
  const [customersLoaded, setCustomersLoaded] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const snapshotTriggered = useRef(false);

  // Filter state
  const [activeDateFilter, setActiveDateFilter] = useState<DateFilter>(null);
  const [activeTier, setActiveTier] = useState<ProcedureTier | null>(null);
  const [activeTemperature, setActiveTemperature] = useState<LeadTemperature | null>(null);

  const today = new Date();
  const monthLabel = format(today, "MMMM yyyy");

  // Subscribe to live deals
  useEffect(() => {
    if (!appUser) return;
    return subscribeToUserDeals(appUser.id, (incoming) => {
      setDeals(incoming);
      setDealsLoading(false);
    });
  }, [appUser]);

  // Subscribe to this month's snapshots (real-time — updates when snapshot is written)
  useEffect(() => {
    if (!appUser) return;
    const month = format(today, "yyyy-MM");
    return subscribeToMonthSnapshots(appUser.id, month, setMonthSnapshots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUser]);

  // Load customers (one-shot; re-runs when deal count changes to pick up new customers)
  useEffect(() => {
    if (!appUser) return;
    getCustomersForUser(appUser.id).then((c) => {
      setCustomers(c);
      setCustomersLoaded(true);
    });
  }, [appUser, deals.length]);

  // Monday snapshot trigger — fires once per session after deals + customers are both ready
  useEffect(() => {
    if (!appUser || dealsLoading || !customersLoaded || snapshotTriggered.current) return;
    snapshotTriggered.current = true;
    const customerMap = Object.fromEntries(customers.map((c) => [c.id, c]));
    maybeWriteWeeklySnapshot(appUser.id, deals, customerMap);
  }, [appUser, dealsLoading, customersLoaded, deals, customers]);

  // Temperature map derived from customers
  const leadTemperatures = useMemo<Record<string, LeadTemperature>>(() => {
    const map: Record<string, LeadTemperature> = {};
    for (const c of customers) {
      if (c.leadTemperature) map[c.id] = c.leadTemperature;
    }
    return map;
  }, [customers]);

  const filteredDeals = useMemo(() => {
    let result = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");

    if (activeDateFilter === "this_month") {
      result = result.filter((d) =>
        isSameMonth(parseISO(d.expectedCloseDate), today)
      );
    } else if (activeDateFilter === "next_month") {
      result = result.filter((d) =>
        isSameMonth(parseISO(d.expectedCloseDate), addMonths(today, 1))
      );
    }
    if (activeTier) {
      result = result.filter((d) => d.procedureTier === activeTier);
    }
    if (activeTemperature) {
      result = result.filter((d) => leadTemperatures[d.customerId] === activeTemperature);
    }

    return result;
  }, [deals, activeDateFilter, activeTier, activeTemperature, leadTemperatures, today]);

  const currentForecast = useMemo(() => forecastTotal(filteredDeals), [filteredDeals]);

  // Month-start reference: use the month_start snapshot if it exists, otherwise fall back
  // to current forecast (will self-correct once the first Monday snapshot is written)
  const monthStartForecast =
    monthSnapshots["month_start"]?.totalForecast ?? currentForecast;

  const sparklineData = useMemo(
    () => buildSparklineData(monthSnapshots, currentForecast),
    [monthSnapshots, currentForecast]
  );

  if (!appUser) return null;

  return (
    <>
      <div className="mx-auto max-w-5xl px-6 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">My Pipeline</h1>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} className="mr-1.5" />
            New deal
          </Button>
        </div>

        <ForecastHeader
          monthLabel={monthLabel}
          monthStartForecast={monthStartForecast}
          currentForecast={currentForecast}
          sparklineData={sparklineData}
        />

        <SmartFilters
          activeDateFilter={activeDateFilter}
          activeTier={activeTier}
          activeTemperature={activeTemperature}
          onDateFilterChange={setActiveDateFilter}
          onTierChange={setActiveTier}
          onTemperatureChange={setActiveTemperature}
        />

        {dealsLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600" />
          </div>
        ) : (
          <DealList
            deals={filteredDeals}
            leadTemperatures={leadTemperatures}
            onDealClick={(dealId) => router.push(`/deal/${dealId}`)}
          />
        )}
      </div>

      <DealCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        ownerId={appUser.id}
        region={appUser.region}
      />
    </>
  );
}
