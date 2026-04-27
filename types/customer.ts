// types/customer.ts — Customer interface for Firebase Realtime DB (forecast_v1/customers/{customerId})

import type {
  CommissionStatusValue,
  CustomerProfile,
  LeadTemperature,
  LifecycleStatus,
  RevenueDataSource,
} from "./taxonomy";

export interface Customer {
  id: string; // Firebase key (set client-side after read)

  // Identity
  name: string; // Contact name, e.g. "Dr. Patel"
  practiceName: string;
  address: string; // V1: free text
  state: string; // 2-letter US state code — drives region auto-mapping
  phone: string;
  email: string;

  // Status (two distinct fields — displayed together in UI as one "Status" widget)
  lifecycleStatus: LifecycleStatus;
  commissionStatus: { [year: number]: CommissionStatusValue }; // system-computed, stored per year

  // Temperature (rep-managed, independent of stage)
  leadTemperature: LeadTemperature;
  temperatureUpdatedAt: number | null; // Unix timestamp ms — drives 30-day staleness flag

  // Profile (auto-derived from won deal history — never demotes)
  profile: CustomerProfile;
  profileUpdatedAt: number | null; // Unix timestamp ms

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
