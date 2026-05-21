// components/rep/RepList.tsx — Unified rep customer table (REVAMP v2.0 dark styling).
//
// Spec compliance:
//   - rounded 12px container, 1px border in var(--border-spec)
//   - header row darker (#0d1525-ish via surface-2 dimmed), 10px uppercase muted labels
//   - 13px body rows, border-bottom between rows
//   - count footer with darker bg

"use client";

import type { Customer } from "@/types";
import type { EditableField, FieldValue } from "./RepListRow";
import { RepListRow } from "./RepListRow";

interface RepListProps {
  customers: Customer[];
  onFieldChange: (customerId: string, field: EditableField, value: FieldValue) => void;
  totalCount: number;
}

const GRID = "grid grid-cols-[2fr_90px_140px_120px_120px_140px] gap-3";

export function RepList({ customers, onFieldChange, totalCount }: RepListProps) {
  return (
    <div className="rounded-xl border border-[color:var(--border-spec)] bg-[color:var(--surface)] overflow-hidden">
      {/* Header row — darker bg, uppercase 10px labels */}
      <div
        className={`${GRID} px-4 py-2.5 border-b border-[color:var(--border-spec)] bg-[#0d1525] text-[10px] uppercase tracking-[0.1em] font-medium text-[color:var(--muted-spec)]`}
      >
        <div>Customer / Practice</div>
        <div>Type</div>
        <div>Doc-type</div>
        <div className="text-right">Expected $</div>
        <div className="text-right">Close % / Actual $</div>
        <div className="text-right">Projected / On track</div>
      </div>

      {customers.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-[color:var(--muted-spec)]">
          {totalCount === 0 ? "No customers yet." : "No customers match this filter."}
        </div>
      ) : (
        customers.map((c) => (
          <RepListRow key={c.id} customer={c} onFieldChange={onFieldChange} />
        ))
      )}

      {/* Footer count */}
      <div className="px-4 py-2 bg-[#0d1525] border-t border-[color:var(--border-spec)] text-[11px] text-[color:var(--muted-spec)] tabular-nums">
        {customers.length} of {totalCount} customers
      </div>
    </div>
  );
}
