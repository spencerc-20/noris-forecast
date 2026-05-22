// app/(app)/dashboard/page.tsx — Rep's unified monthly pipeline view (REVAMP v2.0).
//
// One screen. No sub-pages. All editing is inline → debounced autosave.
// Replaces the old deal-centric dashboard entirely (deals UI is being removed in Step 4).

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { subscribeToUserCustomers, patchCustomer } from "@/lib/firebase/customers";
import { useAuth } from "@/lib/firebase/auth";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { calcRepMetrics } from "@/lib/forecast/repMetrics";
import { MetricCards } from "@/components/rep/MetricCards";
import { RepListFilters } from "@/components/rep/RepListFilters";
import { RepList } from "@/components/rep/RepList";
import { SaveStatusBadge } from "@/components/rep/SaveStatusBadge";
import { AddToPipelineModal } from "@/components/rep/AddToPipelineModal";
import type { Customer, DocType, PipelineType } from "@/types";
import type { EditableField, FieldValue } from "@/components/rep/RepListRow";

/**
 * Coalesce field changes from every row into a single per-customer patch so we
 * batch multiple keystrokes on different fields into one Firebase write.
 *
 * Key insight: the inline cells fire `onFieldChange` on EVERY keystroke. We
 * accumulate into `pendingRef` and request() the autosave hook — the hook waits
 * 800ms, then flushes the accumulated patch.
 */
type PendingPatches = Map<string, Partial<Customer>>;

export default function DashboardPage() {
  const { appUser } = useAuth();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

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
  // Pending patches are accumulated outside React state so they don't trigger
  // re-renders on every keystroke.
  const pendingRef = useRef<PendingPatches>(new Map());

  const { request: requestSave, flushNow, status, errorMessage } = useAutosave<PendingPatches>(
    async (patches) => {
      // Flush every queued customer in parallel (one Firebase write per customer).
      const writes: Promise<void>[] = [];
      patches.forEach((fields, customerId) => {
        writes.push(patchCustomer(customerId, fields));
      });
      pendingRef.current = new Map(); // clear after queuing the writes
      await Promise.all(writes);
    },
    800
  );

  // Flush any pending writes when the user navigates away.
  useEffect(() => {
    const onBeforeUnload = () => flushNow();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [flushNow]);

  const handleFieldChange = (customerId: string, field: EditableField, value: FieldValue) => {
    // Merge into the customer's pending patch. The autosave hook treats the
    // ref's contents as a single "value" — we just hand it the live map.
    const existing = pendingRef.current.get(customerId) ?? {};
    const next = { ...existing, [field]: value } as Partial<Customer>;
    pendingRef.current.set(customerId, next);
    requestSave(pendingRef.current);

    // Optimistic local update so the UI reflects the change immediately.
    setCustomers((prev) =>
      prev.map((c) => (c.id === customerId ? ({ ...c, [field]: value } as Customer) : c))
    );
  };

  /**
   * Step 4 — NEW row closes → convert to EXISTING recurring account.
   *
   * The closed-deal dollar amount (whichever of expectedMonthlyTotal × close% we
   * trust most — we use the rep's explicit expectedMonthlyTotal, since that's
   * what "they expect to close this month") seeds the customer's expectedMonthly
   * baseline. The same dollar amount also lands in actualThisMonth so the
   * month's "existing actual" total reflects the close immediately.
   *
   * After the swap the row renders with the EXISTING column layout — on-track
   * starts at 100% (actual === expected).
   */
  const handleCloseConversion = (customer: Customer) => {
    const closedAmount = customer.expectedMonthlyTotal ?? 0;
    const patch: Partial<Customer> = {
      pipelineType: "existing",
      newStatus: "closed",
      expectedMonthly: closedAmount,
      actualThisMonth: closedAmount,
      // Clear the now-meaningless new-pipeline fields.
      expectedMonthlyTotal: 0,
      closeProbability: 0,
    };

    // Queue the multi-field patch through the same autosave path so the badge fires.
    const existing = pendingRef.current.get(customer.id) ?? {};
    pendingRef.current.set(customer.id, { ...existing, ...patch });
    requestSave(pendingRef.current);

    setCustomers((prev) =>
      prev.map((c) => (c.id === customer.id ? ({ ...c, ...patch } as Customer) : c))
    );
  };

  // ── Pipeline membership gate ───────────────────────────────────────────────
  // Only customers the rep has explicitly added to this month's pipeline show up.
  // CSV-imported background customers stay invisible until the rep promotes them
  // via the "+ Add to pipeline" flow.
  const inPipelineCustomers = useMemo(
    () => customers.filter((c) => c.inPipeline === true),
    [customers]
  );

  // ── Filter + sort ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = inPipelineCustomers;
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
  }, [inPipelineCustomers, search, pipelineFilter, docTypeFilter]);

  // ── Metrics (computed over the FILTERED view so they react to the chips) ───
  const metrics = useMemo(() => calcRepMetrics(filtered), [filtered]);

  if (!appUser) return null;

  const monthLabel = format(new Date(), "MMMM yyyy");

  return (
    <div className="mx-auto max-w-[1300px] px-[22px] py-7 space-y-5">
      {/* Page header — name on the left, autosave status + add button on the right */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[18px] font-semibold text-[color:var(--text-spec)] leading-tight">
            My Pipeline
          </h1>
          <p className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--muted-spec)] mt-1">
            {monthLabel}
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
