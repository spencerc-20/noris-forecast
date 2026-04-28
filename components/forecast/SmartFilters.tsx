// components/forecast/SmartFilters.tsx — Quick-filter strip for the deal list.
// Parent owns filter state; this component is purely presentational + calls back on change.
// Advanced filters (needs attention, by structure) wired in Session 2+.

"use client";

import type { ProcedureTier, LeadTemperature } from "@/types";

export type DateFilter = "this_month" | "next_month" | null;

interface SmartFiltersProps {
  activeDateFilter: DateFilter;
  activeTier: ProcedureTier | null;
  activeTemperature: LeadTemperature | null;
  onDateFilterChange: (f: DateFilter) => void;
  onTierChange: (t: ProcedureTier | null) => void;
  onTemperatureChange: (t: LeadTemperature | null) => void;
}

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "next_month", label: "Next month" },
];

const TIER_OPTIONS: { value: ProcedureTier; label: string }[] = [
  { value: "everything", label: "Everything" },
  { value: "full_arch", label: "Full Arch" },
  { value: "ra_only", label: "RA Only" },
  { value: "standard", label: "Standard" },
  { value: "course", label: "Course" },
  { value: "tools", label: "Tools" },
];

const TEMP_OPTIONS: { value: LeadTemperature; label: string }[] = [
  { value: "hot", label: "🔥 Hot" },
  { value: "engaged", label: "✅ Engaged" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
];

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-zinc-900 bg-zinc-900 text-white"
          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
      }`}
    >
      {children}
    </button>
  );
}

export function SmartFilters({
  activeDateFilter,
  activeTier,
  activeTemperature,
  onDateFilterChange,
  onTierChange,
  onTemperatureChange,
}: SmartFiltersProps) {
  const hasAnyFilter = activeDateFilter || activeTier || activeTemperature;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Date range filters */}
      {DATE_FILTERS.map(({ key, label }) => (
        <FilterChip
          key={key}
          active={activeDateFilter === key}
          onClick={() => onDateFilterChange(activeDateFilter === key ? null : key)}
        >
          {label}
        </FilterChip>
      ))}

      <div className="h-4 w-px bg-zinc-200" />

      {/* Tier filter */}
      <select
        value={activeTier ?? ""}
        onChange={(e) =>
          onTierChange((e.target.value as ProcedureTier) || null)
        }
        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors outline-none cursor-pointer ${
          activeTier
            ? "border-zinc-900 bg-zinc-900 text-white"
            : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400"
        }`}
      >
        <option value="">By tier</option>
        {TIER_OPTIONS.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {/* Temperature filter */}
      <select
        value={activeTemperature ?? ""}
        onChange={(e) =>
          onTemperatureChange((e.target.value as LeadTemperature) || null)
        }
        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors outline-none cursor-pointer ${
          activeTemperature
            ? "border-zinc-900 bg-zinc-900 text-white"
            : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400"
        }`}
      >
        <option value="">By temperature</option>
        {TEMP_OPTIONS.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {/* Clear all */}
      {hasAnyFilter && (
        <>
          <div className="h-4 w-px bg-zinc-200" />
          <button
            onClick={() => {
              onDateFilterChange(null);
              onTierChange(null);
              onTemperatureChange(null);
            }}
            className="text-xs text-muted-foreground hover:text-zinc-900"
          >
            Clear
          </button>
        </>
      )}
    </div>
  );
}
