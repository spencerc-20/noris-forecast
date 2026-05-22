// components/rep/RepForecastBox.tsx — Prominent rep gut-call forecast input.
//
// Mirrors the V2 VP-forecast-box: large accent-tinted card, big centered
// dollar input, comma formatting as the rep types. Stored per-rep per-month
// (see lib/firebase/repForecasts.ts) — completely independent of the per-row
// computed totals so the rep can compare their gut vs the math.

"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeToRepForecast, setRepForecast } from "@/lib/firebase/repForecasts";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { SaveStatusBadge } from "./SaveStatusBadge";
import { monthLabel } from "@/lib/forecast/monthData";

interface RepForecastBoxProps {
  repId: string;
  monthKey: string;          // "YYYY-MM"
  /** Optional context label override; defaults to "Your forecast for {Month YYYY}". */
  label?: string;
}

/** "1234567" → "1,234,567". Strips anything non-digit before formatting. */
function formatWithCommas(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("en-US");
}

/** Parse a formatted string back to a plain integer ($0 if empty/invalid). */
function parseDollars(raw: string): number {
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

export function RepForecastBox({ repId, monthKey, label }: RepForecastBoxProps) {
  const [stored, setStored]   = useState<number | null>(null);   // value from Firebase
  const [draft, setDraft]     = useState<string>("");             // what's in the input
  const [focused, setFocused] = useState(false);
  // Track whether the user has touched the field — if they haven't, sync from
  // the live Firebase value. Once they start typing we stop overwriting the
  // input mid-edit (which would feel like a re-render fight).
  const editingRef = useRef(false);

  // ── Live subscription ──────────────────────────────────────────────────────
  useEffect(() => {
    editingRef.current = false; // month or rep changed → re-sync from server
    const unsub = subscribeToRepForecast(repId, monthKey, (value) => {
      setStored(value);
      if (!editingRef.current) {
        setDraft(value != null ? value.toLocaleString("en-US") : "");
      }
    });
    return unsub;
  }, [repId, monthKey]);

  // ── Autosave plumbing ──────────────────────────────────────────────────────
  const { request, flushNow, status, errorMessage } = useAutosave<number>(
    async (value) => {
      // Allow clearing back to "no forecast" by writing null.
      await setRepForecast(repId, monthKey, value > 0 ? value : null);
      editingRef.current = false; // saved → safe to accept future external updates
    },
    800
  );

  // Flush on unmount / month change so an in-flight edit doesn't drop on the floor.
  useEffect(() => () => flushNow(), [flushNow]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    editingRef.current = true;
    const formatted = formatWithCommas(e.target.value);
    setDraft(formatted);
    request(parseDollars(formatted));
  }

  const displayLabel = label ?? `Your forecast — ${monthLabel(monthKey)}`;
  const hasValue = parseDollars(draft) > 0;

  return (
    <div
      className={`
        rounded-xl border-2 px-5 py-4
        bg-gradient-to-br from-[color:var(--noris)]/10 to-[color:var(--noris)]/5
        border-[color:var(--noris)]/45
        transition-colors
        ${focused ? "border-[color:var(--noris)]" : ""}
      `}
      style={{ boxShadow: "inset 0 0 0 1px rgba(196,18,48,0.18)" }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[color:var(--text-spec)]/80">
          {displayLabel}
        </p>
        <SaveStatusBadge status={status} errorMessage={errorMessage} />
      </div>

      <div className="flex items-baseline gap-1">
        <span
          className={`text-[26px] font-semibold leading-none transition-colors ${
            hasValue
              ? "text-[color:var(--text-spec)]"
              : "text-[color:var(--text-spec)]/30"
          }`}
        >
          $
        </span>
        <input
          inputMode="numeric"
          placeholder="0"
          value={draft}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); flushNow(); }}
          aria-label="Monthly forecast (dollars)"
          className={`
            flex-1 min-w-0
            bg-transparent border-0 outline-none p-0
            text-[26px] font-semibold tabular-nums leading-none
            text-[color:var(--text-spec)]
            placeholder:text-[color:var(--text-spec)]/30
          `}
        />
      </div>

      <p className="text-[11px] text-[color:var(--muted-spec)] mt-2 leading-relaxed">
        Your manual gut-call number for the month. Independent of the calculated totals below — both are shown so you can compare them.
      </p>

      {stored != null && stored > 0 && stored !== parseDollars(draft) && (
        <p className="text-[10px] text-[color:var(--warn)] mt-1 tabular-nums">
          Saved value: ${stored.toLocaleString("en-US")}
        </p>
      )}
    </div>
  );
}
