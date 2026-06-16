// lib/forecast/pace.ts — Pure helpers for the rep PaceTracker.
//
// Weekday math + display formatting, separated from the React component so
// the rendering layer stays thin and the logic is easy to reason about /
// reuse / test.

import { eachDayOfInterval, endOfMonth, isWeekend, startOfMonth } from "date-fns";
import { currentMonthKey, monthKeyToDate } from "./monthData";

export interface PaceInputs {
  monthKey: string;               // "YYYY-MM" of the viewed month
  forecast: number | null;        // rep's gut-call forecast for the month
  currentRevenue: number | null;  // rep's running revenue tally
  /** Optional clock override — exposed for tests. Defaults to `new Date()`. */
  now?: Date;
}

export type PaceTone = "neutral" | "good" | "warn" | "bad";

export interface PaceResult {
  /** "X% to forecast with Y working days left" / "…last day" / message. */
  displayText: string;
  /** Colour band for the % text — drives the green/amber/red tint. */
  tone: PaceTone;
  /** Numeric % to forecast (rounded). Null when forecast is 0/blank. */
  actualPct: number | null;
  /** Expected pace based on calendar position (rounded). */
  expectedPct: number;
  /** Remaining weekdays in the month, excluding today. */
  workingDaysLeft: number;
  /** Whether the viewed month is the system clock's current month. */
  isCurrentMonth: boolean;
}

/** Count Mon-Fri days between two dates inclusive (caller passes valid range). */
function countWeekdays(start: Date, end: Date): number {
  if (end < start) return 0;
  return eachDayOfInterval({ start, end }).filter((d) => !isWeekend(d)).length;
}

/**
 * Compute the pace tracker's display state for the inputs.
 *
 * Pace = (currentRevenue / forecast) × 100
 * Expected = (elapsed weekdays / total weekdays in month) × 100
 * Tone:  ≥ expected           → good
 *        within 10 pts below  → warn
 *        more than 10 below   → bad
 *
 * Edge cases handled explicitly per the spec:
 *   - forecast === 0 / null:  "Enter your forecast to track pace" (neutral)
 *   - currentRevenue blank:   shown as 0% (still computes tone)
 *   - last weekday of month:  "last day" instead of "0 working days left"
 *   - viewed month != current:
 *       past   → "month closed"
 *       future → "X% to forecast with Z working days left" (Z = full month)
 */
export function computePace({
  monthKey,
  forecast,
  currentRevenue,
  now = new Date(),
}: PaceInputs): PaceResult {
  const monthDate = monthKeyToDate(monthKey);
  const monthStart = startOfMonth(monthDate);
  const monthEnd   = endOfMonth(monthDate);

  const totalWeekdays = countWeekdays(monthStart, monthEnd);

  const todayMonthKey = currentMonthKey();
  const isCurrentMonth = monthKey === todayMonthKey;
  const isPastMonth    = monthKey < todayMonthKey;

  // Elapsed weekdays counts today as elapsed (today IS already happening,
  // even if it isn't "done" — that matches Spencer's mental model of pace).
  // Working days left = weekdays strictly AFTER today through month end.
  let elapsedWeekdays: number;
  let workingDaysLeft: number;
  if (isCurrentMonth) {
    elapsedWeekdays = countWeekdays(monthStart, now);
    // strictly-after-today: start the range from tomorrow.
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    workingDaysLeft = countWeekdays(tomorrow, monthEnd);
  } else if (isPastMonth) {
    elapsedWeekdays = totalWeekdays;
    workingDaysLeft = 0;
  } else {
    // Future month — nothing elapsed yet.
    elapsedWeekdays = 0;
    workingDaysLeft = totalWeekdays;
  }

  const expectedPct = totalWeekdays > 0
    ? Math.round((elapsedWeekdays / totalWeekdays) * 100)
    : 0;

  // No forecast set — short-circuit with the prompt and neutral tone.
  if (forecast == null || forecast <= 0) {
    return {
      displayText: "Enter your forecast to track pace",
      tone: "neutral",
      actualPct: null,
      expectedPct,
      workingDaysLeft,
      isCurrentMonth,
    };
  }

  const actualPctRaw = ((currentRevenue ?? 0) / forecast) * 100;
  const actualPct    = Math.round(actualPctRaw);

  let tone: PaceTone;
  if (actualPctRaw >= expectedPct)            tone = "good";
  else if (actualPctRaw >= expectedPct - 10)  tone = "warn";
  else                                        tone = "bad";

  let suffix: string;
  if (isPastMonth) {
    suffix = "month closed";
  } else if (isCurrentMonth && workingDaysLeft === 0) {
    suffix = "last day";
  } else {
    suffix = `${workingDaysLeft} working day${workingDaysLeft === 1 ? "" : "s"} left`;
  }

  return {
    displayText: `${actualPct}% to forecast — ${suffix}`,
    tone,
    actualPct,
    expectedPct,
    workingDaysLeft,
    isCurrentMonth,
  };
}
