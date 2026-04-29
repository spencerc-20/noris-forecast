// components/customers/WinBackQueue.tsx — Customers in the win-back queue (lost, winBackQueueDate set and due).
// "Due" means winBackQueueDate <= today. Actions: re-engage (lost → new).

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { updateCustomer } from "@/lib/firebase/customers";
import { useAuth } from "@/lib/firebase/auth";
import type { Customer } from "@/types";

interface WinBackQueueProps {
  customers: Customer[];
}

export function WinBackQueue({ customers }: WinBackQueueProps) {
  const router = useRouter();
  const { appUser } = useAuth();
  const [acting, setActing] = useState<string | null>(null);

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const due = customers
    .filter(
      (c) =>
        c.lifecycleStatus === "lost" &&
        c.winBackQueueDate !== null &&
        c.winBackQueueDate <= todayStr
    )
    .sort((a, b) => (a.winBackQueueDate ?? "").localeCompare(b.winBackQueueDate ?? ""));

  if (due.length === 0) return null;

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

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-amber-700">
        Win-Back Queue — {due.length} due
      </h2>
      <div className="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden divide-y divide-amber-100">
        {due.map((c) => (
          <div key={c.id} className="flex items-center gap-4 px-4 py-3">
            <div className="flex-1 min-w-0">
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
            <div className="text-xs text-muted-foreground shrink-0 hidden sm:block">
              {c.lostReason && (
                <p className="italic truncate max-w-[200px]">"{c.lostReason}"</p>
              )}
              {c.winBackQueueDate && (
                <p>Queued for {format(parseISO(c.winBackQueueDate), "MMM d")}</p>
              )}
            </div>
            <button
              onClick={() => handleReEngage(c)}
              disabled={acting === c.id}
              className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {acting === c.id ? "Saving…" : "Re-engage"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
