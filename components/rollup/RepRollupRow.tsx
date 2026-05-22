// components/rollup/RepRollupRow.tsx — Expandable rep row (dark theme).
//
// REVAMP v2.0: collapsed row is dense and scannable. Click → expand to a nested
// read-only mini customer table styled the same way as the rep dashboard table.

"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Customer } from "@/types";
import {
  calcRepMetrics,
  formatDollars,
  onTrackPctFor,
  onTrackStatusFor,
  weightedTotalFor,
} from "@/lib/forecast/repMetrics";
import { DOC_TYPE_LABELS } from "@/types";

interface RepRollupRowProps {
  repName: string;
  region: string;
  customers: Customer[];
}

const ON_TRACK_TEXT: Record<ReturnType<typeof onTrackStatusFor>, string> = {
  on_track: "text-[color:var(--good)]",
  close:    "text-[color:var(--warn)]",
  behind:   "text-[color:var(--bad)]",
  unknown:  "text-[color:var(--muted-spec)]",
};

const TOP_GRID  = "grid grid-cols-[24px_2fr_1fr_1fr_1fr_1fr_140px] gap-3";
const MINI_GRID = "grid grid-cols-[2fr_80px_120px_110px_110px_130px] gap-2";

export function RepRollupRow({ repName, region, customers }: RepRollupRowProps) {
  const [expanded, setExpanded] = useState(false);
  const metrics = calcRepMetrics(customers);
  const trackStatus = onTrackStatusFor(metrics.existingOnTrackPct);
  const trackLabel =
    metrics.existingOnTrackPct == null ? "—" : `${metrics.existingOnTrackPct}%`;

  return (
    <div className="border-b border-[color:var(--border-spec)]/60 last:border-b-0">
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`${TOP_GRID} items-center w-full px-4 py-2.5 text-left text-[13px] hover:bg-[color:var(--surface-2)]/40 transition-colors`}
      >
        <ChevronRight
          size={14}
          className={`transition-transform text-[color:var(--muted-spec)] ${expanded ? "rotate-90" : ""}`}
        />
        <div className="min-w-0">
          <p className="font-medium truncate text-[color:var(--text-spec)]">{repName}</p>
          <p className="text-[11px] text-[color:var(--muted-spec)] truncate">{region}</p>
        </div>
        <div className="text-right tabular-nums">
          <p className="text-[color:var(--text-spec)]">{formatDollars(metrics.newWeightedTotal)}</p>
          <p className="text-[11px] text-[color:var(--muted-spec)]">{metrics.newCount} new</p>
        </div>
        <div className="text-right tabular-nums">
          <p className="text-[color:var(--text-spec)]">{formatDollars(metrics.existingExpected)}</p>
          <p className="text-[11px] text-[color:var(--muted-spec)]">{metrics.existingCount} existing</p>
        </div>
        <div className="text-right tabular-nums">
          <p className="text-[color:var(--text-spec)]">{formatDollars(metrics.existingActual)}</p>
          <p className="text-[11px] text-[color:var(--muted-spec)]">actual</p>
        </div>
        <div className={`text-right tabular-nums ${ON_TRACK_TEXT[trackStatus]}`}>
          <p>{trackLabel}</p>
          <p className="text-[11px] text-[color:var(--muted-spec)]">on track</p>
        </div>
        <div className="text-right tabular-nums font-semibold text-[14px] text-[color:var(--text-spec)]">
          {formatDollars(metrics.combinedForecast)}
        </div>
      </button>

      {/* Drilldown */}
      {expanded && (
        <div className="bg-[#0d1525] px-4 py-3">
          {customers.length === 0 ? (
            <p className="text-[12px] text-[color:var(--muted-spec)] italic px-2 py-1">
              No customers.
            </p>
          ) : (
            <div className="rounded-lg border border-[color:var(--border-spec)] bg-[color:var(--surface)] overflow-hidden">
              <div
                className={`${MINI_GRID} px-3 py-1.5 border-b border-[color:var(--border-spec)] bg-[#0d1525] text-[10px] uppercase tracking-[0.1em] font-medium text-[color:var(--muted-spec)]`}
              >
                <div>Customer</div>
                <div>Type</div>
                <div>Doc-type</div>
                <div className="text-right">Expected $</div>
                <div className="text-right">Close % / Actual $</div>
                <div className="text-right">Weighted / On track</div>
              </div>
              {customers
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => {
                  const isNew = c.pipelineType === "new";
                  const weighted = weightedTotalFor(c);
                  const pct = onTrackPctFor(c);
                  const st = onTrackStatusFor(pct);
                  return (
                    <div
                      key={c.id}
                      className={`${MINI_GRID} px-3 py-1.5 border-b border-[color:var(--border-spec)]/60 last:border-b-0 text-[12px] items-center`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate text-[color:var(--text-spec)]">
                          {c.name}
                        </p>
                        {c.practiceName && (
                          <p className="text-[10px] text-[color:var(--muted-spec)] truncate">
                            {c.practiceName}
                          </p>
                        )}
                      </div>
                      <div>
                        <span
                          className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium tracking-wide ${
                            isNew
                              ? "border-[#3b6aff]/40 bg-[#3b6aff]/15 text-[#9ab3ff]"
                              : "border-[color:var(--good)]/40 bg-[color:var(--good)]/15 text-[color:var(--good)]"
                          }`}
                        >
                          {isNew ? "NEW" : "EXISTING"}
                        </span>
                      </div>
                      <div className="truncate text-[color:var(--text-spec)]">
                        {DOC_TYPE_LABELS[c.docType]}
                      </div>
                      <div className="text-right tabular-nums text-[color:var(--text-spec)]">
                        {isNew
                          ? formatDollars(c.expectedMonthlyTotal ?? 0)
                          : formatDollars(c.expectedMonthly ?? 0)}
                      </div>
                      <div className="text-right tabular-nums text-[color:var(--text-spec)]">
                        {isNew
                          ? `${c.closeProbability ?? 0}%`
                          : formatDollars(c.actualThisMonth ?? 0)}
                      </div>
                      <div
                        className={`text-right tabular-nums ${
                          isNew ? "text-[color:var(--text-spec)]" : ON_TRACK_TEXT[st]
                        }`}
                      >
                        {isNew
                          ? `${formatDollars(weighted)} weighted`
                          : pct == null
                          ? "—"
                          : `${pct}% on track`}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
