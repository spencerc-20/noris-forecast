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
  /** Total customers in the pipeline (pre-filter) — drives the footer count. */
  totalCount: number;
  /** Called when a NEW row's status moves to "Closed" — page handles the conversion. */
  onCloseConversion?: (customer: Customer) => void;
}

// Matches the 7-col grid in RepListRow exactly.
const GRID = "grid grid-cols-[2fr_90px_140px_110px_110px_120px_140px] gap-3";

export function RepList({ customers, onFieldChange, totalCount, onCloseConversion }: RepListProps) {
  return (
    <div className="rounded-xl border border-[color:var(--border-spec)] bg-[color:var(--surface)] overflow-hidden">
      {/* Header row — darker bg, uppercase 10px labels. Column 5/6 labels read
          as the union of New and Existing semantics; the row itself shows the
          right widget based on pipelineType. */}
      <div
        className={`${GRID} px-4 py-2.5 border-b border-[color:var(--border-spec)] bg-[#0d1525] text-[10px] uppercase tracking-[0.1em] font-medium text-[color:var(--muted-spec)]`}
      >
        <div>Customer / Practice</div>
        <div>Type</div>
        <div>Doc-type</div>
        <div className="text-right">Expected $</div>
        <div className="text-right">Close % / Actual $</div>
        <div>Status</div>
        <div className="text-right">Weighted / On track</div>
      </div>

      {customers.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-[color:var(--muted-spec)]">
          {totalCount === 0
            ? "Your pipeline is empty. Click + Add to pipeline to start."
            : "No customers match this filter."}
        </div>
      ) : (
        customers.map((c) => (
          <RepListRow
            key={c.id}
            customer={c}
            onFieldChange={onFieldChange}
            onCloseConversion={onCloseConversion}
          />
        ))
      )}

      {/* Footer count */}
      <div className="px-4 py-2 bg-[#0d1525] border-t border-[color:var(--border-spec)] text-[11px] text-[color:var(--muted-spec)] tabular-nums">
        {customers.length} of {totalCount} customers
      </div>
    </div>
  );
}
