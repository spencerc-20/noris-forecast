// components/rep/PaceTracker.tsx — Current-pace box, sits next to RepForecastBox.
//
// What it shows:
//   • Big editable "$" input for the rep's running revenue this month.
//   • Below the input: "X% to forecast with Y working days left" — coloured
//     against the calendar pace target (elapsed weekdays / total weekdays).
//
// Storage: per-rep per-month at
//   forecast_v1/repForecasts/{repId}/{YYYY-MM}/currentRevenue
// Forecast value is read from the SAME bucket's `forecast` sub-key (the box
// to the left writes there) — `subscribeToRepForecast` returns it.
//
// RULES OF HOOKS COMPLIANCE
// ─────────────────────────
// All hooks (3 × useState, 1 × useRef, 1 × useAutosave, 3 × useEffect) are
// declared at the very top of the function body, before any conditional,
// early return, or loop. The first `return` is the JSX at the bottom.
//
// This component is rendered ONLY from /dashboard. /region does not import
// it — verified via grep — so this file cannot affect /region's render.

"use client";

import { useEffect, useRef, useState } from "react";
import {
  setRepCurrentRevenue,
  subscribeToRepCurrentRevenue,
  subscribeToRepForecast,
} from "@/lib/firebase/repForecasts";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { SaveStatusBadge } from "./SaveStatusBadge";
import { monthLabel } from "@/lib/forecast/monthData";
import { computePace, type PaceTone } from "@/lib/forecast/pace";

interface PaceTrackerProps {
  repId: string;
  monthKey: string;
}

/** "1234567" → "1,234,567". */
function formatWithCommas(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("en-US");
}

function parseDollars(raw: string): number {
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

export function PaceTracker({ repId, monthKey }: PaceTrackerProps) {
  // ── HOOKS — declared first, no conditionals above ───────────────────────
  const [forecast, setForecast]   = useState<number | null>(null);
  const [stored, setStored]       = useState<number | null>(null);
  const [draft, setDraft]         = useState<string>("");
  const [focused, setFocused]     = useState(false);
  const editingRef                = useRef(false);

  const { request, flushNow, status, errorMessage } = useAutosave<number>(
    async (value) => {
      await setRepCurrentRevenue(repId, monthKey, value > 0 ? value : null);
      editingRef.current = false;
    },
    800
  );

  // Live forecast subscription (read-only here — the Forecast box writes it).
  useEffect(() => {
    return subscribeToRepForecast(repId, monthKey, (v) => setForecast(v));
  }, [repId, monthKey]);

  // Live currentRevenue subscription. editingRef guards against clobbering
  // a mid-type draft when the snapshot stream fires.
  useEffect(() => {
    editingRef.current = false; // rep / month changed → safe to re-sync
    return subscribeToRepCurrentRevenue(repId, monthKey, (v) => {
      setStored(v);
      if (!editingRef.current) {
        setDraft(v != null ? v.toLocaleString("en-US") : "");
      }
    });
  }, [repId, monthKey]);

  // Flush queued autosave when the component unmounts / rep / month flips.
  useEffect(() => () => flushNow(), [flushNow]);

  // ── Pace math (delegated to the pure helper) ────────────────────────────
  const currentRev = parseDollars(draft);
  const hasValue   = currentRev > 0;
  const pace = computePace({
    monthKey,
    forecast,
    currentRevenue: currentRev,
  });
  const { displayText, tone, expectedPct } = pace;

  // Map tone → result line tint. "neutral" is used when no forecast is set.
  const TONE_TEXT: Record<PaceTone, string> = {
    good:    "text-[color:var(--good)]",
    warn:    "text-[color:var(--warn)]",
    bad:     "text-[color:var(--bad)]",
    neutral: "text-[color:var(--text-spec)]/70",
  };
  const toneClass = TONE_TEXT[tone];

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
          Current Pace — {monthLabel(monthKey)}
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
          onChange={(e) => {
            editingRef.current = true;
            const formatted = formatWithCommas(e.target.value);
            setDraft(formatted);
            request(parseDollars(formatted));
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); flushNow(); }}
          aria-label="Current revenue this month (dollars)"
          className="
            flex-1 min-w-0
            bg-transparent border-0 outline-none p-0
            text-[26px] font-semibold tabular-nums leading-none
            text-[color:var(--text-spec)]
            placeholder:text-[color:var(--text-spec)]/30
          "
        />
      </div>

      <p className={`text-[12px] mt-2 font-medium ${toneClass}`}>
        {displayText}
      </p>

      <p className="text-[10px] text-[color:var(--muted-spec)] mt-1 tabular-nums">
        Pace target: {expectedPct}% by today
      </p>

      {stored != null && stored > 0 && stored !== parseDollars(draft) && (
        <p className="text-[10px] text-[color:var(--warn)] mt-1 tabular-nums">
          Saved value: ${stored.toLocaleString("en-US")}
        </p>
      )}
    </div>
  );
}
