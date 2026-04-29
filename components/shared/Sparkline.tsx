// components/shared/Sparkline.tsx — Weekly forecast trajectory chart (recharts AreaChart).
// Used in ForecastHeader. data is an array of {label, value} points from buildSparklineData().

"use client";

import {
  AreaChart,
  Area,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "@/lib/forecast/calculations";

export interface SparkDatum {
  label: string;
  value: number;
}

interface SparklineProps {
  data: SparkDatum[];
  height?: number;
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

export function Sparkline({ data, height = 48 }: SparklineProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 4, bottom: 2, left: 4 }}>
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
  );
}
