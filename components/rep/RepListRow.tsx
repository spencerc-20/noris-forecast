// components/rep/RepListRow.tsx — Single editable row in the unified rep list.
//
// REVAMP v2.0 + pipeline-fixes Step 3: NEW and EXISTING rows now show
// fundamentally different columns:
//
//   NEW row     │ Customer │ Type │ Doc-type │ Expected $ │ Close %  │ Status     │ Weighted (ro)
//   EXISTING    │ Customer │ Type │ Doc-type │ Expected $ │ Actual $ │ —          │ On-track %  (ro)
//
// The 5th column is fundamentally different ($ for existing vs % for new), the
// 6th column is the new "Status" dropdown for new rows (Step 4) or blank for
// existing, and the 7th column is the read-only computed metric.
//
// Number inputs render their unit symbol as a SUFFIX inside the same cell so
// the value stays right-aligned and the symbol stays visually attached.

"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Customer, DocType, PipelineType } from "@/types";
import { DOC_TYPE_LABELS, DOC_TYPE_ORDER } from "@/types";
import {
  formatDollars,
  onTrackPctFor,
  onTrackStatusFor,
  weightedTotalFor,
} from "@/lib/forecast/repMetrics";
import { NotesCell } from "./NotesCell";

export type EditableField =
  | "pipelineType"
  | "docType"
  | "docTypeIsOverride"
  | "expectedMonthlyTotal"
  | "closeProbability"
  | "expectedMonthly"
  | "actualThisMonth"
  | "newStatus"
  | "inPipeline"
  | "notes";

export type NewStatus = "new_potential" | "actively_working" | "closed";

export type FieldValue = string | number | boolean | null;

interface RepListRowProps {
  customer: Customer;
  onFieldChange: (customerId: string, field: EditableField, value: FieldValue) => void;
  /**
   * Row remove action — the page opens a confirm dialog, and on confirm
   * patches `inPipeline=false`. We don't perform the soft-delete here so
   * a single ConfirmDialog instance can be reused across all rows.
   */
  onRequestRemove?: (customer: Customer) => void;
}

// ── Colour map ──────────────────────────────────────────────────────────────

const ON_TRACK_TEXT: Record<ReturnType<typeof onTrackStatusFor>, string> = {
  on_track: "text-[color:var(--good)]",
  close:    "text-[color:var(--warn)]",
  behind:   "text-[color:var(--bad)]",
  unknown:  "text-[color:var(--muted-spec)]",
};

// ── Cell primitives ──────────────────────────────────────────────────────────

/**
 * Transparent-until-hover numeric cell. The unit symbol ("$" or "%") sits
 * INSIDE the input box as a suffix so the value and its unit stay visually
 * joined no matter how wide the cell is.
 */
function NumberCell({
  value,
  onCommit,
  unit,
  placeholder = "—",
  max,
  min,
}: {
  value: number | undefined;
  onCommit: (parsed: number) => void;
  /** "$" rendered as prefix; "%" rendered as suffix. */
  unit: "$" | "%";
  placeholder?: string;
  max?: number;
  min?: number;
}) {
  const [draft, setDraft] = useState<string>(value != null ? String(value) : "");

  useEffect(() => {
    setDraft(value != null ? String(value) : "");
  }, [value]);

  const commit = () => {
    const cleaned = draft.replace(/[^0-9.\-]/g, "");
    const parsed = parseFloat(cleaned);
    let next = isFinite(parsed) ? parsed : 0;
    if (min != null) next = Math.max(min, next);
    if (max != null) next = Math.min(max, next);
    if (next !== (value ?? 0)) onCommit(next);
  };

  // One unified pill: transparent border until hover, accent on focus.
  // Prefix ($) on the left, suffix (%) on the right — both muted.
  return (
    <label
      className="
        group inline-flex items-center justify-end gap-0.5
        border border-transparent rounded-md px-1.5 py-0.5 w-full
        transition-colors cursor-text
        hover:border-[color:var(--border-spec)]
        focus-within:border-[color:var(--noris)]
        focus-within:bg-[color:var(--surface-2)]
      "
    >
      {unit === "$" && (
        <span className="text-[11px] text-[color:var(--muted-spec)] select-none">$</span>
      )}
      <input
        value={draft}
        placeholder={placeholder}
        inputMode="decimal"
        onChange={(e) => {
          setDraft(e.target.value);
          const cleaned = e.target.value.replace(/[^0-9.\-]/g, "");
          const parsed = parseFloat(cleaned);
          let next = isFinite(parsed) ? parsed : 0;
          if (min != null) next = Math.max(min, next);
          if (max != null) next = Math.min(max, next);
          onCommit(next);
        }}
        onBlur={commit}
        className="
          flex-1 min-w-0 text-right tabular-nums text-[13px] bg-transparent
          border-0 outline-none p-0
          text-[color:var(--text-spec)] placeholder:text-[color:var(--muted-spec)]
        "
      />
      {unit === "%" && (
        <span className="text-[11px] text-[color:var(--muted-spec)] select-none">%</span>
      )}
    </label>
  );
}

function DocTypeCell({
  customer,
  onChange,
}: {
  customer: Customer;
  onChange: (next: DocType) => void;
}) {
  return (
    <select
      value={customer.docType}
      onChange={(e) => onChange(e.target.value as DocType)}
      title={
        customer.docTypeIsOverride
          ? "Manually overridden — won't be re-derived on next import"
          : "Auto-derived from Sheet 2 unit mix"
      }
      className="
        w-full text-[12px] bg-transparent border border-transparent rounded-md
        px-1.5 py-0.5 cursor-pointer
        text-[color:var(--text-spec)]
        transition-colors
        hover:border-[color:var(--border-spec)]
        focus:border-[color:var(--noris)]
        focus:bg-[color:var(--surface-2)]
        focus:outline-none
      "
    >
      {DOC_TYPE_ORDER.map((d) => (
        <option key={d} value={d} className="bg-[color:var(--surface-2)] text-[color:var(--text-spec)]">
          {DOC_TYPE_LABELS[d]}
        </option>
      ))}
    </select>
  );
}

/**
 * Pipeline-type cell — an editable dropdown so reps can flip both ways
 * (NEW ↔ EXISTING) directly. Manual flips are immediate — they don't go
 * through the close→rollover path. Background colour cues stay consistent
 * with the prior chip style so reps can scan a column quickly.
 *
 * Note: the underlying <select> control inherits its background from
 * `bg`-class on the parent (set per state below). Native option dropdowns
 * always render in the OS theme — we use surface-2 + text-spec to harmonise.
 */
function PipelineCell({
  customer,
  onChange,
}: {
  customer: Customer;
  onChange: (next: PipelineType) => void;
}) {
  const isNew = customer.pipelineType === "new";
  return (
    <select
      value={customer.pipelineType}
      onChange={(e) => onChange(e.target.value as PipelineType)}
      title="Flip pipeline type (new prospect ↔ existing recurring)"
      className={`
        rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide
        cursor-pointer transition-colors
        focus:outline-none
        ${
          isNew
            ? "border-[#3b6aff]/40 bg-[#3b6aff]/15 text-[#9ab3ff] hover:border-[#3b6aff]/70 focus:border-[#3b6aff]"
            : "border-[color:var(--good)]/40 bg-[color:var(--good)]/15 text-[color:var(--good)] hover:border-[color:var(--good)] focus:border-[color:var(--good)]"
        }
      `}
    >
      <option value="new" className="bg-[color:var(--surface-2)] text-[color:var(--text-spec)]">
        NEW
      </option>
      <option value="existing" className="bg-[color:var(--surface-2)] text-[color:var(--text-spec)]">
        EXISTING
      </option>
    </select>
  );
}

/**
 * 3-stage new-business status dropdown.
 *   new_potential    — default; recently added, no real engagement
 *   actively_working — in conversation / quoting
 *   closed           — deal closed THIS month; stays pipelineType="new" until
 *                      month rollover promotes it to EXISTING in the next month.
 *
 * Legacy "prospecting" maps to "new_potential" when read back.
 */
function NewStatusCell({
  customer,
  onChange,
}: {
  customer: Customer;
  onChange: (next: NewStatus) => void;
}) {
  // Coerce legacy "prospecting" into "new_potential" for the dropdown.
  const raw = customer.newStatus ?? "new_potential";
  const status: NewStatus = raw === "prospecting" ? "new_potential" : (raw as NewStatus);

  return (
    <select
      value={status}
      onChange={(e) => onChange(e.target.value as NewStatus)}
      className={`
        w-full text-[12px] border rounded-md
        px-1.5 py-0.5 cursor-pointer
        transition-colors
        focus:outline-none
        focus:border-[color:var(--noris)]
        focus:bg-[color:var(--surface-2)]
        ${
          status === "closed"
            ? "bg-[color:var(--good)]/15 border-[color:var(--good)]/40 text-[color:var(--good)]"
            : status === "actively_working"
            ? "bg-[color:var(--warn)]/15 border-[color:var(--warn)]/40 text-[color:var(--warn)]"
            : "bg-transparent border-transparent text-[color:var(--text-spec)] hover:border-[color:var(--border-spec)]"
        }
      `}
      title={
        status === "closed"
          ? "Closed this month — counts in the month's new-business total at 100%. Converts to EXISTING on next month's rollover."
          : status === "actively_working"
          ? "Actively working — in conversation / quoting"
          : "New potential — recently added"
      }
    >
      <option value="new_potential" className="bg-[color:var(--surface-2)] text-[color:var(--text-spec)]">
        New Potential
      </option>
      <option value="actively_working" className="bg-[color:var(--surface-2)] text-[color:var(--text-spec)]">
        Actively Working
      </option>
      <option value="closed" className="bg-[color:var(--surface-2)] text-[color:var(--text-spec)]">
        Closed
      </option>
    </select>
  );
}

// ── Main row ─────────────────────────────────────────────────────────────────

// Shared 8-col grid: customer · type · doc-type · expected · prob/actual · status · projected · actions
// The trailing actions column is intentionally narrow (28px) and its icon is
// hover-revealed so the row stays visually quiet at rest.
const GRID = "grid grid-cols-[2fr_90px_140px_110px_110px_120px_140px_28px] gap-3";
// Export the grid template so RepList's header row can match it exactly.
export const REP_LIST_GRID = GRID;

export function RepListRow({ customer, onFieldChange, onRequestRemove }: RepListRowProps) {
  const isNew = customer.pipelineType === "new";
  const weighted = weightedTotalFor(customer);
  const trackPct = onTrackPctFor(customer);
  const trackStatus = onTrackStatusFor(trackPct);

  // A row is two stacked elements: the 7-col data grid above, then the notes
  // sub-row below. Both share the hover background so the row reads as one
  // unit visually.
  return (
    <div className="border-b border-[color:var(--border-spec)]/60 last:border-b-0 hover:bg-[color:var(--surface-2)]/40 transition-colors group/row">
    <div
      className={`${GRID} items-center px-4 pt-2 pb-1 text-[13px]`}
    >
      {/* Customer / Practice */}
      <div className="min-w-0">
        <p className="font-medium truncate text-[color:var(--text-spec)]">{customer.name}</p>
        {customer.practiceName && (
          <p className="text-[11px] text-[color:var(--muted-spec)] truncate">
            {customer.practiceName}
          </p>
        )}
      </div>

      {/* Pipeline type chip */}
      <div>
        <PipelineCell
          customer={customer}
          onChange={(next) => onFieldChange(customer.id, "pipelineType", next)}
        />
      </div>

      {/* Doc-type */}
      <div>
        <DocTypeCell
          customer={customer}
          onChange={(next) => {
            onFieldChange(customer.id, "docType", next);
            onFieldChange(customer.id, "docTypeIsOverride", true);
          }}
        />
      </div>

      {/* Expected $ — same field name (just rep-meaning differs) */}
      <div>
        {isNew ? (
          <NumberCell
            value={customer.expectedMonthlyTotal}
            onCommit={(v) => onFieldChange(customer.id, "expectedMonthlyTotal", v)}
            unit="$"
            min={0}
          />
        ) : (
          <NumberCell
            value={customer.expectedMonthly}
            onCommit={(v) => onFieldChange(customer.id, "expectedMonthly", v)}
            unit="$"
            min={0}
          />
        )}
      </div>

      {/* Close % (new) or Actual $ (existing) — column 5 */}
      <div>
        {isNew ? (
          <NumberCell
            value={customer.closeProbability}
            onCommit={(v) => onFieldChange(customer.id, "closeProbability", v)}
            unit="%"
            min={0}
            max={100}
          />
        ) : (
          <NumberCell
            value={customer.actualThisMonth}
            onCommit={(v) => onFieldChange(customer.id, "actualThisMonth", v)}
            unit="$"
            min={0}
          />
        )}
      </div>

      {/* Status — only NEW rows show the 3-stage dropdown */}
      <div>
        {isNew ? (
          <NewStatusCell
            customer={customer}
            onChange={(next) => {
              onFieldChange(customer.id, "newStatus", next);
              // Closing snaps the close% to 100 so the weighted line equals
              // the dollar amount this month. (Backing out of Closed leaves
              // the prior close% in place — the rep can re-tune manually.)
              if (next === "closed") {
                onFieldChange(customer.id, "closeProbability", 100);
              }
            }}
          />
        ) : (
          <span className="text-[11px] text-[color:var(--muted-spec)] tabular-nums pl-1.5">
            recurring
          </span>
        )}
      </div>

      {/* Projected / On-track — read-only computed */}
      <div className="text-right text-[12px] tabular-nums">
        {isNew ? (
          <span className="text-[color:var(--text-spec)]">
            {formatDollars(weighted)}{" "}
            <span className="text-[color:var(--muted-spec)]">weighted</span>
          </span>
        ) : (
          <span className={ON_TRACK_TEXT[trackStatus]}>
            {trackPct == null ? "—" : `${trackPct}% on track`}
          </span>
        )}
      </div>

      {/* Row actions — hover-revealed trash icon. Soft delete only (inPipeline=false). */}
      <div className="flex justify-end">
        {onRequestRemove && (
          <button
            onClick={() => onRequestRemove(customer)}
            title="Remove from pipeline (customer record is preserved in the background)"
            aria-label={`Remove ${customer.name} from pipeline`}
            className="
              opacity-0 group-hover/row:opacity-100 focus:opacity-100
              rounded p-1 text-[color:var(--muted-spec)]
              hover:text-[color:var(--bad)] hover:bg-[color:var(--bad)]/10
              transition-opacity transition-colors
              focus:outline-none focus:ring-1 focus:ring-[color:var(--bad)]/40
            "
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>

    {/* Notes sub-row — customer-level, persists across months. */}
    <NotesCell
      value={customer.notes ?? ""}
      onChange={(next) => onFieldChange(customer.id, "notes", next)}
    />
    </div>
  );
}
