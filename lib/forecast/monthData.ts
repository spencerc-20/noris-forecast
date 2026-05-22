// lib/forecast/monthData.ts — Month-keyed customer data helpers.
//
// REVAMP v2.0 Step 5: per-customer per-month buckets live under
// `customers/{id}/months/{YYYY-MM}/`. To keep the row/list components
// month-agnostic, we resolve a customer's "viewed" month-of-interest into a
// flat object that shadows the deprecated top-level fields.

import { addMonths, format, parse } from "date-fns";
import type { Customer, MonthData } from "@/types";

/** "YYYY-MM" key for the system clock right now. */
export function currentMonthKey(): string {
  return format(new Date(), "yyyy-MM");
}

/** Convert a YYYY-MM key to a Date object (1st of month, local time). */
export function monthKeyToDate(key: string): Date {
  return parse(`${key}-01`, "yyyy-MM-dd", new Date());
}

/** Shift a YYYY-MM key by N months (positive = forward). */
export function shiftMonthKey(key: string, delta: number): string {
  return format(addMonths(monthKeyToDate(key), delta), "yyyy-MM");
}

/** Human-readable label, e.g. "May 2026". */
export function monthLabel(key: string): string {
  return format(monthKeyToDate(key), "MMMM yyyy");
}

/**
 * The list of fields that live per-month inside `customer.months[YYYY-MM]`.
 * Every other Customer field (name, pipelineType, docType, ownerId, …) is
 * customer-level and persists across months.
 */
export const MONTHLY_FIELDS: ReadonlyArray<keyof MonthData> = [
  "expectedMonthly",
  "actualThisMonth",
  "expectedMonthlyTotal",
  "closeProbability",
  "newStatus",
];

const MONTHLY_FIELD_SET = new Set<string>(MONTHLY_FIELDS);
export function isMonthlyField(field: string): field is keyof MonthData {
  return MONTHLY_FIELD_SET.has(field);
}

/**
 * Read the customer's bucket for `monthKey`, falling back to the deprecated
 * top-level fields when no bucket exists yet (pre-migration records, or
 * customers added before the rep clicked into this month).
 *
 * Existing accounts have a special carry-over: if the rep hasn't entered an
 * `expectedMonthly` for the current month, we surface the most recent prior
 * month's value as the read-only default so the rep doesn't see "0".
 * Editing the field saves to THIS month — never overwriting the prior month.
 */
export function monthDataFor(c: Customer, monthKey: string): MonthData {
  const bucket = c.months?.[monthKey] ?? {};

  // Carry-over for EXISTING accounts: if there's no expectedMonthly in this
  // month yet, fall back to the most recent prior month that has one, then to
  // the legacy top-level value.
  if (bucket.expectedMonthly == null && c.pipelineType === "existing") {
    const prior = mostRecentPriorMonthBucket(c, monthKey, "expectedMonthly");
    if (prior != null) bucket.expectedMonthly = prior;
    else if (c.expectedMonthly != null) bucket.expectedMonthly = c.expectedMonthly;
  }

  // Fill the rest from the deprecated top-level fields only if the bucket is
  // empty AND the month is "current or future" — looking back at older months
  // should NOT inherit values that were written before per-month existed.
  const isCurrentOrFuture = monthKey >= currentMonthKey();
  if (isCurrentOrFuture) {
    if (bucket.actualThisMonth      == null) bucket.actualThisMonth      = c.actualThisMonth;
    if (bucket.expectedMonthlyTotal == null) bucket.expectedMonthlyTotal = c.expectedMonthlyTotal;
    if (bucket.closeProbability     == null) bucket.closeProbability     = c.closeProbability;
    if (bucket.newStatus            == null) bucket.newStatus            = c.newStatus;
  }

  return bucket;
}

/**
 * Look back through prior months for the latest non-null value of `field`.
 * Returns undefined if none of the customer's prior months have it set.
 */
function mostRecentPriorMonthBucket(
  c: Customer,
  thisMonthKey: string,
  field: keyof MonthData
): number | undefined {
  if (!c.months) return undefined;
  const priorKeys = Object.keys(c.months)
    .filter((k) => k < thisMonthKey)
    .sort()
    .reverse();
  for (const k of priorKeys) {
    const v = c.months[k]?.[field];
    if (v != null && typeof v === "number") return v;
  }
  return undefined;
}

/**
 * Return a synthetic Customer where the chosen month's MonthData is spread
 * over the top-level fields. Row components stay month-agnostic — they read
 * `expectedMonthly` etc. as before; the page swaps in this view object.
 */
export function customerViewedAt(c: Customer, monthKey: string): Customer {
  const m = monthDataFor(c, monthKey);
  return {
    ...c,
    expectedMonthly:      m.expectedMonthly,
    actualThisMonth:      m.actualThisMonth,
    expectedMonthlyTotal: m.expectedMonthlyTotal,
    closeProbability:     m.closeProbability,
    newStatus:            m.newStatus,
  };
}

/**
 * Translate a flat field-name into a Firebase multi-path key for `update()`.
 * Monthly fields → `months/{YYYY-MM}/<field>`; everything else stays flat.
 */
export function fieldPathFor(field: string, monthKey: string): string {
  return isMonthlyField(field) ? `months/${monthKey}/${field}` : field;
}

/**
 * Find the most recent month in which this customer's `newStatus` was "closed".
 * Returns null if none exists. Used by the month-rollover converter.
 */
export function mostRecentClosedMonth(c: Customer): string | null {
  if (!c.months) return null;
  let latest: string | null = null;
  for (const [key, bucket] of Object.entries(c.months)) {
    if (bucket?.newStatus === "closed") {
      if (!latest || key > latest) latest = key;
    }
  }
  return latest;
}
