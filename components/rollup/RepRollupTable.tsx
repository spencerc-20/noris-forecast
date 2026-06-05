// components/rollup/RepRollupTable.tsx — Wrapper table for rep rollup rows (dark theme).

"use client";

import type { Customer } from "@/types";
import { RepRollupRow } from "./RepRollupRow";

export interface RepRollupEntry {
  name: string;
  region: string;
  customers: Customer[];
}

interface RepRollupTableProps {
  reps: RepRollupEntry[];
  emptyLabel?: string;
  /** Manager / VP / admin can edit the Actual $ on EXISTING drilldown rows. */
  canEditActuals?: boolean;
  /** Required when canEditActuals is true (per-month write path). */
  viewMonth?: string;
}

const GRID = "grid grid-cols-[24px_2fr_1fr_1fr_1fr_1fr_140px] gap-3";

export function RepRollupTable({
  reps,
  emptyLabel = "No reps to display.",
  canEditActuals = false,
  viewMonth,
}: RepRollupTableProps) {
  return (
    <div className="rounded-xl border border-[color:var(--border-spec)] bg-[color:var(--surface)] overflow-hidden">
      <div
        className={`${GRID} px-4 py-2.5 border-b border-[color:var(--border-spec)] bg-[#0d1525] text-[10px] uppercase tracking-[0.1em] font-medium text-[color:var(--muted-spec)]`}
      >
        <div />
        <div>Rep / Region</div>
        <div className="text-right">New (weighted)</div>
        <div className="text-right">Existing expected</div>
        <div className="text-right">Existing actual</div>
        <div className="text-right">On track</div>
        <div className="text-right">Combined</div>
      </div>

      {reps.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-[color:var(--muted-spec)]">
          {emptyLabel}
        </div>
      ) : (
        reps.map((r) => (
          <RepRollupRow
            key={r.name + r.region}
            repName={r.name}
            region={r.region}
            customers={r.customers}
            canEditActuals={canEditActuals}
            viewMonth={viewMonth}
          />
        ))
      )}
    </div>
  );
}
