// components/rep/MetricCards.tsx — Top-of-page summary cards (REVAMP v2.0 styling).
//
// Spec tokens applied:
//   - card surface: var(--surface), border: var(--border-spec)
//   - label: 10px uppercase letter-spaced, muted
//   - value: 22px semibold tabular-nums
//   - highlight card (combined forecast): Noris-red tinted background
//   - on-track card: tone-coloured background driven by status

"use client";

import type { RepMetrics } from "@/lib/forecast/repMetrics";
import { formatDollars, onTrackStatusFor } from "@/lib/forecast/repMetrics";

interface MetricCardsProps {
  metrics: RepMetrics;
}

interface CardProps {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  tone?: "neutral" | "good" | "warn" | "bad";
}

// Tone styles map to the green/amber/red status bands in the spec.
const TONE_BG: Record<NonNullable<CardProps["tone"]>, string> = {
  neutral: "bg-[color:var(--surface)]",
  good:    "bg-[color:var(--good-bg)]",
  warn:    "bg-[color:var(--warn-bg)]",
  bad:     "bg-[color:var(--bad-bg)]",
};
const TONE_BORDER: Record<NonNullable<CardProps["tone"]>, string> = {
  neutral: "border-[color:var(--border-spec)]",
  good:    "border-[color:var(--good)]/40",
  warn:    "border-[color:var(--warn)]/40",
  bad:     "border-[color:var(--bad)]/40",
};
const TONE_VALUE: Record<NonNullable<CardProps["tone"]>, string> = {
  neutral: "text-[color:var(--text-spec)]",
  good:    "text-[color:var(--good)]",
  warn:    "text-[color:var(--warn)]",
  bad:     "text-[color:var(--bad)]",
};

function Card({ label, value, sub, highlight, tone = "neutral" }: CardProps) {
  if (highlight) {
    return (
      <div
        className="rounded-xl border border-[color:var(--noris)]/60 bg-[color:var(--noris)]/15 px-4 py-3 min-w-[166px]"
        style={{ boxShadow: "inset 0 0 0 1px rgba(196,18,48,0.25)" }}
      >
        <p className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--text-spec)]/70 font-medium">
          {label}
        </p>
        <p className="text-[22px] font-semibold tabular-nums leading-none mt-1.5 text-[color:var(--text-spec)]">
          {value}
        </p>
        {sub && (
          <p className="text-[11px] tabular-nums mt-1.5 text-[color:var(--text-spec)]/60">{sub}</p>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border px-4 py-3 min-w-[166px] ${TONE_BG[tone]} ${TONE_BORDER[tone]}`}
    >
      <p className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--muted-spec)] font-medium">
        {label}
      </p>
      <p
        className={`text-[22px] font-semibold tabular-nums leading-none mt-1.5 ${TONE_VALUE[tone]}`}
      >
        {value}
      </p>
      {sub && (
        <p className="text-[11px] tabular-nums mt-1.5 text-[color:var(--muted-spec)]">{sub}</p>
      )}
    </div>
  );
}

export function MetricCards({ metrics }: MetricCardsProps) {
  const status = onTrackStatusFor(metrics.existingOnTrackPct);
  const onTrackLabel =
    metrics.existingOnTrackPct == null ? "—" : `${metrics.existingOnTrackPct}%`;
  const onTrackTone: CardProps["tone"] =
    status === "on_track" ? "good" : status === "close" ? "warn" : status === "behind" ? "bad" : "neutral";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      <Card
        label="New pipeline (weighted)"
        value={formatDollars(metrics.newWeightedTotal)}
        sub={`${metrics.newCount} prospect${metrics.newCount === 1 ? "" : "s"}`}
      />
      <Card
        label="Existing expected"
        value={formatDollars(metrics.existingExpected)}
        sub={`${metrics.existingCount} account${metrics.existingCount === 1 ? "" : "s"}`}
      />
      <Card
        label="Existing actual"
        value={formatDollars(metrics.existingActual)}
        sub="this month"
      />
      <Card
        label="On track"
        value={onTrackLabel}
        sub="actual vs expected"
        tone={onTrackTone}
      />
      <Card
        label="Combined forecast"
        value={formatDollars(metrics.combinedForecast)}
        sub="new + existing"
        highlight
      />
    </div>
  );
}
