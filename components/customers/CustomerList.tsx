// components/customers/CustomerList.tsx — Filterable, searchable customer list.
// Used by /customers page. Each row links to customer detail.

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, parseISO } from "date-fns";
import type { Customer, LeadTemperature, LifecycleStatus } from "@/types";
import { UnifiedStatusBadge } from "./UnifiedStatusBadge";
import { CustomerProfileBadge } from "./CustomerProfileBadge";
import { LeadTemperatureBadge } from "./LeadTemperatureBadge";
import { Input } from "@/components/ui/input";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const LIFECYCLE_OPTIONS: LifecycleStatus[] = [
  "potential", "new", "existing", "inactive", "lost",
];
const TEMP_OPTIONS: LeadTemperature[] = ["cold", "warm", "hot", "engaged"];

interface CustomerListProps {
  customers: Customer[];
}

export function CustomerList({ customers }: CustomerListProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filterLifecycle, setFilterLifecycle] = useState<LifecycleStatus | null>(null);
  const [filterTemp, setFilterTemp] = useState<LeadTemperature | null>(null);

  const filtered = useMemo(() => {
    let result = customers;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.practiceName?.toLowerCase().includes(q)
      );
    }
    if (filterLifecycle) {
      result = result.filter((c) => c.lifecycleStatus === filterLifecycle);
    }
    if (filterTemp) {
      result = result.filter((c) => c.leadTemperature === filterTemp);
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, search, filterLifecycle, filterTemp]);

  return (
    <div className="space-y-3">
      {/* Search + filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Search by name or practice…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs text-sm"
        />
        <div className="flex gap-1 flex-wrap">
          {LIFECYCLE_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setFilterLifecycle(filterLifecycle === s ? null : s)}
              className={`rounded-full border px-2.5 py-0.5 text-xs capitalize transition-colors ${
                filterLifecycle === s
                  ? "bg-zinc-800 text-white border-zinc-800"
                  : "border-zinc-200 text-muted-foreground hover:border-zinc-400"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {TEMP_OPTIONS.map((t) => (
            <button
              key={t}
              onClick={() => setFilterTemp(filterTemp === t ? null : t)}
              className={`rounded-full border px-2.5 py-0.5 text-xs capitalize transition-colors ${
                filterTemp === t
                  ? "bg-zinc-800 text-white border-zinc-800"
                  : "border-zinc-200 text-muted-foreground hover:border-zinc-400"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-white overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_80px] gap-4 px-4 py-2 border-b bg-zinc-50 text-xs font-medium text-muted-foreground">
          <div>Customer / Practice</div>
          <div>Status</div>
          <div>Temperature</div>
          <div>Profile</div>
          <div>Next mtg</div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No customers match this filter.
          </div>
        ) : (
          filtered.map((c) => {
            const isStale =
              !c.temperatureUpdatedAt ||
              Date.now() - c.temperatureUpdatedAt > THIRTY_DAYS_MS;

            return (
              <button
                key={c.id}
                onClick={() => router.push(`/customers/${c.id}`)}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_80px] gap-4 w-full px-4 py-3 text-left hover:bg-zinc-50 border-b last:border-b-0 items-center"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{c.name}</p>
                  {c.practiceName && (
                    <p className="text-xs text-muted-foreground truncate">{c.practiceName}</p>
                  )}
                </div>
                <div>
                  <UnifiedStatusBadge
                    lifecycleStatus={c.lifecycleStatus}
                    commissionStatus={c.commissionStatus}
                  />
                </div>
                <div>
                  <LeadTemperatureBadge
                    temperature={c.leadTemperature}
                    isStale={isStale}
                  />
                </div>
                <div>
                  <CustomerProfileBadge profile={c.profile} />
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {c.nextMeetingDate
                    ? formatDistanceToNow(parseISO(c.nextMeetingDate), { addSuffix: true })
                    : "—"}
                </div>
              </button>
            );
          })
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} of {customers.length} customers
      </p>
    </div>
  );
}
