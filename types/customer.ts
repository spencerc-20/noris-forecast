// types/customer.ts — Customer interface for Firebase Realtime DB (forecast_v1/customers/{customerId})
//
// REVAMP v2.0 (2026-05): Active fields are pipelineType, docType, expectedMonthlyTotal/
// closeProbability (NEW) or expectedMonthly/actualThisMonth (EXISTING). Older deal-era
// fields (lifecycleStatus, leadTemperature, profile, commissionStatus, lostReason, etc.)
// are kept for backward compatibility with stored data but no longer drive the UI.

import type {
  CommissionStatusValue,
  CustomerProfile,
  DocType,
  LeadTemperature,
  LifecycleStatus,
  PipelineType,
  RevenueDataSource,
} from "./taxonomy";

/**
 * Per-month forecast data for a single customer. Stored under
 * `customers/{id}/months/{YYYY-MM}/` so a rep can scroll through prior months
 * and see how each one tracked.
 */
export interface MonthData {
  /** EXISTING accounts: the rep's monthly run-rate expectation. */
  expectedMonthly?: number;
  /** EXISTING accounts: dollars actually purchased this month. */
  actualThisMonth?: number;
  /** NEW accounts: dollars the rep expects to close THIS month. */
  expectedMonthlyTotal?: number;
  /** NEW accounts: % likelihood of closing (0–100). */
  closeProbability?: number;
  /** NEW accounts: workflow status — "prospecting" by default, "closed" promotes to EXISTING. */
  newStatus?: "prospecting" | "closed";
}

export interface Customer {
  id: string; // Firebase key (set client-side after read)

  // Identity
  name: string; // Contact name, e.g. "Dr. Patel"
  practiceName: string;
  address: string; // V1: free text
  state: string; // 2-letter US state code — drives region auto-mapping
  phone: string;
  email: string;

  // ── REVAMP v2.0 — active classification + forecast fields ──────────────────

  /**
   * Pipeline membership gate. Only customers with `inPipeline === true`
   * appear on a rep's dashboard. CSV-imported background customers default
   * to false; reps explicitly add them via the "+ Add to pipeline" flow.
   */
  inPipeline?: boolean;

  /** "new" = active prospect (rep is pitching), "existing" = recurring book account. */
  pipelineType: PipelineType;

  /**
   * Per-month forecast data, keyed by "YYYY-MM". Each bucket holds the dollar
   * + percent + status fields that the rep edits monthly. The top-level
   * expectedMonthly/actualThisMonth/expectedMonthlyTotal/closeProbability/
   * newStatus fields are kept as @deprecated fallbacks for pre-month-schema
   * records — read the per-month bucket first, fall back if absent.
   */
  months?: Record<string, MonthData>;

  /** Clinical doc-type — auto-derived from Sheet 2 unit mix, rep-overridable. */
  docType: DocType;

  /** True if rep manually set docType (suppresses re-derivation on next import). */
  docTypeIsOverride?: boolean;

  // NEW-pipeline fields (used when pipelineType === "new")
  /** Dollar amount the rep expects this customer to close THIS MONTH. */
  expectedMonthlyTotal?: number;
  /** % likelihood the new-pipeline deal actually closes this month (0–100). */
  closeProbability?: number;
  /**
   * NEW-row workflow status. "prospecting" is the default. Moving to "closed"
   * converts the row into an EXISTING recurring account — see Step 4 logic in
   * the dashboard `handleStatusChange`.
   */
  newStatus?: "prospecting" | "closed";

  // EXISTING-recurring fields (used when pipelineType === "existing")
  /** Customer's normal monthly run-rate. Rep-entered baseline. */
  expectedMonthly?: number;
  /** $ actually purchased so far this calendar month. Rep updates as orders land. */
  actualThisMonth?: number;

  // ── DEPRECATED (kept for historical data, no longer driven by UI) ──────────

  /** @deprecated Replaced by `pipelineType`. Still written by old import code paths. */
  lifecycleStatus: LifecycleStatus;
  commissionStatus: { [year: number]: CommissionStatusValue }; // system-computed, stored per year

  /** @deprecated Lead temperature dropped from revamp UI (kept for historical data). */
  leadTemperature: LeadTemperature;
  temperatureUpdatedAt: number | null; // Unix timestamp ms — drives 30-day staleness flag

  /** @deprecated Replaced by `docType`. Old deal-derived profile field. */
  profile: CustomerProfile;
  profileUpdatedAt: number | null; // Unix timestamp ms

  // Sheet2-derived fields (populated by product-family CSV import)
  /** Per-family obligo totals from Sheet2: { "Zygomatic_Implant": { qty: 2, sales: 14000 }, ... } */
  productFamilyBreakdown?: { [family: string]: { qty: number; sales: number } };
  /** @deprecated Replaced by `docType`. Old Sheet2-derived profile field. */
  procedureProfile?: CustomerProfile;
  /**
   * Raw unit counts and percentages used to derive procedureProfile.
   * Stored so Spencer can audit classifications and tune thresholds later.
   */
  profileRatios?: {
    tuffUnits: number;
    raUnits: number;
    otherUnits: number;
    /** tuffUnits as % of total clinical units (0–100, integer) */
    tuffPct: number;
    /** raUnits as % of total clinical units (0–100, integer) */
    raPct: number;
    /** otherUnits as % of total clinical units (0–100, integer) */
    otherPct: number;
  };

  // Ownership
  ownerId: string;
  region: string; // auto-set from state via STATE_TO_REGION; rep can override

  // Sales context (free text V1; pick-lists V2)
  currentSystems: string;
  norisImplantUse: string;
  primaryPainPoint: string;
  notes: string; // customer-level notes (distinct from deal-level notes)

  // Revenue history (populated by CSV import)
  annualRevenue: { [year: number]: number }; // e.g. { 2023: 12500, 2024: 18000 }
  revenueDataSource: { [year: number]: RevenueDataSource }; // tracks whether value came from import or live deals

  // Order cadence
  firstOrderDate: string | null; // ISO date
  lastOrderDate: string | null; // ISO date
  orderCadenceDays: number | null;

  /**
   * DERIVED — do not write directly. Computed by recomputeCustomerMeetings()
   * after any deal write. Equals max(lastMeetingDate) across open deals.
   */
  lastMeetingDate: string | null;

  /**
   * DERIVED — do not write directly. Computed by recomputeCustomerMeetings()
   * after any deal write. Equals min(future nextMeetingDate) across open deals.
   */
  nextMeetingDate: string | null;

  // Lost tracking
  lostReason: string | null;
  lostCompetitor: string | null;
  lostDate: string | null; // ISO date
  lostDealValue: number | null;
  winBackQueueDate: string | null; // ISO date — when to surface in win-back queue

  // Metadata
  createdAt: number; // Unix timestamp ms
  createdBy: string; // userId
  importBatchId: string | null; // links to imports/{importBatchId} if created via CSV
}
