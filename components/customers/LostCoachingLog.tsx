// components/customers/LostCoachingLog.tsx — Table of all lost customers with loss context.
// Actions: add to win-back queue, re-engage immediately.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { updateCustomer } from "@/lib/firebase/customers";
import { useAuth } from "@/lib/firebase/auth";
import type { Customer } from "@/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const SORT_OPTIONS = [
  { value: "lostDate", label: "Lost date" },
  { value: "lostDealValue", label: "Deal value" },
  { value: "name", label: "Name" },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]["value"];

interface LostCoachingLogProps {
  customers: Customer[];
}

export function LostCoachingLog({ customers }: LostCoachingLogProps) {
  const router = useRouter();
  const { appUser } = useAuth();
  const [sort, setSort] = useState<SortKey>("lostDate");
  const [acting, setActing] = useState<string | null>(null);
  const [queueDateFor, setQueueDateFor] = useState<string | null>(null);
  const [queueDate, setQueueDate] = useState("");

  const lost = [...customers]
    .filter((c) => c.lifecycleStatus === "lost")
    .sort((a, b) => {
      if (sort === "lostDate") {
        return (b.lostDate ?? "").localeCompare(a.lostDate ?? "");
      }
      if (sort === "lostDealValue") {
        return (b.lostDealValue ?? 0) - (a.lostDealValue ?? 0);
      }
      return a.name.localeCompare(b.name);
    });

  async function handleReEngage(customer: Customer) {
    if (!appUser) return;
    setActing(customer.id);
    try {
      await updateCustomer(
        customer.id,
        { lifecycleStatus: "new", winBackQueueDate: null },
        appUser.id,
        customer
      );
    } finally {
      setActing(null);
    }
  }

  async function handleAddToQueue(customer: Customer) {
    if (!appUser || !queueDate) return;
    setActing(customer.id);
    try {
      await updateCustomer(
        customer.id,
        { winBackQueueDate: queueDate },
        appUser.id,
        customer
      );
      setQueueDateFor(null);
      setQueueDate("");
    } finally {
      setActing(null);
    }
  }

  if (lost.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center text-sm text-muted-foreground">
        No lost customers yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-medium">
          All lost — {lost.length} {lost.length === 1 ? "customer" : "customers"}
        </h2>
        <div className="flex gap-1 ml-auto">
          {SORT_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setSort(value)}
              className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                sort === value
                  ? "bg-zinc-800 text-white border-zinc-800"
                  : "border-zinc-200 text-muted-foreground hover:border-zinc-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2fr_1fr_1fr_2fr_1fr] gap-3 px-4 py-2 border-b bg-zinc-50 text-xs font-medium text-muted-foreground">
          <div>Customer</div>
          <div>Lost date</div>
          <div className="text-right">Deal $</div>
          <div>Reason / Competitor</div>
          <div />
        </div>

        {lost.map((c) => (
          <div key={c.id} className="border-b last:border-b-0">
            <div className="grid grid-cols-[2fr_1fr_1fr_2fr_1fr] gap-3 px-4 py-3 items-start">
              <div className="min-w-0">
                <button
                  onClick={() => router.push(`/customers/${c.id}`)}
                  className="font-medium text-sm hover:underline text-left"
                >
                  {c.name}
                </button>
                {c.practiceName && (
                  <p className="text-xs text-muted-foreground truncate">{c.practiceName}</p>
                )}
                {c.winBackQueueDate && (
                  <p className="text-xs text-amber-600 mt-0.5">
                    Win-back: {format(parseISO(c.winBackQueueDate), "MMM d, yyyy")}
                  </p>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {c.lostDate ? format(parseISO(c.lostDate), "MMM d, yyyy") : "—"}
              </div>
              <div className="text-sm text-right tabular-nums text-muted-foreground">
                {c.lostDealValue
                  ? new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      minimumFractionDigits: 0,
                    }).format(c.lostDealValue)
                  : "—"}
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                {c.lostReason && <p className="italic">"{c.lostReason}"</p>}
                {c.lostCompetitor && <p>Lost to: {c.lostCompetitor}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => handleReEngage(c)}
                  disabled={acting === c.id}
                  className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                >
                  {acting === c.id ? "…" : "Re-engage"}
                </button>
                {!c.winBackQueueDate && (
                  <button
                    onClick={() => {
                      setQueueDateFor(queueDateFor === c.id ? null : c.id);
                      setQueueDate("");
                    }}
                    className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700 hover:bg-amber-100"
                  >
                    + Queue
                  </button>
                )}
              </div>
            </div>

            {/* Inline queue-date picker */}
            {queueDateFor === c.id && (
              <div className="flex items-center gap-2 px-4 pb-3">
                <Input
                  type="date"
                  className="h-7 text-xs w-40"
                  value={queueDate}
                  onChange={(e) => setQueueDate(e.target.value)}
                />
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!queueDate || acting === c.id}
                  onClick={() => handleAddToQueue(c)}
                >
                  {acting === c.id ? "Saving…" : "Set date"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setQueueDateFor(null)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
