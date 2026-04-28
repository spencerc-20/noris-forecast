// components/shared/EditHistoryPanel.tsx — Shows edit history for a deal or customer.
// Reps see last 30 days. Managers see full history. Pass sinceTimestamp to limit.

"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { getEditHistory, type EditLogEntry } from "@/lib/firebase/history";
import { Separator } from "@/components/ui/separator";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Human-readable field names for the history log
const FIELD_LABELS: Record<string, string> = {
  stage: "Stage",
  closeProbability: "Close probability",
  dealValue: "Deal value",
  expectedCloseDate: "Expected close",
  procedureTier: "Procedure tier",
  dealStructure: "Deal structure",
  lastMeetingDate: "Last meeting",
  nextMeetingDate: "Next meeting",
  notes: "Notes",
  decisionMaker: "Decision maker",
  linkedDealId: "Linked deal",
  overrideReason: "Override reason",
  _created: "Deal created",
  _deleted: "Deal deleted",
  lifecycleStatus: "Lifecycle status",
  leadTemperature: "Lead temperature",
  profile: "Profile",
};

function fieldLabel(field: string) {
  return FIELD_LABELS[field] ?? field;
}

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (field === "closeProbability") return `${value}%`;
  if (field === "dealValue") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(value as number);
  }
  if (typeof value === "string" && value.length > 60)
    return value.slice(0, 60) + "…";
  return String(value);
}

interface EditHistoryPanelProps {
  recordId: string;
  /** Pass true for reps (limits to last 30 days). False = full history for managers/admins. */
  limitToThirtyDays?: boolean;
}

export function EditHistoryPanel({
  recordId,
  limitToThirtyDays = false,
}: EditHistoryPanelProps) {
  const [entries, setEntries] = useState<EditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!recordId) return;
    setLoading(true);
    const sinceTimestamp = limitToThirtyDays
      ? Date.now() - THIRTY_DAYS_MS
      : undefined;
    getEditHistory(recordId, { sinceTimestamp }).then((data) => {
      setEntries(data);
      setLoading(false);
    });
  }, [recordId, limitToThirtyDays]);

  if (loading) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        Loading history…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        No edit history yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {limitToThirtyDays && (
        <p className="text-xs text-muted-foreground">Showing last 30 days.</p>
      )}
      {entries.map((entry, i) => (
        <div key={i} className="flex gap-3 text-sm">
          <div className="shrink-0 pt-0.5">
            <div className="h-1.5 w-1.5 rounded-full bg-zinc-300 mt-1.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="font-medium">{fieldLabel(entry.field)}</span>
              {entry.field !== "_created" && entry.field !== "_deleted" && (
                <>
                  <span className="text-muted-foreground text-xs line-through">
                    {formatValue(entry.field, entry.oldValue)}
                  </span>
                  <span className="text-xs text-muted-foreground">→</span>
                  <span className="text-xs">
                    {formatValue(entry.field, entry.newValue)}
                  </span>
                </>
              )}
            </div>
            {entry.reason && (
              <p className="text-xs text-muted-foreground mt-0.5 italic">
                "{entry.reason}"
              </p>
            )}
            <p
              className="text-xs text-muted-foreground mt-0.5"
              title={format(entry.timestamp, "PPpp")}
            >
              {formatDistanceToNow(entry.timestamp, { addSuffix: true })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
