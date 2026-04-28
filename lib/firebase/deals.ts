// lib/firebase/deals.ts — Deal CRUD for forecast_v1/deals.
// All writes log to editHistory. Stage transitions to "won" trigger customer computed-field stubs.
//
// FIREBASE RULE NOTE: add ".indexOn": ["ownerId"] to the deals node so
// orderByChild("ownerId") queries don't full-scan. Example in rules:
//   "deals": { ".indexOn": ["ownerId"], "$dealId": { ... } }

import {
  ref,
  push,
  set,
  get,
  update,
  remove,
  query,
  orderByChild,
  equalTo,
  onValue,
} from "firebase/database";
import { db } from "./client";
import { logEdit } from "./history";
import type { Deal } from "@/types";
import { FORECAST_ELIGIBLE_STRUCTURES, STAGE_DEFAULT_PROBABILITY } from "@/types";

const DB_ROOT = "forecast_v1";
const DEALS_PATH = `${DB_ROOT}/deals`;

/** One-shot read of a single deal. Returns null if not found. */
export async function getDeal(dealId: string): Promise<Deal | null> {
  const snap = await get(ref(db, `${DEALS_PATH}/${dealId}`));
  if (!snap.exists()) return null;
  return { id: snap.key!, ...snap.val() } as Deal;
}

/** One-shot read of all deals owned by a user. */
export async function getDealsForUser(userId: string): Promise<Deal[]> {
  const q = query(
    ref(db, DEALS_PATH),
    orderByChild("ownerId"),
    equalTo(userId)
  );
  const snap = await get(q);
  if (!snap.exists()) return [];
  const deals: Deal[] = [];
  snap.forEach((child) => { deals.push({ id: child.key!, ...child.val() } as Deal); });
  return deals;
}

/**
 * Real-time subscription to a user's deals.
 * Returns the Firebase unsubscribe function — call it in your useEffect cleanup.
 *
 * Requires ".indexOn": ["ownerId"] on the deals node in Firebase rules.
 */
export function subscribeToUserDeals(
  userId: string,
  callback: (deals: Deal[]) => void
): () => void {
  const q = query(
    ref(db, DEALS_PATH),
    orderByChild("ownerId"),
    equalTo(userId)
  );
  const unsubscribe = onValue(q, (snap) => {
    const deals: Deal[] = [];
    if (snap.exists()) {
      snap.forEach((child) => {
        deals.push({ id: child.key!, ...child.val() } as Deal);
      });
    }
    callback(deals);
  });
  return unsubscribe;
}

/**
 * Create a new deal. Auto-computes isForecastEligible from dealStructure.
 * If customerId is empty, creates a stub customer record (Session 4 replaces with picker).
 */
export async function createDeal(
  data: Omit<Deal, "id" | "createdAt" | "updatedAt" | "isForecastEligible">,
  userId: string
): Promise<Deal> {
  const now = Date.now();
  const isForecastEligible = FORECAST_ELIGIBLE_STRUCTURES.includes(
    data.dealStructure
  );

  // Auto-create a stub customer if none provided (Session 4 replaces with picker)
  let customerId = data.customerId;
  if (!customerId) {
    const stubRef = push(ref(db, `${DB_ROOT}/customers`));
    await set(stubRef, {
      name: data.customerName,
      practiceName: "",
      address: "",
      state: "",
      phone: "",
      email: "",
      lifecycleStatus: "new",
      commissionStatus: {},
      leadTemperature: "warm",
      temperatureUpdatedAt: now,
      profile: "new",
      profileUpdatedAt: now,
      ownerId: userId,
      region: data.region,
      currentSystems: "",
      norisImplantUse: "",
      primaryPainPoint: "",
      notes: "",
      annualRevenue: {},
      revenueDataSource: {},
      firstOrderDate: null,
      lastOrderDate: null,
      orderCadenceDays: null,
      lastMeetingDate: null,
      nextMeetingDate: null,
      lostReason: null,
      lostCompetitor: null,
      lostDate: null,
      lostDealValue: null,
      winBackQueueDate: null,
      createdAt: now,
      createdBy: userId,
      importBatchId: null,
    });
    customerId = stubRef.key!;
  }

  const newRef = push(ref(db, DEALS_PATH));
  const deal: Omit<Deal, "id"> = {
    ...data,
    customerId,
    isForecastEligible,
    isOverride: false,
    overrideReason: null,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await set(newRef, deal);

  await logEdit(newRef.key!, {
    userId,
    field: "_created",
    oldValue: null,
    newValue: data.customerName,
    timestamp: now,
  });

  return { id: newRef.key!, ...deal };
}

/**
 * Update a deal. Diffs against currentDeal to log only changed fields.
 * Handles isOverride / isForecastEligible recomputation automatically.
 * Pass overrideReason when closeProbability deviates >±10% from stage default.
 */
export async function updateDeal(
  dealId: string,
  updates: Partial<Omit<Deal, "id" | "createdAt">>,
  userId: string,
  currentDeal: Deal,
  overrideReason?: string
): Promise<void> {
  const now = Date.now();
  const stage = (updates.stage ?? currentDeal.stage);
  const closeProbability = updates.closeProbability ?? currentDeal.closeProbability;
  const dealStructure = updates.dealStructure ?? currentDeal.dealStructure;

  const defaultProb = STAGE_DEFAULT_PROBABILITY[stage];
  const isOverride = Math.abs(closeProbability - defaultProb) > 10;
  const isForecastEligible = FORECAST_ELIGIBLE_STRUCTURES.includes(dealStructure);

  const finalUpdates: Partial<Deal> = {
    ...updates,
    isOverride,
    overrideReason: isOverride
      ? (overrideReason ?? currentDeal.overrideReason)
      : null,
    isForecastEligible,
    updatedAt: now,
  };

  // Set closedAt when moving to won or lost
  if (updates.stage === "won" && currentDeal.stage !== "won") {
    finalUpdates.closedAt = now;
  } else if (updates.stage === "lost" && currentDeal.stage !== "lost") {
    finalUpdates.closedAt = now;
  } else if (
    updates.stage &&
    updates.stage !== "won" &&
    updates.stage !== "lost"
  ) {
    finalUpdates.closedAt = null;
  }

  await update(ref(db, `${DEALS_PATH}/${dealId}`), finalUpdates);

  // Log each meaningfully changed field
  for (const [field, newValue] of Object.entries(updates)) {
    const oldValue = currentDeal[field as keyof Deal];
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      await logEdit(dealId, {
        userId,
        field,
        oldValue: oldValue ?? null,
        newValue: newValue ?? null,
        timestamp: now,
        ...(field === "closeProbability" && isOverride
          ? { reason: overrideReason }
          : {}),
      });
    }
  }

  // Trigger customer computed fields (stubs — implemented in Session 4)
  if (updates.stage === "won" && currentDeal.stage !== "won") {
    await _onDealWon(currentDeal.customerId);
  }
  if (
    updates.lastMeetingDate !== undefined ||
    updates.nextMeetingDate !== undefined
  ) {
    await _onMeetingDatesChanged(currentDeal.customerId);
  }
}

/** Hard-delete a deal. Logs the deletion before removing. */
export async function deleteDeal(
  dealId: string,
  userId: string
): Promise<void> {
  await logEdit(dealId, {
    userId,
    field: "_deleted",
    oldValue: "deal",
    newValue: null,
    timestamp: Date.now(),
  });
  await remove(ref(db, `${DEALS_PATH}/${dealId}`));
}

// --- Customer trigger stubs (wired in Session 4) ---

async function _onDealWon(customerId: string) {
  // TODO: Session 4 — import and call:
  //   maybePromoteCustomerLifecycle(customerId)
  //   recomputeCustomerProfile(customerId)
  //   recomputeCommissionStatus(customerId, [currentYear, currentYear + 1])
  void customerId;
}

async function _onMeetingDatesChanged(customerId: string) {
  // TODO: Session 4 — import and call recomputeCustomerMeetings(customerId)
  void customerId;
}
