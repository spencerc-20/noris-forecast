// components/rep/RepListRow.tsx — Single editable row in the unified rep list.
//
// REVAMP v2.0 styling — the spec's signature interaction:
//   "Inline editable cells — inputs are transparent until hover (border appears)
//    / focus (accent border + dark bg). No separate edit mode. Type → it saves."
//
// We implement that exactly: every input is transparent by default, gets a faint
// border on hover, and an accent (Noris red) border plus a darker fill on focus.
//
// Behaviour (unchanged from Step 3):
//   - NEW rows  → expectedMonthlyTotal, closeProbability, weightedTotal (computed)
//   - EXISTING  → expectedMonthly, actualThisMonth, on-track %     (computed)

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
  | "actualThisMonth";

export type FieldValue = string | number | boolean | null;

interface RepListRowProps {
  customer: Customer;
  onFieldChange: (customerId: string, field: EditableField, value: FieldValue) => void;
}

// ── Status colour map (text + chip backgrounds) ──────────────────────────────

const ON_TRACK_TEXT: Record<ReturnType<typeof onTrackStatusFor>, string> = {
  on_track: "text-[color:var(--good)]",
  close:    "text-[color:var(--warn)]",
  behind:   "text-[color:var(--bad)]",
  unknown:  "text-[color:var(--muted-spec)]",
};

// ── Cell primitives ──────────────────────────────────────────────────────────

/**
 * Transparent-until-hover numeric cell. The "border appears" / "accent border
 * on focus" interaction is achieved with Tailwind border colour transitions.
 */
function NumberCell({
  value,
  onCommit,
  prefix,
  placeholder = "—",
}: {
  value: number | undefined;
  onCommit: (parsed: number) => void;
  prefix?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState<string>(value != null ? String(value) : "");

  // Re-sync if the upstream value moves (e.g. another tab editing the same customer).
  useEffect(() => {
    setDraft(value != null ? String(value) : "");
  }, [value]);

  const commit = () => {
    const cleaned = draft.replace(/[^0-9.\-]/g, "");
    const parsed = parseFloat(cleaned);
    const next = isFinite(parsed) ? parsed : 0;
    if (next !== (value ?? 0)) onCommit(next);
  };

  return (
    <div className="flex items-center justify-end gap-1 group">
      {prefix && (
        <span className="text-[11px] text-[color:var(--muted-spec)]">{prefix}</span>
      )}
      <input
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          setDraft(e.target.value);
          const cleaned = e.target.value.replace(/[^0-9.\-]/g, "");
          const parsed = parseFloat(cleaned);
          onCommit(isFinite(parsed) ? parsed : 0);
        }}
        onBlur={commit}
        className="
          w-20 text-right tabular-nums text-[13px] bg-transparent
          border border-transparent rounded-md px-1.5 py-0.5
          text-[color:var(--text-spec)] placeholder:text-[color:var(--muted-spec)]
          transition-colors
          group-hover:border-[color:var(--border-spec)]
          focus:border-[color:var(--noris)]
          focus:bg-[color:var(--surface-2)]
          focus:outline-none
        "
      />
    </div>
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
        text-[12px] bg-transparent border border-transparent rounded-md
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

// ── Main row ─────────────────────────────────────────────────────────────────

const GRID = "grid grid-cols-[2fr_90px_140px_120px_120px_140px] gap-3";

export function RepListRow({ customer, onFieldChange }: RepListRowProps) {
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

      <div>
        <PipelineCell
          customer={customer}
          onChange={(next) => onFieldChange(customer.id, "pipelineType", next)}
        />
      </div>

      <div>
        <DocTypeCell
          customer={customer}
          onChange={(next) => {
            onFieldChange(customer.id, "docType", next);
            // Picking a doc-type by hand pins it so Sheet 2 re-imports don't overwrite.
            onFieldChange(customer.id, "docTypeIsOverride", true);
          }}
        />
      </div>

      <div>
        {isNew ? (
          <NumberCell
            value={customer.expectedMonthlyTotal}
            onCommit={(v) => onFieldChange(customer.id, "expectedMonthlyTotal", v)}
            prefix="$"
          />
        ) : (
          <NumberCell
            value={customer.expectedMonthly}
            onCommit={(v) => onFieldChange(customer.id, "expectedMonthly", v)}
            prefix="$"
          />
        )}
      </div>

      <div>
        {isNew ? (
          <NumberCell
            value={customer.closeProbability}
            onCommit={(v) => {
              const clamped = Math.max(0, Math.min(100, v));
              onFieldChange(customer.id, "closeProbability", clamped);
            }}
            prefix="%"
          />
        ) : (
          <NumberCell
            value={customer.actualThisMonth}
            onCommit={(v) => onFieldChange(customer.id, "actualThisMonth", v)}
            prefix="$"
          />
        )}
      </div>

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
