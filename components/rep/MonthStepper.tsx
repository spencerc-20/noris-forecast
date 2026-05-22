// components/rep/MonthStepper.tsx — Topbar month stepper.
//
// REVAMP v2.0 Step 5: reads the `?month=YYYY-MM` URL param, defaults to the
// system current month, renders `‹ May 2026 ›` with prev/next buttons that
// shallow-route to the new URL. Every page that reads ?month re-renders
// automatically.

"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  currentMonthKey,
  monthLabel,
  shiftMonthKey,
} from "@/lib/forecast/monthData";

export function MonthStepper() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const viewMonth = searchParams.get("month") || currentMonthKey();
  const isCurrent = viewMonth === currentMonthKey();

  function navigate(delta: number) {
    const next = shiftMonthKey(viewMonth, delta);
    const params = new URLSearchParams(searchParams.toString());
    // Drop the param entirely when stepping back to the current month, so the
    // canonical URL stays clean (`/dashboard` instead of `/dashboard?month=…`).
    if (next === currentMonthKey()) params.delete("month");
    else params.set("month", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="inline-flex items-center gap-1">
      <button
        onClick={() => navigate(-1)}
        className="rounded p-1 text-[color:var(--muted-spec)] hover:text-[color:var(--text-spec)] hover:bg-[color:var(--surface-2)]/60 transition-colors"
        aria-label="Previous month"
      >
        <ChevronLeft size={14} />
      </button>
      <span className="text-[12px] uppercase tracking-[0.08em] text-[color:var(--muted-spec)] tabular-nums min-w-[110px] text-center">
        {monthLabel(viewMonth)}
      </span>
      <button
        onClick={() => navigate(1)}
        className="rounded p-1 text-[color:var(--muted-spec)] hover:text-[color:var(--text-spec)] hover:bg-[color:var(--surface-2)]/60 transition-colors"
        aria-label="Next month"
      >
        <ChevronRight size={14} />
      </button>
      {!isCurrent && (
        <button
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString());
            params.delete("month");
            const qs = params.toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
          }}
          className="ml-1 text-[10px] uppercase tracking-[0.1em] text-[color:var(--noris)] hover:underline"
          title="Jump to current month"
        >
          today
        </button>
      )}
    </div>
  );
}
