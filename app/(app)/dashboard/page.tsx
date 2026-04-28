// app/(app)/dashboard/page.tsx — Rep's pipeline view: ForecastHeader + SmartFilters + DealList.
// Session 2: mock data only. Session 3: replace MOCK_DEALS with Firebase reads.

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isSameMonth, addMonths, parseISO, format } from "date-fns";
import {
  MOCK_DEALS,
  MOCK_LEAD_TEMPERATURES,
  MOCK_MONTH_START_FORECAST,
  MOCK_SPARKLINE_DATA,
} from "@/lib/mock/deals";
import { forecastTotal } from "@/lib/forecast/calculations";
import { ForecastHeader } from "@/components/forecast/ForecastHeader";
import { SmartFilters, type DateFilter } from "@/components/forecast/SmartFilters";
import { DealList } from "@/components/forecast/DealList";
import type { LeadTemperature, ProcedureTier } from "@/types";

export default function DashboardPage() {
  const router = useRouter();

  // Filter state
  const [activeDateFilter, setActiveDateFilter] = useState<DateFilter>(null);
  const [activeTier, setActiveTier] = useState<ProcedureTier | null>(null);
  const [activeTemperature, setActiveTemperature] =
    useState<LeadTemperature | null>(null);

  const today = new Date();

  // Apply filters to mock deals
  const filteredDeals = useMemo(() => {
    let result = MOCK_DEALS;

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
        (d) => MOCK_LEAD_TEMPERATURES[d.id] === activeTemperature
      );
    }

    return result;
  }, [activeDateFilter, activeTier, activeTemperature, today]);

  const currentForecast = useMemo(
    () => forecastTotal(filteredDeals),
    [filteredDeals]
  );

  // When filters are active, sparkline stays fixed (it reflects the unfiltered month trajectory)
  const sparklineData = MOCK_SPARKLINE_DATA;
  const monthLabel = format(today, "MMMM yyyy");

  return (
    <div className="mx-auto max-w-5xl px-6 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">My Pipeline</h1>
        <p className="text-xs text-muted-foreground">
          Mock data — Firebase reads in Session 3
        </p>
      </div>

      <ForecastHeader
        monthLabel={monthLabel}
        monthStartForecast={MOCK_MONTH_START_FORECAST}
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

      <DealList
        deals={filteredDeals}
        leadTemperatures={MOCK_LEAD_TEMPERATURES}
        onDealClick={(dealId) => router.push(`/deal/${dealId}`)}
      />
    </div>
  );
}
