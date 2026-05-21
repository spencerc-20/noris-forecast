// components/rep/SaveStatusBadge.tsx — "Saving… / Saved ✓ / Error" indicator.
//
// REVAMP v2.0 styling: matches the spec colour bands — amber for saving,
// green for saved, red (and tooltip) for save failures.

"use client";

import type { SaveStatus } from "@/lib/hooks/useAutosave";

interface SaveStatusBadgeProps {
  status: SaveStatus;
  errorMessage?: string | null;
}

export function SaveStatusBadge({ status, errorMessage }: SaveStatusBadgeProps) {
  if (status === "idle") {
    return (
      <span className="text-[11px] text-[color:var(--muted-spec)] tabular-nums">—</span>
    );
  }
  if (status === "saving") {
    return (
      <span className="text-[11px] text-[color:var(--warn)] inline-flex items-center gap-1.5 tabular-nums">
        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--warn)] animate-pulse" />
        Saving…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="text-[11px] text-[color:var(--good)] inline-flex items-center gap-1 tabular-nums">
        ✓ Saved
      </span>
    );
  }
  return (
    <span
      className="text-[11px] text-[color:var(--bad)] inline-flex items-center gap-1 tabular-nums"
      title={errorMessage ?? undefined}
    >
      ⚠ Save failed
    </span>
  );
}
