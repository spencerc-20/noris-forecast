// components/forecast/ForecastHeader.tsx — Month-Start vs Current forecast bar with drift and sparkline.
// Sparkline is rendered via the shared Sparkline component, wired to weekly snapshot data.

"use client";

import { formatCurrency, formatDelta } from "@/lib/forecast/calculations";
import { Sparkline } from "@/components/shared/Sparkline";
import type { SparkDatum } from "@/components/shared/Sparkline";

export type { SparkDatum };

interface ForecastHeaderProps {
  monthLabel: string;
  monthStartForecast: number;
  currentForecast: number;
  sparklineData: SparkDatum[];
}

export function ForecastHeader({
  monthLabel,
  monthStartForecast,
  currentForecast,
  sparklineData,
}: ForecastHeaderProps) {
  const delta = currentForecast - monthStartForecast;
  const deltaPositive = delta >= 0;

  return (
    <div className="flex items-center gap-8 rounded-lg border bg-white px-6 py-4 shadow-sm">
      {/* Month-start */}
      <div className="shrink-0">
        <p className="text-xs text-muted-foreground">Month-Start</p>
        <p className="text-xs text-muted-foreground/70 mb-0.5">{monthLabel}</p>
        <p className="text-2xl font-semibold tabular-nums">
          {formatCurrency(monthStartForecast)}
        </p>
      </div>

      <div className="text-muted-foreground/40 text-xl shrink-0">→</div>

      {/* Current */}
      <div className="shrink-0">
        <p className="text-xs text-muted-foreground">Current</p>
        <p className="text-xs text-muted-foreground/70 mb-0.5">weighted</p>
        <p className="text-2xl font-semibold tabular-nums">
          {formatCurrency(currentForecast)}
        </p>
      </div>

      {/* Drift */}
      <div className="shrink-0">
        <p className="text-xs text-muted-foreground">Drift</p>
        <p className="text-xs text-muted-foreground/70 mb-0.5">vs month-start</p>
        <p
          className={`text-2xl font-semibold tabular-nums ${
            deltaPositive ? "text-green-600" : "text-red-600"
          }`}
        >
          {formatDelta(delta)}
        </p>
      </div>

      {/* Sparkline */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-1">Weekly trajectory</p>
        <Sparkline data={sparklineData} height={48} />
      </div>
    </div>
  );
}
