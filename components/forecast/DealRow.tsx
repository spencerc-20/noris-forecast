// components/forecast/DealRow.tsx — Single row in the deal list.
// leadTemperature comes from the customer record — passed as a separate prop since
// it's not on the Deal type. In Session 3 this will be joined by customerId when loading deals.

"use client";

import type { Deal, LeadTemperature } from "@/types";
import { TierPill } from "./TierPill";
import { StructurePill } from "./StructurePill";
import { StagePill } from "@/components/shared/StagePill";
import { LeadTemperatureBadge } from "@/components/customers/LeadTemperatureBadge";
import { OverrideIndicator } from "@/components/shared/OverrideIndicator";
import { formatCurrency, weightedValue } from "@/lib/forecast/calculations";
import { format, parseISO } from "date-fns";

interface DealRowProps {
  deal: Deal;
  /** Lead temperature from the customer record. Passed separately — not on Deal type. */
  leadTemperature?: LeadTemperature;
  onClick?: () => void;
}

export function DealRow({ deal, leadTemperature, onClick }: DealRowProps) {
  const wv = weightedValue(deal);

  return (
    <div
      role="button"
      tabIndex={0}
      className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-50 cursor-pointer border-b last:border-b-0 transition-colors"
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
    >
      {/* Primary: customer name + override indicator */}
      <div className="min-w-0 flex-[2]">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{deal.customerName}</span>
          {deal.isOverride && (
            <OverrideIndicator reason={deal.overrideReason} />
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <TierPill tier={deal.procedureTier} />
          <StructurePill structure={deal.dealStructure} />
          <StagePill stage={deal.stage} />
        </div>
      </div>

      {/* Financial */}
      <div className="text-right shrink-0 min-w-[120px]">
        <div className="text-sm font-medium tabular-nums">
          {formatCurrency(deal.dealValue)}
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {deal.closeProbability}% → {formatCurrency(wv)}
        </div>
      </div>

      {/* Next meeting */}
      <div className="text-right shrink-0 min-w-[70px]">
        {deal.nextMeetingDate ? (
          <div className="text-xs text-muted-foreground">
            {format(parseISO(deal.nextMeetingDate), "MMM d")}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground/40">—</div>
        )}
      </div>

      {/* Temperature */}
      <div className="shrink-0 w-[72px] flex justify-end">
        {leadTemperature ? (
          <LeadTemperatureBadge temperature={leadTemperature} />
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </div>
    </div>
  );
}
