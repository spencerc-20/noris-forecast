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
import { RepListRow, REP_LIST_GRID } from "./RepListRow";

interface RepListProps {
  customers: Customer[];
  onFieldChange: (customerId: string, field: EditableField, value: FieldValue) => void;
  /** Total customers in the pipeline (pre-filter) — drives the footer count. */
  totalCount: number;
  /** Open the remove-from-pipeline confirm for this customer. */
  onRequestRemove?: (customer: Customer) => void;
}

// Header layout mirrors the row's 8-col grid exactly (last column is for the
// hover-revealed trash action — header just renders an empty cell there).
const GRID = REP_LIST_GRID;

export function RepList({ customers, onFieldChange, totalCount, onRequestRemove }: RepListProps) {
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
        <div>Timeline</div>
        <div className="text-right">Weighted / On track</div>
        <div />{/* row-actions column header is intentionally blank */}
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
            onRequestRemove={onRequestRemove}
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
