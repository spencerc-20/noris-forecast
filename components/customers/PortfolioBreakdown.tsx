// components/customers/PortfolioBreakdown.tsx — Visual breakdown of customer portfolio by profile, temperature, lifecycle, and commission.

"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { Customer } from "@/types";
import type { CustomerProfile, LeadTemperature, LifecycleStatus } from "@/types";

interface PortfolioBreakdownProps {
  customers: Customer[];
}

const PROFILE_LABELS: Record<CustomerProfile, string> = {
  everything: "Everything",
  full_arch: "Full arch",
  ra_only: "RA only",
  standard: "Standard",
  course_only: "Course",
  tools_only: "Tools",
  new: "New",
};

const PROFILE_COLORS: Record<CustomerProfile, string> = {
  everything: "#7c3aed",
  full_arch: "#4338ca",
  ra_only: "#1d4ed8",
  standard: "#0284c7",
  course_only: "#d97706",
  tools_only: "#71717a",
  new: "#a1a1aa",
};

const TEMP_LABELS: Record<LeadTemperature, string> = {
  cold: "Cold",
  warm: "Warm",
  hot: "Hot",
  engaged: "Engaged",
};

const TEMP_COLORS: Record<LeadTemperature, string> = {
  cold: "#94a3b8",
  warm: "#fb923c",
  hot: "#ef4444",
  engaged: "#10b981",
};

const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  potential: "Potential",
  new: "New",
  existing: "Existing",
  inactive: "Inactive",
  lost: "Lost",
};

const LIFECYCLE_COLORS: Record<LifecycleStatus, string> = {
  potential: "#94a3b8",
  new: "#60a5fa",
  existing: "#10b981",
  inactive: "#f59e0b",
  lost: "#ef4444",
};

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-white px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums mt-0.5">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export function PortfolioBreakdown({ customers }: PortfolioBreakdownProps) {
  const currentYear = new Date().getFullYear();

  const active = useMemo(
    () => customers.filter((c) => c.lifecycleStatus !== "lost"),
    [customers]
  );

  // Profile distribution (bar chart data)
  const profileData = useMemo(() => {
    const counts: Partial<Record<CustomerProfile, number>> = {};
    for (const c of active) {
      counts[c.profile] = (counts[c.profile] ?? 0) + 1;
    }
    const order: CustomerProfile[] = [
      "everything", "full_arch", "ra_only", "standard", "course_only", "tools_only", "new",
    ];
    return order
      .filter((p) => (counts[p] ?? 0) > 0)
      .map((p) => ({ profile: p, label: PROFILE_LABELS[p], count: counts[p] ?? 0, color: PROFILE_COLORS[p] }));
  }, [active]);

  // Temperature counts
  const tempCounts = useMemo(() => {
    const counts: Partial<Record<LeadTemperature, number>> = {};
    for (const c of active) {
      if (c.leadTemperature) counts[c.leadTemperature] = (counts[c.leadTemperature] ?? 0) + 1;
    }
    return counts;
  }, [active]);

  // Lifecycle counts
  const lifecycleCounts = useMemo(() => {
    const counts: Partial<Record<LifecycleStatus, number>> = {};
    for (const c of customers) {
      counts[c.lifecycleStatus] = (counts[c.lifecycleStatus] ?? 0) + 1;
    }
    return counts;
  }, [customers]);

  // Commission status for current year
  const commissionCounts = useMemo(() => {
    let newAcct = 0, existing = 0, none = 0;
    for (const c of active) {
      const status = c.commissionStatus?.[currentYear];
      if (status === "new") newAcct++;
      else if (status === "existing") existing++;
      else none++;
    }
    return { new: newAcct, existing, none };
  }, [active, currentYear]);

  if (customers.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center text-sm text-muted-foreground">
        No customers yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top-line stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total customers" value={customers.length} />
        <StatCard label="Active" value={active.length} />
        <StatCard
          label={`New accts ${currentYear}`}
          value={commissionCounts.new}
          sub="commission-grade"
        />
        <StatCard
          label={`Existing accts ${currentYear}`}
          value={commissionCounts.existing}
          sub="commission-grade"
        />
      </div>

      {/* Profile bar chart */}
      <div className="rounded-lg border bg-white p-4 space-y-2">
        <h3 className="text-sm font-medium">Customer profile distribution</h3>
        <p className="text-xs text-muted-foreground">Active customers by highest clinical tier reached</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={profileData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fontSize: 11 }}
                width={72}
              />
              <Tooltip
                formatter={(value) => [`${value} customers`, "Count"]}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                {profileData.map((entry) => (
                  <Cell key={entry.profile} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Temperature breakdown */}
      <div className="rounded-lg border bg-white p-4 space-y-3">
        <h3 className="text-sm font-medium">Lead temperature</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(["hot", "engaged", "warm", "cold"] as LeadTemperature[]).map((t) => {
            const count = tempCounts[t] ?? 0;
            return (
              <div key={t} className="rounded-lg border px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: TEMP_COLORS[t] }}
                  />
                  <span className="text-xs font-medium">{TEMP_LABELS[t]}</span>
                </div>
                <p className="text-xl font-semibold tabular-nums">{count}</p>
                <p className="text-xs text-muted-foreground">
                  {active.length > 0 ? Math.round((count / active.length) * 100) : 0}%
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lifecycle breakdown */}
      <div className="rounded-lg border bg-white p-4 space-y-3">
        <h3 className="text-sm font-medium">Lifecycle status</h3>
        <div className="flex flex-wrap gap-3">
          {(["existing", "new", "potential", "inactive", "lost"] as LifecycleStatus[]).map((s) => {
            const count = lifecycleCounts[s] ?? 0;
            if (count === 0) return null;
            return (
              <div key={s} className="flex items-center gap-2 rounded-full border px-3 py-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: LIFECYCLE_COLORS[s] }}
                />
                <span className="text-sm font-medium tabular-nums">{count}</span>
                <span className="text-xs text-muted-foreground">{LIFECYCLE_LABELS[s]}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
