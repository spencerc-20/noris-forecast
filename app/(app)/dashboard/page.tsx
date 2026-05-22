// app/(app)/dashboard/page.tsx — Rep's unified monthly pipeline view (REVAMP v2.0 + Step 5).
//
// One screen. No sub-pages. All editing is inline → debounced autosave.
// Step 5: the visible month comes from the `?month=YYYY-MM` URL param (set by
// the topbar stepper); per-month forecast data lives under
// `customers/{id}/months/{YYYY-MM}/` and is spread onto the row via
// `customerViewedAt()` so the row component stays month-agnostic.

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { subscribeToUserCustomers, patchCustomer } from "@/lib/firebase/customers";
import { useAuth } from "@/lib/firebase/auth";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { calcRepMetrics } from "@/lib/forecast/repMetrics";
import {
  currentMonthKey,
  customerViewedAt,
  fieldPathFor,
  isMonthlyField,
  monthLabel,
  mostRecentClosedMonth,
} from "@/lib/forecast/monthData";
import { MetricCards } from "@/components/rep/MetricCards";
import { RepListFilters } from "@/components/rep/RepListFilters";
import { RepList } from "@/components/rep/RepList";
import { SaveStatusBadge } from "@/components/rep/SaveStatusBadge";
import { AddToPipelineModal } from "@/components/rep/AddToPipelineModal";
import type { Customer, DocType, MonthData, PipelineType } from "@/types";
import type { EditableField, FieldValue } from "@/components/rep/RepListRow";

/**
 * Pending writes are keyed by customer.id and value is a flat object of
 * Firebase multi-path keys — e.g. { "months/2026-05/expectedMonthly": 1000 }
 * for monthly fields, { "pipelineType": "existing" } for customer-level.
 * RTDB `update()` honours slash-keys as nested paths.
 */
type PendingPatches = Map<string, Record<string, unknown>>;

export default function DashboardPage() {
  const { appUser } = useAuth();
  const searchParams = useSearchParams();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  // Currently-viewed month — driven by ?month in the URL, defaults to "now".
  const viewMonth = searchParams.get("month") || currentMonthKey();

  // Filter state — purely client-side
  const [search, setSearch] = useState("");
  const [pipelineFilter, setPipelineFilter] = useState<PipelineType | null>(null);
  const [docTypeFilter, setDocTypeFilter] = useState<DocType | null>(null);

  // "+ Add to pipeline" modal
  const [addOpen, setAddOpen] = useState(false);

  // ── Live customer subscription ─────────────────────────────────────────────
  useEffect(() => {
    if (!appUser) return;
    return subscribeToUserCustomers(appUser.id, (next) => {
      setCustomers(next);
      setLoading(false);
    });
  }, [appUser]);

  // ── Autosave plumbing ──────────────────────────────────────────────────────
  const pendingRef = useRef<PendingPatches>(new Map());

  const { request: requestSave, flushNow, status, errorMessage } = useAutosave<PendingPatches>(
    async (patches) => {
      const writes: Promise<void>[] = [];
      patches.forEach((fields, customerId) => {
        writes.push(patchCustomer(customerId, fields as Partial<Customer>));
      });
      pendingRef.current = new Map();
      await Promise.all(writes);
    },
    800
  );

  // Flush any pending writes when the user navigates away (or changes month).
  useEffect(() => {
    const onBeforeUnload = () => flushNow();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [flushNow]);
  useEffect(() => { flushNow(); }, [viewMonth, flushNow]);

  /**
   * One field write from a row. Translates the field name into the right
   * Firebase path (per-month or customer-level) and applies an optimistic
   * local update that mirrors the storage shape.
   */
  const handleFieldChange = (customerId: string, field: EditableField, value: FieldValue) => {
    const path = fieldPathFor(field, viewMonth);
    const existing = pendingRef.current.get(customerId) ?? {};
    pendingRef.current.set(customerId, { ...existing, [path]: value });
    requestSave(pendingRef.current);

    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== customerId) return c;
        if (isMonthlyField(field)) {
          const months = { ...(c.months ?? {}) };
          const bucket = { ...(months[viewMonth] ?? {}) } as MonthData;
          (bucket as Record<string, unknown>)[field] = value;
          months[viewMonth] = bucket;
          return { ...c, months };
        }
        return { ...c, [field]: value } as Customer;
      })
    );
  };

  /**
   * Month-rollover converter (REVAMP v2.0 + lifecycle-notes update).
   *
   * Closing a NEW row mid-month does NOT flip pipelineType — those dollars stay
   * in the month's new-business total. The flip happens on the FIRST LOAD of a
   * LATER month: if a customer is still pipelineType="new" but had newStatus
   * "closed" in any prior month, convert them to EXISTING here and seed
   * `months[viewMonth].expectedMonthly` with the closed-deal dollar amount
   * from that prior month (so their first month as an existing account
   * already has the right baseline).
   *
   * The historical prior month is left untouched — it stays as a pipelineType
   * "new" + newStatus "closed" record so when the rep scrolls back they see
   * the row exactly as it was at the time of close.
   *
   * Idempotent: once pipelineType flips, the check finds "existing" and skips.
   * Guarded by `rolloverProcessedRef` so it can't loop on the same load.
   */
  const rolloverProcessedRef = useRef<{ month: string; ids: Set<string> }>({
    month: "",
    ids: new Set(),
  });

  useEffect(() => {
    if (loading || customers.length === 0) return;

    // Reset the per-load guard whenever the viewed month changes.
    if (rolloverProcessedRef.current.month !== viewMonth) {
      rolloverProcessedRef.current = { month: viewMonth, ids: new Set() };
    }

    const candidates = customers.filter((c) => {
      if (c.inPipeline !== true)        return false;
      if (c.pipelineType !== "new")     return false;
      if (rolloverProcessedRef.current.ids.has(c.id)) return false;
      const closedMonth = mostRecentClosedMonth(c);
      // Must have a prior close (strictly before the month we're viewing).
      return !!closedMonth && closedMonth < viewMonth;
    });

    if (candidates.length === 0) return;

    // Single-shot writes outside the autosave queue — these are system
    // conversions, not rep edits, and we want them to land immediately.
    candidates.forEach((c) => {
      const closedMonth = mostRecentClosedMonth(c)!;
      const closedAmount = c.months?.[closedMonth]?.expectedMonthlyTotal ?? 0;

      // Don't overwrite an expectedMonthly the rep has already set for viewMonth.
      const existingExpected = c.months?.[viewMonth]?.expectedMonthly;
      const patch: Record<string, unknown> = {
        pipelineType: "existing",
      };
      if (existingExpected == null) {
        patch[`months/${viewMonth}/expectedMonthly`] = closedAmount;
      }

      rolloverProcessedRef.current.ids.add(c.id);
      void patchCustomer(c.id, patch as Partial<Customer>);
    });

    // Optimistic update so the UI reflects the conversion this render.
    const ids = new Set(candidates.map((c) => c.id));
    setCustomers((prev) =>
      prev.map((c) => {
        if (!ids.has(c.id)) return c;
        const closedMonth = mostRecentClosedMonth(c)!;
        const closedAmount = c.months?.[closedMonth]?.expectedMonthlyTotal ?? 0;
        const months = { ...(c.months ?? {}) };
        const bucket = { ...(months[viewMonth] ?? {}) };
        if (bucket.expectedMonthly == null) bucket.expectedMonthly = closedAmount;
        months[viewMonth] = bucket;
        return { ...c, pipelineType: "existing", months };
      })
    );
  }, [customers, viewMonth, loading]);

  // ── Pipeline membership gate ───────────────────────────────────────────────
  const inPipelineCustomers = useMemo(
    () => customers.filter((c) => c.inPipeline === true),
    [customers]
  );

  // ── Spread the viewed-month's bucket onto each customer so rows stay agnostic
  const viewedCustomers = useMemo(
    () => inPipelineCustomers.map((c) => customerViewedAt(c, viewMonth)),
    [inPipelineCustomers, viewMonth]
  );

  // ── Filter + sort ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = viewedCustomers;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.practiceName?.toLowerCase().includes(q)
      );
    }
    if (pipelineFilter) list = list.filter((c) => c.pipelineType === pipelineFilter);
    if (docTypeFilter)  list = list.filter((c) => c.docType === docTypeFilter);
    return list.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [viewedCustomers, search, pipelineFilter, docTypeFilter]);

  // Metrics over the filtered view — already month-resolved.
  const metrics = useMemo(() => calcRepMetrics(filtered), [filtered]);

  if (!appUser) return null;

  const monthDisplay = monthLabel(viewMonth);
  const isCurrentMonth = viewMonth === currentMonthKey();

  return (
    <div className="mx-auto max-w-[1300px] px-[22px] py-7 space-y-5">
      {/* Page header — name on the left, autosave status + add button on the right */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[18px] font-semibold text-[color:var(--text-spec)] leading-tight">
            My Pipeline
          </h1>
          <p className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--muted-spec)] mt-1">
            {monthDisplay}
            {!isCurrentMonth && (
              <span className="ml-2 text-[color:var(--warn)] normal-case tracking-normal">
                · viewing historical month
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SaveStatusBadge status={status} errorMessage={errorMessage} />
          <button
            onClick={() => setAddOpen(true)}
            className="rounded-md bg-[color:var(--noris)] text-white px-2.5 py-1.5 text-[12px] font-medium hover:bg-[color:var(--noris)]/90 transition-colors"
          >
            + Add to pipeline
          </button>
        </div>
      </div>

      <MetricCards metrics={metrics} />

      <RepListFilters
        search={search}
        onSearchChange={setSearch}
        pipelineFilter={pipelineFilter}
        onPipelineChange={setPipelineFilter}
        docTypeFilter={docTypeFilter}
        onDocTypeChange={setDocTypeFilter}
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[color:var(--border-spec)] border-t-[color:var(--noris)]" />
        </div>
      ) : (
        <RepList
          customers={filtered}
          onFieldChange={handleFieldChange}
          totalCount={inPipelineCustomers.length}
        />
      )}

      <AddToPipelineModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        ownerId={appUser.id}
        region={appUser.region}
        inPipelineIds={new Set(inPipelineCustomers.map((c) => c.id))}
      />
    </div>
  );
}
