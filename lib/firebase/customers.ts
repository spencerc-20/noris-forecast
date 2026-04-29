// lib/firebase/customers.ts — Customer CRUD + computed-field recomputation for forecast_v1/customers.
//
// FIREBASE RULE NOTES:
//   - add ".indexOn": ["ownerId"] to the customers node
//   - add ".indexOn": ["ownerId"] to the deals node (already required for deal queries)
// Recomputation queries deals by ownerId then filters client-side (no customerId index needed for V1).

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
import { STATE_TO_REGION } from "@/lib/forecast/regionConfig";
import { computeProfileFromDeals, higherProfile } from "@/lib/forecast/customerProfile";
import { computeCommissionStatus } from "@/lib/forecast/commissionStatus";
import { promoteLifecycleOnWin, flagInactiveIfNoActivity } from "@/lib/forecast/lifecycleStatus";
import type { Customer, Deal } from "@/types";

const DB_ROOT = "forecast_v1";
const CUSTOMERS_PATH = `${DB_ROOT}/customers`;
const DEALS_PATH = `${DB_ROOT}/deals`;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** One-shot read of all customers owned by a user. */
export async function getCustomersForUser(userId: string): Promise<Customer[]> {
  const q = query(
    ref(db, CUSTOMERS_PATH),
    orderByChild("ownerId"),
    equalTo(userId)
  );
  const snap = await get(q);
  if (!snap.exists()) return [];
  const customers: Customer[] = [];
  snap.forEach((child) => {
    customers.push({ id: child.key!, ...child.val() } as Customer);
  });
  return customers;
}

/** One-shot read of a single customer. Returns null if not found. */
export async function getCustomer(customerId: string): Promise<Customer | null> {
  const snap = await get(ref(db, `${CUSTOMERS_PATH}/${customerId}`));
  if (!snap.exists()) return null;
  return { id: snap.key!, ...snap.val() } as Customer;
}

/** Real-time subscription to all customers owned by a user. */
export function subscribeToUserCustomers(
  userId: string,
  callback: (customers: Customer[]) => void
): () => void {
  const q = query(
    ref(db, CUSTOMERS_PATH),
    orderByChild("ownerId"),
    equalTo(userId)
  );
  const unsub = onValue(q, (snap) => {
    const customers: Customer[] = [];
    if (snap.exists()) {
      snap.forEach((child) => {
        customers.push({ id: child.key!, ...child.val() } as Customer);
      });
    }
    callback(customers);
  });
  return unsub;
}

/**
 * One-shot read of ALL customers across all reps.
 * Used by admin / manager / VP roles.
 */
export async function getAllCustomers(): Promise<Customer[]> {
  const snap = await get(ref(db, CUSTOMERS_PATH));
  if (!snap.exists()) return [];
  const customers: Customer[] = [];
  snap.forEach((child) => {
    customers.push({ id: child.key!, ...child.val() } as Customer);
  });
  return customers;
}

/**
 * Real-time subscription to ALL customers across all reps.
 * Used by admin / manager / VP roles. No ownerId filter — reads the full node.
 */
export function subscribeToAllCustomers(
  callback: (customers: Customer[]) => void
): () => void {
  const unsub = onValue(ref(db, CUSTOMERS_PATH), (snap) => {
    const customers: Customer[] = [];
    if (snap.exists()) {
      snap.forEach((child) => {
        customers.push({ id: child.key!, ...child.val() } as Customer);
      });
    }
    callback(customers);
  });
  return unsub;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type CustomerCreateData = Omit<
  Customer,
  "id" | "createdAt" | "lastMeetingDate" | "nextMeetingDate" | "commissionStatus" | "profile" | "profileUpdatedAt"
>;

/** Create a new customer. Auto-assigns region from state if region is empty. */
export async function createCustomer(
  data: CustomerCreateData,
  userId: string
): Promise<Customer> {
  const now = Date.now();
  const region = data.region || STATE_TO_REGION[data.state?.toUpperCase()] || "Unassigned";

  const customerData: Omit<Customer, "id"> = {
    ...data,
    region,
    commissionStatus: {},
    profile: "new",
    profileUpdatedAt: now,
    lastMeetingDate: null,
    nextMeetingDate: null,
    createdAt: now,
    createdBy: userId,
  };

  const newRef = push(ref(db, CUSTOMERS_PATH));
  await set(newRef, customerData);

  await logEdit(newRef.key!, {
    userId,
    field: "_created",
    oldValue: null,
    newValue: data.name,
    timestamp: now,
  });

  return { id: newRef.key!, ...customerData };
}

/** Update a customer. Diffs against currentCustomer and logs only changed fields. */
export async function updateCustomer(
  customerId: string,
  updates: Partial<Omit<Customer, "id" | "createdAt" | "lastMeetingDate" | "nextMeetingDate">>,
  userId: string,
  currentCustomer: Customer
): Promise<void> {
  const now = Date.now();

  // Auto-assign region if state changed and region wasn't explicitly set
  if (updates.state && !updates.region) {
    updates.region =
      STATE_TO_REGION[updates.state.toUpperCase()] || currentCustomer.region;
  }

  await update(ref(db, `${CUSTOMERS_PATH}/${customerId}`), updates);

  for (const [field, newValue] of Object.entries(updates)) {
    const oldValue = currentCustomer[field as keyof Customer];
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      await logEdit(customerId, {
        userId,
        field,
        oldValue: oldValue ?? null,
        newValue: newValue ?? null,
        timestamp: now,
      });
    }
  }
}

/**
 * One-time migration: set leadTemperature = 'warm' for every customer whose
 * lifecycleStatus is 'existing' but whose temperature is still 'cold' (the old
 * import default). Uses a single multi-path update for efficiency.
 * Returns the number of customers updated.
 */
export async function migrateExistingCustomerTemperature(): Promise<number> {
  const snap = await get(ref(db, CUSTOMERS_PATH));
  if (!snap.exists()) return 0;

  const updates: Record<string, string> = {};
  snap.forEach((child) => {
    const c = child.val() as Partial<Customer>;
    if (c.lifecycleStatus === "existing" && c.leadTemperature === "cold") {
      updates[`${child.key!}/leadTemperature`] = "warm";
    }
  });

  const count = Object.keys(updates).length;
  if (count > 0) {
    await update(ref(db, CUSTOMERS_PATH), updates);
  }
  return count;
}

/** Hard-delete a customer. Logs before removing. */
export async function deleteCustomer(
  customerId: string,
  userId: string
): Promise<void> {
  await logEdit(customerId, {
    userId,
    field: "_deleted",
    oldValue: "customer",
    newValue: null,
    timestamp: Date.now(),
  });
  await remove(ref(db, `${CUSTOMERS_PATH}/${customerId}`));
}

// ---------------------------------------------------------------------------
// Internal: deal queries for recomputation (no import from deals.ts to avoid circular dep)
// ---------------------------------------------------------------------------

async function _getCustomerDeals(customerId: string, ownerId: string): Promise<Deal[]> {
  const q = query(
    ref(db, DEALS_PATH),
    orderByChild("ownerId"),
    equalTo(ownerId)
  );
  const snap = await get(q);
  const deals: Deal[] = [];
  if (snap.exists()) {
    snap.forEach((child) => {
      const deal = { id: child.key!, ...child.val() } as Deal;
      if (deal.customerId === customerId) deals.push(deal);
    });
  }
  return deals;
}

// ---------------------------------------------------------------------------
// Computed-field recomputation (called from deals.ts after stage/meeting changes)
// ---------------------------------------------------------------------------

/**
 * Recompute and persist customer profile after a deal closes won.
 * Never demotes: only upgrades to a higher profile tier.
 */
export async function recomputeCustomerProfile(customerId: string): Promise<void> {
  const customer = await getCustomer(customerId);
  if (!customer) return;

  const deals = await _getCustomerDeals(customerId, customer.ownerId);
  const wonDeals = deals.filter((d) => d.stage === "won");

  const computed = computeProfileFromDeals(wonDeals);
  const newProfile = higherProfile(computed, customer.profile);

  if (newProfile === customer.profile) return;

  await update(ref(db, `${CUSTOMERS_PATH}/${customerId}`), {
    profile: newProfile,
    profileUpdatedAt: Date.now(),
  });
}

/**
 * Recompute customer meeting dates from all deals.
 * lastMeetingDate = max(deal.lastMeetingDate); nextMeetingDate = min(future deal.nextMeetingDate).
 * These are derived fields — never written directly.
 */
export async function recomputeCustomerMeetings(customerId: string): Promise<void> {
  const customer = await getCustomer(customerId);
  if (!customer) return;

  const deals = await _getCustomerDeals(customerId, customer.ownerId);
  const todayStr = new Date().toISOString().slice(0, 10);

  let lastMeetingDate: string | null = null;
  let nextMeetingDate: string | null = null;

  for (const deal of deals) {
    if (deal.lastMeetingDate) {
      if (!lastMeetingDate || deal.lastMeetingDate > lastMeetingDate) {
        lastMeetingDate = deal.lastMeetingDate;
      }
    }
    if (deal.nextMeetingDate && deal.nextMeetingDate >= todayStr) {
      if (!nextMeetingDate || deal.nextMeetingDate < nextMeetingDate) {
        nextMeetingDate = deal.nextMeetingDate;
      }
    }
  }

  await update(ref(db, `${CUSTOMERS_PATH}/${customerId}`), {
    lastMeetingDate,
    nextMeetingDate,
  });
}

/**
 * Recompute commission status for the given years and merge into stored commissionStatus.
 * Called when a deal moves to won (recompute current year + following year).
 */
export async function recomputeCommissionStatus(
  customerId: string,
  years: number[]
): Promise<void> {
  const customer = await getCustomer(customerId);
  if (!customer) return;

  const deals = await _getCustomerDeals(customerId, customer.ownerId);
  const wonDeals = deals.filter((d) => d.stage === "won");

  const newStatuses = computeCommissionStatus(
    years,
    customer.annualRevenue ?? {},
    wonDeals
  );

  const merged = { ...customer.commissionStatus, ...newStatuses };
  await update(ref(db, `${CUSTOMERS_PATH}/${customerId}`), {
    commissionStatus: merged,
  });
}

/**
 * Promote lifecycle status when a deal closes won.
 * potential / new / inactive → existing.
 */
export async function maybePromoteCustomerLifecycle(customerId: string): Promise<void> {
  const customer = await getCustomer(customerId);
  if (!customer) return;

  const promoted = promoteLifecycleOnWin(customer.lifecycleStatus);
  if (promoted === customer.lifecycleStatus) return;

  await update(ref(db, `${CUSTOMERS_PATH}/${customerId}`), {
    lifecycleStatus: promoted,
  });

  await logEdit(customerId, {
    userId: "system",
    field: "lifecycleStatus",
    oldValue: customer.lifecycleStatus,
    newValue: promoted,
    timestamp: Date.now(),
    reason: "Auto-promoted on deal win",
  });
}

/**
 * Flag existing customers as inactive if they have no current-year activity.
 * Intended for use in import pipeline and nightly checks (V2: Cloud Function).
 */
export async function maybeFlagInactive(customerId: string): Promise<void> {
  const customer = await getCustomer(customerId);
  if (!customer) return;

  const deals = await _getCustomerDeals(customerId, customer.ownerId);
  const wonDeals = deals.filter((d) => d.stage === "won");
  const currentYear = new Date().getFullYear();

  const newStatus = flagInactiveIfNoActivity(
    customer.lifecycleStatus,
    currentYear,
    customer.annualRevenue ?? {},
    wonDeals
  );
  if (newStatus === customer.lifecycleStatus) return;

  await update(ref(db, `${CUSTOMERS_PATH}/${customerId}`), {
    lifecycleStatus: newStatus,
  });

  await logEdit(customerId, {
    userId: "system",
    field: "lifecycleStatus",
    oldValue: customer.lifecycleStatus,
    newValue: newStatus,
    timestamp: Date.now(),
    reason: "Auto-flagged inactive: no current-year activity",
  });
}
