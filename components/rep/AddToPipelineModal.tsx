// components/rep/AddToPipelineModal.tsx — "+ Add to pipeline" flow.
//
// Two paths:
//   (a) Search background customers (owned by anyone, inPipeline=false) by name
//       and promote one — pre-fills docType from its historical classification.
//   (b) Type a brand-new name → create the customer.
//
// In both cases the final step is picking pipelineType ("New" or "Existing"),
// then we flip inPipeline=true and reassign ownership to the current rep.

"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Plus, ArrowLeft } from "lucide-react";
import {
  getAllCustomers,
  createCustomer,
  patchCustomer,
} from "@/lib/firebase/customers";
import { DOC_TYPE_LABELS } from "@/types";
import type { Customer, DocType, PipelineType } from "@/types";

interface AddToPipelineModalProps {
  open: boolean;
  onClose: () => void;
  ownerId: string;
  region: string;
  /** Already-in-pipeline customer IDs so we can filter them out of search. */
  inPipelineIds: Set<string>;
}

type Step = "pick-mode" | "search" | "create" | "pick-type";

interface CandidateExisting {
  kind: "existing";
  customer: Customer;
}
interface CandidateBrandNew {
  kind: "brand-new";
  name: string;
}
type Candidate = CandidateExisting | CandidateBrandNew;

const MAX_RESULTS = 8;

export function AddToPipelineModal({
  open,
  onClose,
  ownerId,
  region,
  inPipelineIds,
}: AddToPipelineModalProps) {
  const [step, setStep] = useState<Step>("pick-mode");
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset internal state every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setStep("pick-mode");
    setQuery("");
    setCandidate(null);
    setError(null);
  }, [open]);

  // Lazy-load the background customer list when the user enters search mode.
  useEffect(() => {
    if (step !== "search" || allCustomers.length > 0) return;
    setLoading(true);
    getAllCustomers()
      .then((list) => setAllCustomers(list))
      .catch((err) => setError(err.message ?? String(err)))
      .finally(() => setLoading(false));
  }, [step, allCustomers.length]);

  // Top N name matches, excluding customers already in this rep's pipeline.
  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allCustomers
      .filter((c) => !inPipelineIds.has(c.id))
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.practiceName?.toLowerCase().includes(q)
      )
      .slice(0, MAX_RESULTS);
  }, [allCustomers, query, inPipelineIds]);

  async function handleConfirm(pipelineType: PipelineType) {
    if (!candidate) return;
    setSubmitting(true);
    setError(null);
    try {
      if (candidate.kind === "existing") {
        // Promote the existing background record — adopt its docType, reassign
        // ownership, flip the pipeline gate.
        await patchCustomer(candidate.customer.id, {
          inPipeline: true,
          pipelineType,
          ownerId,
        });
      } else {
        // Brand-new account — create with rep as owner, honouring chosen pipelineType.
        await createCustomer(
          {
            name: candidate.name.trim(),
            practiceName: "",
            address: "",
            state: "",
            phone: "",
            email: "",
            lifecycleStatus: pipelineType === "existing" ? "existing" : "new",
            leadTemperature: "cold",
            temperatureUpdatedAt: Date.now(),
            ownerId,
            region,
            currentSystems: "",
            norisImplantUse: "",
            primaryPainPoint: "",
            notes: "",
            annualRevenue: {},
            revenueDataSource: {},
            firstOrderDate: null,
            lastOrderDate: null,
            orderCadenceDays: null,
            lostReason: null,
            lostCompetitor: null,
            lostDate: null,
            lostDealValue: null,
            winBackQueueDate: null,
            importBatchId: null,
            createdBy: ownerId,
            inPipeline: true,
            pipelineType,
          },
          ownerId
        );
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[color:var(--border-spec)] bg-[color:var(--surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--border-spec)]">
          <div className="flex items-center gap-2">
            {step !== "pick-mode" && (
              <button
                onClick={() => {
                  if (step === "pick-type") setStep(candidate?.kind === "existing" ? "search" : "create");
                  else setStep("pick-mode");
                  setError(null);
                }}
                className="text-[color:var(--muted-spec)] hover:text-[color:var(--text-spec)]"
                aria-label="Back"
              >
                <ArrowLeft size={14} />
              </button>
            )}
            <h2 className="text-[13px] font-semibold text-[color:var(--text-spec)]">
              {step === "pick-mode" && "Add to pipeline"}
              {step === "search" && "Search existing customers"}
              {step === "create" && "Create a new account"}
              {step === "pick-type" && "Pipeline type"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[color:var(--muted-spec)] hover:text-[color:var(--text-spec)] text-[13px]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-4 space-y-3">
          {/* Step 1: pick mode */}
          {step === "pick-mode" && (
            <>
              <button
                onClick={() => setStep("search")}
                className="w-full rounded-lg border border-[color:var(--border-spec)] bg-[color:var(--surface-2)]/40 px-4 py-3.5 text-left hover:border-[color:var(--noris)]/50 transition-colors"
              >
                <div className="flex items-center gap-2.5 text-[color:var(--text-spec)] text-[13px] font-medium">
                  <Search size={14} className="text-[color:var(--noris)]" />
                  Search existing customers
                </div>
                <p className="text-[11px] text-[color:var(--muted-spec)] mt-1">
                  Pull from the imported customer book — Sheet 2 doc-type pre-filled.
                </p>
              </button>
              <button
                onClick={() => setStep("create")}
                className="w-full rounded-lg border border-[color:var(--border-spec)] bg-[color:var(--surface-2)]/40 px-4 py-3.5 text-left hover:border-[color:var(--noris)]/50 transition-colors"
              >
                <div className="flex items-center gap-2.5 text-[color:var(--text-spec)] text-[13px] font-medium">
                  <Plus size={14} className="text-[color:var(--noris)]" />
                  Create a new account
                </div>
                <p className="text-[11px] text-[color:var(--muted-spec)] mt-1">
                  Brand-new customer not in the imported list.
                </p>
              </button>
            </>
          )}

          {/* Step 2a: search */}
          {step === "search" && (
            <>
              <input
                autoFocus
                placeholder="Type a name or practice…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full text-[13px] bg-[color:var(--surface-2)]/40 border border-[color:var(--border-spec)] rounded-md px-3 py-2 text-[color:var(--text-spec)] placeholder:text-[color:var(--muted-spec)] focus:outline-none focus:border-[color:var(--noris)]"
              />
              <div className="space-y-1 max-h-[280px] overflow-y-auto">
                {loading ? (
                  <p className="text-[11px] text-[color:var(--muted-spec)] py-2 text-center">
                    Loading customer book…
                  </p>
                ) : !query.trim() ? (
                  <p className="text-[11px] text-[color:var(--muted-spec)] py-2 text-center">
                    Start typing to search {allCustomers.length} customers.
                  </p>
                ) : results.length === 0 ? (
                  <p className="text-[11px] text-[color:var(--muted-spec)] py-2 text-center">
                    No matches. Use &ldquo;Create a new account&rdquo; instead.
                  </p>
                ) : (
                  results.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCandidate({ kind: "existing", customer: c });
                        setStep("pick-type");
                      }}
                      className="w-full text-left px-3 py-2 rounded-md border border-transparent hover:border-[color:var(--border-spec)] hover:bg-[color:var(--surface-2)]/40 transition-colors"
                    >
                      <p className="text-[13px] font-medium text-[color:var(--text-spec)] truncate">
                        {c.name}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-[color:var(--muted-spec)]">
                        {c.practiceName && <span className="truncate">{c.practiceName}</span>}
                        {c.practiceName && c.docType && <span>·</span>}
                        {c.docType && <span>{DOC_TYPE_LABELS[c.docType as DocType]}</span>}
                        {c.state && <span>· {c.state}</span>}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {/* Step 2b: create */}
          {step === "create" && (
            <>
              <label className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--muted-spec)]">
                Customer name
              </label>
              <input
                autoFocus
                placeholder="Dr. Smith"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full text-[13px] bg-[color:var(--surface-2)]/40 border border-[color:var(--border-spec)] rounded-md px-3 py-2 text-[color:var(--text-spec)] placeholder:text-[color:var(--muted-spec)] focus:outline-none focus:border-[color:var(--noris)]"
              />
              <button
                disabled={!query.trim()}
                onClick={() => {
                  setCandidate({ kind: "brand-new", name: query.trim() });
                  setStep("pick-type");
                }}
                className="w-full mt-1 rounded-md bg-[color:var(--noris)] text-white py-2 text-[12px] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[color:var(--noris)]/90 transition-colors"
              >
                Next
              </button>
            </>
          )}

          {/* Step 3: pick type */}
          {step === "pick-type" && candidate && (
            <>
              <div className="rounded-md border border-[color:var(--border-spec)] bg-[color:var(--surface-2)]/40 px-3 py-2">
                <p className="text-[12px] font-medium text-[color:var(--text-spec)] truncate">
                  {candidate.kind === "existing" ? candidate.customer.name : candidate.name}
                </p>
                {candidate.kind === "existing" && candidate.customer.docType && (
                  <p className="text-[11px] text-[color:var(--muted-spec)] truncate">
                    Doc-type pre-filled: {DOC_TYPE_LABELS[candidate.customer.docType]}
                  </p>
                )}
              </div>
              <p className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--muted-spec)] pt-1">
                Pipeline type
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={submitting}
                  onClick={() => handleConfirm("new")}
                  className="rounded-md border border-[#3b6aff]/40 bg-[#3b6aff]/15 text-[#9ab3ff] py-2 text-[12px] font-medium hover:border-[#3b6aff] disabled:opacity-50 transition-colors"
                >
                  New prospect
                </button>
                <button
                  disabled={submitting}
                  onClick={() => handleConfirm("existing")}
                  className="rounded-md border border-[color:var(--good)]/40 bg-[color:var(--good)]/15 text-[color:var(--good)] py-2 text-[12px] font-medium hover:border-[color:var(--good)] disabled:opacity-50 transition-colors"
                >
                  Existing recurring
                </button>
              </div>
            </>
          )}

          {error && (
            <p className="text-[11px] text-[color:var(--bad)] pt-1">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
