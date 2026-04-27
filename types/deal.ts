// types/deal.ts — Deal interface for Firebase Realtime DB (forecast_v1/deals/{dealId})

import type { DealStage, DealStructure, ProcedureTier } from "./taxonomy";

export interface Deal {
  id: string; // Firebase key (set client-side after read)

  // Customer reference (denormalized for list performance)
  customerId: string;
  customerName: string;

  // Ownership (denormalized)
  ownerId: string;
  region: string;

  // Two-layer classification
  procedureTier: ProcedureTier;
  dealStructure: DealStructure;
  isForecastEligible: boolean; // derived from dealStructure on write

  // Stage + probability
  stage: DealStage;
  dealValue: number; // raw $
  closeProbability: number; // 0-100 integer
  isOverride: boolean; // true if rep manually changed closeProbability
  overrideReason: string | null; // required when |override| > 10pp from stage default

  // Dates
  expectedCloseDate: string; // ISO date string "YYYY-MM-DD"
  lastMeetingDate: string | null;
  nextMeetingDate: string | null;
  closedAt: number | null; // Unix timestamp ms — set when stage = won or lost

  // Linkage (for trial/mentorship → forecasted deal)
  linkedDealId: string | null;

  // Freeform
  notes: string;
  decisionMaker: string;

  // Metadata
  createdAt: number; // Unix timestamp ms
  updatedAt: number;
}
