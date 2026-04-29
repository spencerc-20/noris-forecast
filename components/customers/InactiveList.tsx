// components/customers/InactiveList.tsx — Inactive customers with re-engage and mark-as-lost actions.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO, differenceInDays } from "date-fns";
import { updateCustomer } from "@/lib/firebase/customers";
import { useAuth } from "@/lib/firebase/auth";
import type { Customer } from "@/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface InactiveListProps {
  customers: Customer[];
}

export function InactiveList({ customers }: InactiveListProps) {
  const router = useRouter();
  const { appUser } = useAuth();
  const [acting, setActing] = useState<string | null>(null);
  const [lostFormFor, setLostFormFor] = useState<string | null>(null);
  const [lostReason, setLostReason] = useState("");
  const [lostCompetitor, setLostCompetitor] = useState("");

  const inactive = [...customers]
    .filter((c) => c.lifecycleStatus === "inactive")
    .sort((a, b) => latestRevenueYear(b) - latestRevenueYear(a));

  function latestRevenueYear(c: Customer): number {
    const years = Object.keys(c.annualRevenue ?? {}).map(Number);
    return years.length > 0 ? Math.max(...years) : 0;
  }

  function lastOrderLabel(c: Customer): string {
    if (c.lastOrderDate) {
      const days = differenceInDays(new Date(), parseISO(c.lastOrderDate));
      return `${days}d ago (${format(parseISO(c.lastOrderDate), "MMM d, yyyy")})`;
    }
    const year = latestRevenueYear(c);
    return year > 0 ? `Last rev: ${year}` : "—";
  }

  async function handleReEngage(customer: Customer) {
    if (!appUser) return;
    setActing(customer.id);
    try {
      await updateCustomer(
        customer.id,
        { lifecycleStatus: "new" },
        appUser.id,
        customer
      );
    } finally {
      setActing(null);
    }
  }

  async function handleMarkLost(customer: Customer) {
    if (!appUser || !lostReason.trim()) return;
    setActing(customer.id);
    try {
      await updateCustomer(
        customer.id,
        {
          lifecycleStatus: "lost",
          lostReason: lostReason.trim(),
          lostCompetitor: lostCompetitor.trim() || null,
          lostDate: format(new Date(), "yyyy-MM-dd"),
        },
        appUser.id,
        customer
      );
      setLostFormFor(null);
      setLostReason("");
      setLostCompetitor("");
    } finally {
      setActing(null);
    }
  }

  if (inactive.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center text-sm text-muted-foreground">
        No inactive customers.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium">
        Inactive — {inactive.length} {inactive.length === 1 ? "customer" : "customers"}
      </h2>

      <div className="rounded-lg border bg-white overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 px-4 py-2 border-b bg-zinc-50 text-xs font-medium text-muted-foreground">
          <div>Customer</div>
          <div>Last order</div>
          <div className="text-right">Peak rev year</div>
          <div />
        </div>

        {inactive.map((c) => {
          const peakYear = latestRevenueYear(c);
          const peakRev = peakYear > 0 ? (c.annualRevenue ?? {})[peakYear] : null;

          return (
            <div key={c.id} className="border-b last:border-b-0">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 px-4 py-3 items-start">
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
                </div>
                <div className="text-xs text-muted-foreground">{lastOrderLabel(c)}</div>
                <div className="text-sm text-right tabular-nums text-muted-foreground">
                  {peakRev != null
                    ? new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                        minimumFractionDigits: 0,
                      }).format(peakRev)
                    : "—"}
                  {peakYear > 0 && (
                    <span className="text-xs ml-1">({peakYear})</span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => handleReEngage(c)}
                    disabled={acting === c.id}
                    className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {acting === c.id && lostFormFor !== c.id ? "…" : "Re-engage"}
                  </button>
                  <button
                    onClick={() => {
                      setLostFormFor(lostFormFor === c.id ? null : c.id);
                      setLostReason("");
                      setLostCompetitor("");
                    }}
                    className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                  >
                    Mark lost
                  </button>
                </div>
              </div>

              {/* Inline lost form */}
              {lostFormFor === c.id && (
                <div className="px-4 pb-3 space-y-2">
                  <Input
                    placeholder="Loss reason (required)"
                    className="h-7 text-xs"
                    value={lostReason}
                    onChange={(e) => setLostReason(e.target.value)}
                  />
                  <Input
                    placeholder="Competitor (optional)"
                    className="h-7 text-xs"
                    value={lostCompetitor}
                    onChange={(e) => setLostCompetitor(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs"
                      disabled={!lostReason.trim() || acting === c.id}
                      onClick={() => handleMarkLost(c)}
                    >
                      {acting === c.id ? "Saving…" : "Confirm lost"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setLostFormFor(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
