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
import type { Customer, DocType, PipelineType } from "@/types";
import { DOC_TYPE_LABELS, DOC_TYPE_ORDER } from "@/types";
import {
  formatDollars,
  onTrackPctFor,
  onTrackStatusFor,
  weightedTotalFor,
} from "@/lib/forecast/repMetrics";

export type EditableField =
  | "pipelineType"
  | "docType"
  | "docTypeIsOverride"
  | "expectedMonthlyTotal"
  | "closeProbability"
  | "expectedMonthly"
  | "actualThisMonth"
  | "newStatus"
  | "inPipeline";

export type FieldValue = string | number | boolean | null;

interface RepListRowProps {
  customer: Customer;
  onFieldChange: (customerId: string, field: EditableField, value: FieldValue) => void;
  /** Called when the rep moves a NEW row to "Closed" — converts to EXISTING. */
  onCloseConversion?: (customer: Customer) => void;
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

function PipelineCell({
  customer,
  onChange,
}: {
  customer: Customer;
  onChange: (next: PipelineType) => void;
}) {
  const isNew = customer.pipelineType === "new";
  return (
    <button
      onClick={() => onChange(isNew ? "existing" : "new")}
      title="Click to toggle pipeline type"
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide transition-colors ${
        isNew
          ? "border-[#3b6aff]/40 bg-[#3b6aff]/15 text-[#9ab3ff]"
          : "border-[color:var(--good)]/40 bg-[color:var(--good)]/15 text-[color:var(--good)]"
      }`}
    >
      {isNew ? "NEW" : "EXISTING"}
    </button>
  );
}

/** "Prospecting" / "Closed" status dropdown on NEW rows. */
function NewStatusCell({
  customer,
  onChange,
}: {
  customer: Customer;
  onChange: (next: "prospecting" | "closed") => void;
}) {
  const status = customer.newStatus ?? "prospecting";
  return (
    <select
      value={status}
      onChange={(e) => onChange(e.target.value as "prospecting" | "closed")}
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
      title={
        status === "closed"
          ? "Closed — picking this will convert the row to an EXISTING recurring account"
          : "In active prospecting"
      }
    >
      <option value="prospecting" className="bg-[color:var(--surface-2)] text-[color:var(--text-spec)]">
        Prospecting
      </option>
      <option value="closed" className="bg-[color:var(--surface-2)] text-[color:var(--text-spec)]">
        Close → Existing
      </option>
    </select>
  );
}

// ── Main row ─────────────────────────────────────────────────────────────────

// Shared 7-col grid: customer · type · doc-type · expected · prob/actual · status · projected
const GRID = "grid grid-cols-[2fr_90px_140px_110px_110px_120px_140px] gap-3";

export function RepListRow({ customer, onFieldChange, onCloseConversion }: RepListRowProps) {
  const isNew = customer.pipelineType === "new";
  const weighted = weightedTotalFor(customer);
  const trackPct = onTrackPctFor(customer);
  const trackStatus = onTrackStatusFor(trackPct);

  return (
    <div
      className={`${GRID} items-center px-4 py-2 border-b border-[color:var(--border-spec)]/60 last:border-b-0 text-[13px] hover:bg-[color:var(--surface-2)]/40 transition-colors`}
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

      {/* Status — only NEW rows show the Prospecting / Closed dropdown */}
      <div>
        {isNew ? (
          <NewStatusCell
            customer={customer}
            onChange={(next) => {
              if (next === "closed" && onCloseConversion) {
                onCloseConversion(customer);
              } else {
                onFieldChange(customer.id, "newStatus", next);
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
    </div>
  );
}
