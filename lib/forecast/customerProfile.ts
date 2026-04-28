// lib/forecast/customerProfile.ts — computeProfileFromDeals().
// Profile = highest procedure tier ever won; never demotes. See CLAUDE.md 4.6.
// "Highest" = lowest TIER_RANK number. course and tools map to non-clinical profiles.

import type { CustomerProfile, ProcedureTier } from "@/types";
import { TIER_RANK } from "@/types";

const TIER_TO_PROFILE: Record<ProcedureTier, CustomerProfile> = {
  everything: "everything",
  full_arch: "full_arch",
  ra_only: "ra_only",
  standard: "standard",
  course: "course_only",
  tools: "tools_only",
};

const PROFILE_RANK: Record<CustomerProfile, number> = {
  everything: 1,
  full_arch: 2,
  ra_only: 3,
  standard: 4,
  course_only: 5,
  tools_only: 6,
  new: 7,
};

interface WonDeal {
  procedureTier: ProcedureTier;
}

/**
 * Derive customer profile from won-deal history.
 * Profile = highest tier reached, never demotes.
 *   - No won deals → "new"
 *   - tools wins only → "tools_only"
 *   - course wins (or tools+course mix) → "course_only"
 *   - any clinical win → profile of the single highest clinical tier
 */
export function computeProfileFromDeals(wonDeals: WonDeal[]): CustomerProfile {
  if (wonDeals.length === 0) return "new";

  let best: ProcedureTier = "tools";
  for (const deal of wonDeals) {
    if (TIER_RANK[deal.procedureTier] < TIER_RANK[best]) {
      best = deal.procedureTier;
    }
  }
  return TIER_TO_PROFILE[best];
}

/** Returns whichever profile is ranked higher (lower rank number). Used to ensure no-demotion. */
export function higherProfile(a: CustomerProfile, b: CustomerProfile): CustomerProfile {
  return PROFILE_RANK[a] <= PROFILE_RANK[b] ? a : b;
}
