// components/forecast/ForecastHeader.tsx — Month-Start vs Current forecast bar with drift and sparkline.
// Sparkline uses recharts AreaChart. Real snapshot data wired in Session 6.

"use client";

import { formatCurrency, formatDelta } from "@/lib/forecast/calculations";
import {
  AreaChart,
  Area,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface SparkDatum {
  label: string;
  value: number;
}

interface ForecastHeaderProps {
  monthLabel: string; // e.g. "April 2026"
  monthStartForecast: number;
  currentForecast: number;
  sparklineData: SparkDatum[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SparkTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border bg-white px-2 py-1 text-xs shadow">
      <p className="font-medium">{label}</p>
      <p>{formatCurrency(payload[0].value ?? 0)}</p>
    </div>
  );
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
        <ResponsiveContainer width="100%" height={48}>
          <AreaChart
            data={sparklineData}
            margin={{ top: 2, right: 4, bottom: 2, left: 4 }}
          >
            <defs>
              <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke="#3b82f6"
              strokeWidth={1.5}
              fill="url(#sparkGrad)"
              dot={false}
              activeDot={{ r: 3 }}
            />
            <Tooltip content={<SparkTooltip />} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
