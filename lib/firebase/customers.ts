// lib/firebase/customers.ts — Customer reads/writes for forecast_v1/customers.
// Full CRUD implemented in Session 4. This file provides the minimal reads needed by Session 3.
//
// FIREBASE RULE NOTE: add ".indexOn": ["ownerId"] to the customers node for
// orderByChild("ownerId") queries to work efficiently.

import { ref, get, query, orderByChild, equalTo } from "firebase/database";
import { db } from "./client";
import type { Customer } from "@/types";

const DB_ROOT = "forecast_v1";
const CUSTOMERS_PATH = `${DB_ROOT}/customers`;

/** One-shot read of all customers owned by a user. Used by dashboard for temperature join. */
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

// TODO: Session 4 — implement full customer CRUD:
//   createCustomer, updateCustomer, deleteCustomer
//   recomputeCustomerProfile, recomputeCustomerMeetings
//   maybePromoteCustomerLifecycle, maybeFlagInactive
//   recomputeCommissionStatus, subscribeToUserCustomers
