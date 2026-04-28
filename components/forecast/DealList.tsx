// components/forecast/DealList.tsx — Sorted list of deals with a collapsible pipeline-only section.
// Forecast-eligible deals render first; trials and mentorships collapse at the bottom.

"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { Deal, LeadTemperature } from "@/types";
import { DealRow } from "./DealRow";

interface DealListProps {
  deals: Deal[];
  /** Lead temperatures keyed by dealId — will be keyed by customerId in Session 3. */
  leadTemperatures?: Record<string, LeadTemperature>;
  onDealClick?: (dealId: string) => void;
}

export function DealList({
  deals,
  leadTemperatures = {},
  onDealClick,
}: DealListProps) {
  const [pipelineOpen, setPipelineOpen] = useState(false);

  const eligible = deals.filter((d) => d.isForecastEligible);
  const pipelineOnly = deals.filter((d) => !d.isForecastEligible);

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      {/* Column headers */}
      <div className="flex items-center gap-4 px-4 py-2 border-b bg-zinc-50">
        <div className="flex-[2] text-xs font-medium text-muted-foreground">
          Customer / Classification
        </div>
        <div className="min-w-[120px] text-right text-xs font-medium text-muted-foreground">
          Value / Weighted
        </div>
        <div className="min-w-[70px] text-right text-xs font-medium text-muted-foreground">
          Next Mtg
        </div>
        <div className="w-[72px] text-right text-xs font-medium text-muted-foreground">
          Temp
        </div>
      </div>

      {/* Forecast-eligible deals */}
      {eligible.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No deals match this filter.
        </div>
      ) : (
        eligible.map((deal) => (
          <DealRow
            key={deal.id}
            deal={deal}
            leadTemperature={leadTemperatures[deal.id]}
            onClick={() => onDealClick?.(deal.id)}
          />
        ))
      )}

      {/* Pipeline-only section (collapsible) */}
      {pipelineOnly.length > 0 && (
        <div className="border-t bg-zinc-50/60">
          <button
            className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-zinc-700 transition-colors"
            onClick={() => setPipelineOpen((v) => !v)}
          >
            {pipelineOpen ? (
              <ChevronDown size={13} />
            ) : (
              <ChevronRight size={13} />
            )}
            Pipeline — {pipelineOnly.length} trial
            {pipelineOnly.length !== 1 ? "s" : ""} / mentorship
            {pipelineOnly.length !== 1 ? "s" : ""} (not counted in forecast)
          </button>
          {pipelineOpen &&
            pipelineOnly.map((deal) => (
              <DealRow
                key={deal.id}
                deal={deal}
                leadTemperature={leadTemperatures[deal.id]}
                onClick={() => onDealClick?.(deal.id)}
              />
            ))}
        </div>
      )}
    </div>
  );
}
