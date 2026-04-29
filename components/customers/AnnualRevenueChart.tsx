// components/customers/AnnualRevenueChart.tsx — Bar chart of annualRevenue by year using recharts.
// Current year bar is blue; prior years are slate. Zero-value years are excluded.

"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface AnnualRevenueChartProps {
  annualRevenue: Record<number, number>;
}

const CURRENT_YEAR = new Date().getFullYear();

function formatYAxis(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RevenueTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border bg-white px-2 py-1 text-xs shadow">
      <p className="font-medium">{label}</p>
      <p>
        {new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 0,
        }).format(payload[0].value ?? 0)}
      </p>
    </div>
  );
}

export function AnnualRevenueChart({ annualRevenue }: AnnualRevenueChartProps) {
  const data = Object.entries(annualRevenue)
    .map(([year, amount]) => ({ year: Number(year), amount }))
    .filter(({ amount }) => amount !== 0)
    .sort((a, b) => a.year - b.year);

  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart
        data={data}
        margin={{ top: 4, right: 8, bottom: 0, left: 8 }}
        barSize={32}
      >
        <XAxis
          dataKey="year"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={formatYAxis}
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <Tooltip content={<RevenueTooltip />} cursor={{ fill: "#f4f4f5" }} />
        <Bar dataKey="amount" radius={[3, 3, 0, 0]}>
          {data.map(({ year }) => (
            <Cell
              key={year}
              fill={year === CURRENT_YEAR ? "#3b82f6" : "#cbd5e1"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
