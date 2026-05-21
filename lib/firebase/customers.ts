// lib/firebase/customers.ts — Customer CRUD for forecast_v1/customers.
//
// REVAMP v2.0: the deals system has been removed, so this file no longer needs:
//   - logEdit() (edit history is gone)
//   - recomputeCustomerProfile / recomputeCustomerMeetings / recomputeCommissionStatus
//   - maybePromoteCustomerLifecycle / maybeFlagInactive
//   - the DEALS_PATH helper or any deal queries
//
// Firebase rule note: keep ".indexOn": ["ownerId"] on /forecast_v1/customers so
// `subscribeToUserCustomers` stays cheap.

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
import { STATE_TO_REGION } from "@/lib/forecast/regionConfig";
import type { Customer } from "@/types";

const CUSTOMERS_PATH = "forecast_v1/customers";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** One-shot read of all customers owned by a user. */
export async function getCustomersForUser(userId: string): Promise<Customer[]> {
  const q = query(ref(db, CUSTOMERS_PATH), orderByChild("ownerId"), equalTo(userId));
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
  const q = query(ref(db, CUSTOMERS_PATH), orderByChild("ownerId"), equalTo(userId));
  return onValue(q, (snap) => {
    const customers: Customer[] = [];
    if (snap.exists()) {
      snap.forEach((child) => {
        customers.push({ id: child.key!, ...child.val() } as Customer);
      });
    }
    callback(customers);
  });
}

/** One-shot read of ALL customers across all reps. Manager / VP / admin only. */
export async function getAllCustomers(): Promise<Customer[]> {
  const snap = await get(ref(db, CUSTOMERS_PATH));
  if (!snap.exists()) return [];
  const customers: Customer[] = [];
  snap.forEach((child) => {
    customers.push({ id: child.key!, ...child.val() } as Customer);
  });
  return customers;
}

/** Real-time subscription to ALL customers across all reps. Manager / VP / admin only. */
export function subscribeToAllCustomers(
  callback: (customers: Customer[]) => void
): () => void {
  return onValue(ref(db, CUSTOMERS_PATH), (snap) => {
    const customers: Customer[] = [];
    if (snap.exists()) {
      snap.forEach((child) => {
        customers.push({ id: child.key!, ...child.val() } as Customer);
      });
    }
    callback(customers);
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type CustomerCreateData = Omit<
  Customer,
  | "id"
  | "createdAt"
  | "lastMeetingDate"
  | "nextMeetingDate"
  | "commissionStatus"
  | "profile"
  | "profileUpdatedAt"
  | "pipelineType"
  | "docType"
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
    // REVAMP v2.0 defaults — every customer starts as a NEW prospect with no clinical
    // classification. docType becomes meaningful once Sheet 2 data lands or the rep picks it.
    pipelineType: "new",
    docType: "other",
    // Legacy deal-era fields kept here so reads against pre-revamp data don't 404
    // on missing keys. The UI no longer surfaces these.
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
  return { id: newRef.key!, ...customerData };
}

/**
 * Lightweight field patch — used by the rep dashboard autosave.
 * Multi-path update, no audit log, no diff. Use for inline edits.
 */
export async function patchCustomer(
  customerId: string,
  fields: Partial<Customer>
): Promise<void> {
  await update(ref(db, `${CUSTOMERS_PATH}/${customerId}`), fields);
}

/**
 * Update a customer with full-field semantics (still no edit log — that subsystem
 * was removed in the revamp). Auto-fills region if state changes.
 */
export async function updateCustomer(
  customerId: string,
  updates: Partial<Omit<Customer, "id" | "createdAt" | "lastMeetingDate" | "nextMeetingDate">>,
  _userId: string,
  currentCustomer: Customer
): Promise<void> {
  if (updates.state && !updates.region) {
    updates.region =
      STATE_TO_REGION[updates.state.toUpperCase()] || currentCustomer.region;
  }
  await update(ref(db, `${CUSTOMERS_PATH}/${customerId}`), updates);
}

/** Hard-delete a customer. */
export async function deleteCustomer(customerId: string, _userId: string): Promise<void> {
  await remove(ref(db, `${CUSTOMERS_PATH}/${customerId}`));
}
