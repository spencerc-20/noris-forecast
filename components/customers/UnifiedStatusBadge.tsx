// components/customers/UnifiedStatusBadge.tsx — Unified display of lifecycleStatus + commissionStatus.
// UI merges both into one "Status" widget per CLAUDE.md 4.7.
// Commission annotation only shows for the current year when a value is set.

import type { CommissionStatusValue, LifecycleStatus } from "@/types";

const LIFECYCLE_STYLES: Record<LifecycleStatus, string> = {
  potential: "bg-zinc-100 text-zinc-600",
  new:       "bg-blue-100 text-blue-700",
  existing:  "bg-emerald-100 text-emerald-700",
  inactive:  "bg-amber-100 text-amber-700",
  lost:      "bg-red-100 text-red-600",
};

const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  potential: "Potential",
  new:       "New prospect",
  existing:  "Existing",
  inactive:  "Inactive",
  lost:      "Lost",
};

const COMMISSION_LABELS: Record<NonNullable<CommissionStatusValue>, string> = {
  new:      "new acct",
  existing: "existing acct",
};

interface UnifiedStatusBadgeProps {
  lifecycleStatus: LifecycleStatus;
  commissionStatus?: Record<number, CommissionStatusValue>;
  /** Defaults to current year. */
  year?: number;
  className?: string;
}

export function UnifiedStatusBadge({
  lifecycleStatus,
  commissionStatus,
  year = new Date().getFullYear(),
  className = "",
}: UnifiedStatusBadgeProps) {
  const commissionValue = commissionStatus?.[year] ?? null;

  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium leading-tight ${LIFECYCLE_STYLES[lifecycleStatus]} ${className}`}
    >
      {LIFECYCLE_LABELS[lifecycleStatus]}
      {commissionValue && (
        <span className="font-normal opacity-75">
          · {COMMISSION_LABELS[commissionValue]}
        </span>
      )}
    </span>
  );
}
