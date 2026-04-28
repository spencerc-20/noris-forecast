// app/(app)/dashboard/page.tsx — Rep's pipeline: live Firebase subscription + DealCreateModal.

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { isSameMonth, addMonths, parseISO, format } from "date-fns";
import { subscribeToUserDeals } from "@/lib/firebase/deals";
import { getCustomersForUser } from "@/lib/firebase/customers";
import { useAuth } from "@/lib/firebase/auth";
import { forecastTotal } from "@/lib/forecast/calculations";
import { ForecastHeader } from "@/components/forecast/ForecastHeader";
import { SmartFilters, type DateFilter } from "@/components/forecast/SmartFilters";
import { DealList } from "@/components/forecast/DealList";
import { DealCreateModal } from "@/components/forecast/DealCreateModal";
import { Button } from "@/components/ui/button";
import type { Deal, LeadTemperature, ProcedureTier } from "@/types";

export default function DashboardPage() {
  const router = useRouter();
  const { appUser } = useAuth();

  const [deals, setDeals] = useState<Deal[]>([]);
  const [leadTemperatures, setLeadTemperatures] = useState<Record<string, LeadTemperature>>({});
  const [dealsLoading, setDealsLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  // Filter state
  const [activeDateFilter, setActiveDateFilter] = useState<DateFilter>(null);
  const [activeTier, setActiveTier] = useState<ProcedureTier | null>(null);
  const [activeTemperature, setActiveTemperature] = useState<LeadTemperature | null>(null);

  const today = new Date();

  // Subscribe to live deals
  useEffect(() => {
    if (!appUser) return;
    const unsub = subscribeToUserDeals(appUser.id, (incoming) => {
      setDeals(incoming);
      setDealsLoading(false);
    });
    return unsub;
  }, [appUser]);

  // Load customer lead temperatures (one-shot; refreshes when deals change so new customers appear)
  useEffect(() => {
    if (!appUser) return;
    getCustomersForUser(appUser.id).then((customers) => {
      const map: Record<string, LeadTemperature> = {};
      for (const c of customers) {
        if (c.leadTemperature) map[c.id] = c.leadTemperature;
      }
      setLeadTemperatures(map);
    });
  }, [appUser, deals.length]);

  const filteredDeals = useMemo(() => {
    // Default view: exclude closed won/lost
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
      result = result.filter(
        (d) => leadTemperatures[d.customerId] === activeTemperature
      );
    }

    return result;
  }, [deals, activeDateFilter, activeTier, activeTemperature, leadTemperatures, today]);

  const currentForecast = useMemo(() => forecastTotal(filteredDeals), [filteredDeals]);
  const monthLabel = format(today, "MMMM yyyy");

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
          monthStartForecast={currentForecast}
          currentForecast={currentForecast}
          sparklineData={[]}
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
