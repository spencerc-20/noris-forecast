// lib/forecast/exportTriggers.ts — onClick handlers for the export buttons.
//
// Why this file exists: the prior two attempts at this feature broke the
// /region page because the export trigger used React state (useState for
// "exporting"). We are required to ship this with ZERO new hooks in the
// /region or /team components (or anything they render). These handlers
// satisfy that by managing the button's "Exporting…" affordance via direct
// DOM mutation on the button element itself — no useState, no useRef, no
// useCallback. The handlers are plain async functions that take the
// already-in-scope data + the button element as arguments.

import type { AppUser, Customer } from "@/types";
import { getAllRepForecastsForMonth } from "@/lib/firebase/repForecasts";
import { buildPipelineCsv, csvFilenameFor, downloadCsv } from "./csvExport";
import { buildPipelineXlsx, downloadXlsx, xlsxFilenameFor } from "./xlsxExport";

interface CommonInputs {
  btn: HTMLButtonElement;        // the button that was clicked
  monthKey: string;
  customers: Customer[];         // already inPipeline + viewed-at-month
  usersById: Map<string, AppUser>;
}

/** Wrap the export with a guarded button-state mutation. */
async function runWithButtonState(
  btn: HTMLButtonElement,
  busyLabel: string,
  work: () => Promise<void>
): Promise<void> {
  if (btn.disabled) return;  // ignore double-clicks
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = busyLabel;
  try {
    await work();
  } catch (err) {
    console.error("Export failed:", err);
    // No user-facing toast yet — surface in console only. The button resets
    // so the rep can retry.
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

/**
 * Admin export — multi-tab XLSX, one tab per region + Summary.
 * Fired from /region's "Export Excel" button.
 */
export async function exportFullOrgXlsx({
  btn,
  monthKey,
  customers,
  usersById,
}: CommonInputs): Promise<void> {
  await runWithButtonState(btn, "Exporting…", async () => {
    const repForecasts = await getAllRepForecastsForMonth(monthKey);
    const xlsx = await buildPipelineXlsx({
      monthKey,
      customers,
      usersById,
      repForecasts,
    });
    downloadXlsx(xlsxFilenameFor(monthKey), xlsx);
  });
}

/**
 * Manager export — single-region CSV.
 * Fired from /team's "Export CSV" button. Filename suffixed with region so
 * manager exports don't collide with admin's org-wide file in a downloads folder.
 */
export async function exportRegionCsv({
  btn,
  monthKey,
  customers,
  usersById,
  regionLabel,
}: CommonInputs & { regionLabel: string }): Promise<void> {
  await runWithButtonState(btn, "Exporting…", async () => {
    const repForecasts = await getAllRepForecastsForMonth(monthKey);
    const csv = buildPipelineCsv({
      monthKey,
      customers,
      usersById,
      repForecasts,
    });
    const safeRegion = regionLabel.replace(/[^A-Za-z0-9._-]+/g, "_");
    downloadCsv(csvFilenameFor(monthKey, safeRegion), csv);
  });
}
