// components/customers/LeadTemperatureBadge.tsx — Compact temperature pill.
// Staleness flag (30+ days without update) shown as greyed-out with age — handled by parent via isStale prop.

import type { LeadTemperature } from "@/types";

const TEMP_LABELS: Record<LeadTemperature, string> = {
  cold: "Cold",
  warm: "Warm",
  hot: "Hot",
  engaged: "Engaged",
};

/** Full class strings for Tailwind tree-shaking. */
const TEMP_COLORS: Record<LeadTemperature, string> = {
  cold: "bg-slate-100 text-slate-500",
  warm: "bg-yellow-100 text-yellow-700",
  hot: "bg-orange-100 text-orange-700",
  engaged: "bg-green-100 text-green-700",
};

interface LeadTemperatureBadgeProps {
  temperature: LeadTemperature;
  /** When true, renders muted to signal the temperature hasn't been updated in 30+ days. */
  isStale?: boolean;
}

export function LeadTemperatureBadge({ temperature, isStale = false }: LeadTemperatureBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-opacity ${
        isStale ? "opacity-40" : ""
      } ${TEMP_COLORS[temperature]}`}
      title={isStale ? "Temperature not updated in 30+ days" : undefined}
    >
      {TEMP_LABELS[temperature]}
    </span>
  );
}
