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
   * Step 4 — NEW row closes → convert to EXISTING recurring account.
   *
   * The closed-deal dollar amount seeds expectedMonthly for the current view
   * month and lands in actualThisMonth (so the on-track gauge reads 100%
   * immediately). The customer-level pipelineType flips so the row re-renders
   * with the EXISTING column layout from the next paint onward.
   */
  const handleCloseConversion = (customer: Customer) => {
    const closedAmount = customer.expectedMonthlyTotal ?? 0;

    // Per-month patches (slash-keyed for RTDB multi-path update).
    const monthlyPatch: Record<string, unknown> = {
      [`months/${viewMonth}/newStatus`]:            "closed",
      [`months/${viewMonth}/expectedMonthly`]:      closedAmount,
      [`months/${viewMonth}/actualThisMonth`]:      closedAmount,
      [`months/${viewMonth}/expectedMonthlyTotal`]: 0,
      [`months/${viewMonth}/closeProbability`]:     0,
    };
    // Customer-level — the pipeline type itself flips permanently.
    const customerPatch: Record<string, unknown> = { pipelineType: "existing" };

    const existing = pendingRef.current.get(customer.id) ?? {};
    pendingRef.current.set(customer.id, { ...existing, ...monthlyPatch, ...customerPatch });
    requestSave(pendingRef.current);

    // Optimistic update — mirror BOTH paths in local state.
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== customer.id) return c;
        const months = { ...(c.months ?? {}) };
        months[viewMonth] = {
          ...(months[viewMonth] ?? {}),
          newStatus: "closed",
          expectedMonthly: closedAmount,
          actualThisMonth: closedAmount,
          expectedMonthlyTotal: 0,
          closeProbability: 0,
        };
        return { ...c, pipelineType: "existing", months };
      })
    );
  };

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
          onCloseConversion={handleCloseConversion}
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
