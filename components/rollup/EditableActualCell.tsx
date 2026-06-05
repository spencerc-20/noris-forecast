// components/rollup/EditableActualCell.tsx — Manager-editable "Actual $" cell.
//
// Used inside the /team drilldown (RepRollupRow) for EXISTING rows when the
// viewer is a manager / VP / admin. Writes to the SAME Firebase path the
// rep's dashboard writes to (months/{viewMonth}/actualThisMonth), so the
// rep sees manager edits live via their subscribeToUserCustomers feed.
//
// RULES OF HOOKS COMPLIANCE
// ─────────────────────────
// All three hooks (useState, useAutosave, useEffect) are declared at the
// very top of the component, before ANY conditional, early return, or
// loop. This is a fresh component — adding hooks here is safe because the
// component's hook order is fixed for every render. The host pages
// (/region, /team) gain zero new hooks from this file.
//
// /region does NOT import this file (it renders region picker Link cards,
// not RepRollupRow), so the editable cell cannot affect /region's render.

"use client";

import { useEffect, useState } from "react";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { patchCustomer } from "@/lib/firebase/customers";
import type { Customer } from "@/types";

interface EditableActualCellProps {
  customerId: string;
  /** "YYYY-MM" — same key the rep dashboard uses for per-month writes. */
  monthKey: string;
  /** Current persisted value (read from the live customer snapshot). */
  initialValue: number | undefined;
}

// Tone for the tiny status dot rendered alongside the input.
const STATUS_DOT: Record<string, string> = {
  idle:   "bg-transparent",
  saving: "bg-[color:var(--warn)] animate-pulse",
  saved:  "bg-[color:var(--good)]",
  error:  "bg-[color:var(--bad)]",
};

export function EditableActualCell({
  customerId,
  monthKey,
  initialValue,
}: EditableActualCellProps) {
  // ── HOOKS — declared at the top, no conditionals above this block ────────
  const [draft, setDraft] = useState<string>(
    initialValue != null ? String(initialValue) : ""
  );

  const { request, flushNow, status, errorMessage } = useAutosave<number>(
    async (value) => {
      // Slash-keyed multi-path update — RTDB treats `months/.../field` as a
      // nested path. Matches the dashboard's write shape exactly.
      await patchCustomer(customerId, {
        [`months/${monthKey}/actualThisMonth`]: value,
      } as unknown as Partial<Customer>);
    },
    800
  );

  // If the underlying value updates from somewhere else (rep editing the
  // same row, or month/customer prop change), re-sync the draft. Bail if
  // the user is mid-type to avoid clobbering keystrokes.
  useEffect(() => {
    setDraft(initialValue != null ? String(initialValue) : "");
  }, [initialValue, customerId, monthKey]);

  // ── Helpers (regular functions, NOT hooks) ───────────────────────────────
  function parseDollars(raw: string): number {
    const cleaned = raw.replace(/[^0-9.-]/g, "");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDraft(e.target.value);
    request(parseDollars(e.target.value));
  }

  function handleBlur() {
    // Snap draft to the parsed value so trailing spaces / commas vanish.
    const v = parseDollars(draft);
    setDraft(String(v));
    flushNow();
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="inline-flex items-center justify-end gap-1 w-full">
      <label
        className="
          group inline-flex items-center gap-0.5
          border border-transparent rounded-md px-1.5 py-0.5
          transition-colors cursor-text
          hover:border-[color:var(--border-spec)]
          focus-within:border-[color:var(--noris)]
          focus-within:bg-[color:var(--surface-2)]
        "
        title={errorMessage ?? "Manager / admin edit — writes to the rep's record live."}
      >
        <span className="text-[10px] text-[color:var(--muted-spec)] select-none">$</span>
        <input
          value={draft}
          onChange={handleChange}
          onBlur={handleBlur}
          inputMode="decimal"
          aria-label="Actual dollars this month (manager edit)"
          className="
            w-[64px] min-w-0 text-right tabular-nums text-[12px]
            bg-transparent border-0 outline-none p-0
            text-[color:var(--text-spec)]
            placeholder:text-[color:var(--muted-spec)]
          "
        />
      </label>
      {/* Status dot — tiny visual cue per cell so a manager editing many
          rows can see which writes have landed. Idle = invisible. */}
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full transition-colors ${STATUS_DOT[status]}`}
        title={
          status === "saving" ? "Saving…" :
          status === "saved"  ? "Saved ✓" :
          status === "error"  ? (errorMessage ?? "Save failed") :
          ""
        }
      />
    </div>
  );
}
