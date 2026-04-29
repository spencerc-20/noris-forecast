// lib/import/importPipeline.ts — Full CSV import pipeline: parse → validate → match/create → enrich → batch track.
// runImport: Sheet1 revenue data for a single rep.
// runBulkImport: Sheet1 auto-assigns each row to a rep based on state→repId map.
// runSheet2Import: Sheet2 product data — updates customer profiles only.
// runBulkSheet2Import: Sheet2 auto-assigns profile updates by state→repId map.

import { parseCsv } from "./csvParser";
import { parseSheet2 } from "./sheet2Parser";
import { validateRows } from "./csvValidator";
import { getCustomersForUser, createCustomer, updateCustomer } from "@/lib/firebase/customers";
import { saveImportBatch } from "@/lib/firebase/imports";
import { getStateToRepMap } from "@/lib/firebase/config";
import { regionForState } from "@/lib/forecast/regionConfig";
import { computeCommissionStatus } from "@/lib/forecast/commissionStatus";
import { higherProfile } from "@/lib/forecast/customerProfile";
import type { Customer, ImportBatch, ImportError, LifecycleStatus } from "@/types";

export interface ImportRunResult {
  batch: ImportBatch;
  created: number;
  updated: number;
}

/**
 * Determine lifecycle status from annualRevenue for import.
 * Does NOT demote "lost" or "existing" customers already in the system.
 */
function classifyLifecycleFromRevenue(
  currentStatus: LifecycleStatus,
  annualRevenue: Record<number, number>,
  currentYear: number
): LifecycleStatus {
  if (currentStatus === "lost") return "lost";

  // Treat any non-zero value (including negative returns) as activity
  const hasCurrentYear = (annualRevenue[currentYear] ?? 0) !== 0;
  const hasPriorYear = Object.entries(annualRevenue).some(
    ([yr, val]) => parseInt(yr, 10) < currentYear && val !== 0
  );

  if (hasCurrentYear) return "existing";
  if (hasPriorYear) {
    if (currentStatus === "existing") return "existing";
    return "inactive";
  }
  return currentStatus;
}

/**
 * Sheet1 import: revenue by year.
 * Creates or updates customers; merges annualRevenue; computes commissionStatus; classifies lifecycle.
 */
export async function runImport(
  csvText: string,
  filename: string,
  ownerId: string,
  adminUserId: string
): Promise<ImportRunResult> {
  const currentYear = new Date().getFullYear();

  const { rows, columnMapping } = parseCsv(csvText);
  const { errors, validRows } = validateRows(rows);

  const existingCustomers = await getCustomersForUser(ownerId);
  const byNameLower = new Map<string, Customer>(
    existingCustomers.map((c) => [c.name.toLowerCase(), c])
  );

  let created = 0;
  let updated = 0;
  const rowErrors: ImportError[] = [...errors];

  for (const row of validRows) {
    const nameLower = row.customerName.trim().toLowerCase();
    const existing = byNameLower.get(nameLower);
    const region = regionForState(row.state.toUpperCase()) ?? "Unassigned";

    const mergedRevenue = { ...(existing?.annualRevenue ?? {}) };
    for (const [yr, val] of Object.entries(row.annualRevenue)) {
      mergedRevenue[parseInt(yr, 10)] = val;
    }

    const mergedSource = { ...(existing?.revenueDataSource ?? {}) };
    for (const yr of Object.keys(row.annualRevenue)) {
      mergedSource[parseInt(yr, 10)] = "csv_import";
    }

    const revenueYears = Object.keys(mergedRevenue).map(Number);
    const commissionYears = [
      ...new Set(revenueYears.flatMap((y) => [y - 1, y, y + 1])),
    ].filter((y) => y >= 2020);
    const newCommissionStatus = computeCommissionStatus(commissionYears, mergedRevenue, []);
    const mergedCommission = { ...(existing?.commissionStatus ?? {}), ...newCommissionStatus };

    try {
      if (existing) {
        const newLifecycle = classifyLifecycleFromRevenue(
          existing.lifecycleStatus,
          mergedRevenue,
          currentYear
        );
        await updateCustomer(
          existing.id,
          {
            annualRevenue: mergedRevenue,
            revenueDataSource: mergedSource,
            commissionStatus: mergedCommission,
            lifecycleStatus: newLifecycle,
            region: existing.region || region,
            ...(existing.practiceName ? {} : row.practiceName ? { practiceName: row.practiceName } : {}),
            ...(existing.phone ? {} : row.phone ? { phone: row.phone } : {}),
            ...(existing.email ? {} : row.email ? { email: row.email } : {}),
            ...(existing.state ? {} : { state: row.state.toUpperCase() }),
          },
          adminUserId,
          existing
        );
        updated++;
      } else {
        const newLifecycle = classifyLifecycleFromRevenue("potential", mergedRevenue, currentYear);
        await createCustomer(
          {
            name: row.customerName.trim(),
            practiceName: row.practiceName ?? "",
            address: row.address ?? "",
            state: row.state.toUpperCase(),
            phone: row.phone ?? "",
            email: row.email ?? "",
            lifecycleStatus: newLifecycle,
            leadTemperature: "cold",
            temperatureUpdatedAt: Date.now(),
            ownerId,
            region,
            currentSystems: row.currentSystems ?? "",
            norisImplantUse: row.norisImplantUse ?? "",
            primaryPainPoint: row.primaryPainPoint ?? "",
            notes: row.notes ?? "",
            annualRevenue: mergedRevenue,
            revenueDataSource: mergedSource,
            firstOrderDate: null,
            lastOrderDate: null,
            orderCadenceDays: null,
            lostReason: null,
            lostCompetitor: null,
            lostDate: null,
            lostDealValue: null,
            winBackQueueDate: null,
            importBatchId: null,
            createdBy: adminUserId,
          },
          adminUserId
        );
        created++;
      }
    } catch (err) {
      rowErrors.push({
        rowIndex: row.rowIndex,
        field: null,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const batch = await saveImportBatch({
    importedAt: Date.now(),
    importedBy: adminUserId,
    filename,
    rowCount: rows.length,
    successCount: created + updated,
    errorCount: rowErrors.length,
    errors: rowErrors,
    columnMapping,
  });

  return { batch, created, updated };
}

export interface Sheet2RunResult {
  updated: number;
  skipped: number;
  batch: ImportBatch;
}

/**
 * Sheet2 import: product family breakdown → update customer profiles.
 * Profiles never demote (uses higherProfile). Only updates existing customers in the system.
 */
export async function runSheet2Import(
  csvText: string,
  filename: string,
  ownerId: string,
  adminUserId: string
): Promise<Sheet2RunResult> {
  const summaries = parseSheet2(csvText);

  const existingCustomers = await getCustomersForUser(ownerId);
  const byNameLower = new Map<string, Customer>(
    existingCustomers.map((c) => [c.name.toLowerCase(), c])
  );

  let updated = 0;
  let skipped = 0;

  for (const summary of summaries) {
    // Try exact match first, then strip practice suffix
    const nameLower = summary.customerName.toLowerCase();
    const existing =
      byNameLower.get(nameLower) ??
      // Fallback: try matching just the portion before " - "
      byNameLower.get(nameLower.split(" - ")[0].trim());

    if (!existing) {
      skipped++;
      continue;
    }

    const newProfile = higherProfile(summary.profile, existing.profile);
    if (newProfile === existing.profile) continue;

    await updateCustomer(
      existing.id,
      { profile: newProfile, profileUpdatedAt: Date.now() },
      adminUserId,
      existing
    );
    updated++;
  }

  const batch = await saveImportBatch({
    importedAt: Date.now(),
    importedBy: adminUserId,
    filename,
    rowCount: summaries.length,
    successCount: updated,
    errorCount: skipped,
    errors: [],
    columnMapping: { Customer: "customerName", "Product Family": "profile" },
  });

  return { updated, skipped, batch };
}

// ---------------------------------------------------------------------------
// Bulk import — auto-assign rows to reps by state→repId map
// ---------------------------------------------------------------------------

export interface BulkRepSummary {
  repId: string;
  rowCount: number;
}

export interface BulkPreview {
  totalRows: number;
  validRows: number;
  skippedRows: number; // validation errors + unmapped states
  repBreakdown: BulkRepSummary[];
  unmappedStates: string[]; // states with no rep assigned
}

/**
 * Preview a bulk import: parse + validate, return per-rep breakdown without writing anything.
 */
export async function previewBulkImport(csvText: string): Promise<BulkPreview> {
  const { rows } = parseCsv(csvText);
  const { validRows, invalidRowIndices } = await Promise.resolve(validateRows(rows));
  const stateToRep = await getStateToRepMap();

  const repCounts: Record<string, number> = {};
  const unmappedStates = new Set<string>();

  for (const row of validRows) {
    const state = row.state.toUpperCase();
    const repId = stateToRep[state];
    if (!repId) {
      unmappedStates.add(state);
    } else {
      repCounts[repId] = (repCounts[repId] ?? 0) + 1;
    }
  }

  return {
    totalRows: rows.length,
    validRows: validRows.length,
    skippedRows: invalidRowIndices.size + unmappedStates.size,
    repBreakdown: Object.entries(repCounts).map(([repId, rowCount]) => ({ repId, rowCount })),
    unmappedStates: [...unmappedStates].sort(),
  };
}

export interface BulkImportResult {
  totalCreated: number;
  totalUpdated: number;
  totalErrors: number;
  repResults: Array<{ repId: string; created: number; updated: number }>;
}

/**
 * Sheet1 bulk import: reads stateToRepMap, distributes rows to their rep, runs import per rep.
 */
export async function runBulkImport(
  csvText: string,
  filename: string,
  adminUserId: string
): Promise<BulkImportResult> {
  const currentYear = new Date().getFullYear();
  const { rows, columnMapping } = parseCsv(csvText);
  const { validRows, errors: validationErrors } = validateRows(rows);
  const stateToRep = await getStateToRepMap();

  // Group valid rows by repId
  const rowsByRep: Record<string, typeof validRows> = {};
  for (const row of validRows) {
    const repId = stateToRep[row.state.toUpperCase()];
    if (!repId) continue; // unmapped state — skip silently
    if (!rowsByRep[repId]) rowsByRep[repId] = [];
    rowsByRep[repId].push(row);
  }

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalErrors = validationErrors.length;
  const repResults: BulkImportResult["repResults"] = [];

  // Run per-rep import
  for (const [repId, repRows] of Object.entries(rowsByRep)) {
    const existingCustomers = await getCustomersForUser(repId);
    const byNameLower = new Map<string, Customer>(
      existingCustomers.map((c) => [c.name.toLowerCase(), c])
    );

    let created = 0;
    let updated = 0;
    const rowErrors: ImportError[] = [];

    for (const row of repRows) {
      const nameLower = row.customerName.trim().toLowerCase();
      const existing = byNameLower.get(nameLower);
      const region = regionForState(row.state.toUpperCase()) ?? "Unassigned";

      const mergedRevenue = { ...(existing?.annualRevenue ?? {}) };
      for (const [yr, val] of Object.entries(row.annualRevenue)) {
        mergedRevenue[parseInt(yr, 10)] = val;
      }
      const mergedSource = { ...(existing?.revenueDataSource ?? {}) };
      for (const yr of Object.keys(row.annualRevenue)) {
        mergedSource[parseInt(yr, 10)] = "csv_import";
      }

      const revenueYears = Object.keys(mergedRevenue).map(Number);
      const commissionYears = [...new Set(revenueYears.flatMap((y) => [y - 1, y, y + 1]))].filter((y) => y >= 2020);
      const newCommissionStatus = computeCommissionStatus(commissionYears, mergedRevenue, []);
      const mergedCommission = { ...(existing?.commissionStatus ?? {}), ...newCommissionStatus };

      try {
        if (existing) {
          const newLifecycle = classifyLifecycleFromRevenue(existing.lifecycleStatus, mergedRevenue, currentYear);
          await updateCustomer(
            existing.id,
            {
              annualRevenue: mergedRevenue,
              revenueDataSource: mergedSource,
              commissionStatus: mergedCommission,
              lifecycleStatus: newLifecycle,
              region: existing.region || region,
              ...(existing.practiceName ? {} : row.practiceName ? { practiceName: row.practiceName } : {}),
              ...(existing.state ? {} : { state: row.state.toUpperCase() }),
            },
            adminUserId,
            existing
          );
          updated++;
        } else {
          const newLifecycle = classifyLifecycleFromRevenue("potential", mergedRevenue, currentYear);
          await createCustomer(
            {
              name: row.customerName.trim(),
              practiceName: row.practiceName ?? "",
              address: row.address ?? "",
              state: row.state.toUpperCase(),
              phone: row.phone ?? "",
              email: row.email ?? "",
              lifecycleStatus: newLifecycle,
              leadTemperature: "cold",
              temperatureUpdatedAt: Date.now(),
              ownerId: repId,
              region,
              currentSystems: row.currentSystems ?? "",
              norisImplantUse: row.norisImplantUse ?? "",
              primaryPainPoint: row.primaryPainPoint ?? "",
              notes: row.notes ?? "",
              annualRevenue: mergedRevenue,
              revenueDataSource: mergedSource,
              firstOrderDate: null,
              lastOrderDate: null,
              orderCadenceDays: null,
              lostReason: null,
              lostCompetitor: null,
              lostDate: null,
              lostDealValue: null,
              winBackQueueDate: null,
              importBatchId: null,
              createdBy: adminUserId,
            },
            adminUserId
          );
          created++;
        }
      } catch (err) {
        rowErrors.push({ rowIndex: row.rowIndex, field: null, message: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    totalCreated += created;
    totalUpdated += updated;
    totalErrors += rowErrors.length;
    repResults.push({ repId, created, updated });
  }

  // Save one batch record for the whole bulk run
  await saveImportBatch({
    importedAt: Date.now(),
    importedBy: adminUserId,
    filename: `[BULK] ${filename}`,
    rowCount: rows.length,
    successCount: totalCreated + totalUpdated,
    errorCount: totalErrors,
    errors: validationErrors,
    columnMapping,
  });

  return { totalCreated, totalUpdated, totalErrors, repResults };
}

/**
 * Sheet2 bulk import: auto-assigns profile updates by state→repId map.
 */
export async function runBulkSheet2Import(
  csvText: string,
  filename: string,
  adminUserId: string
): Promise<{ updated: number; skipped: number }> {
  const summaries = parseSheet2(csvText);
  const stateToRep = await getStateToRepMap();

  // Group summaries by repId via state
  const byRep: Record<string, typeof summaries> = {};
  for (const s of summaries) {
    const repId = stateToRep[s.state];
    if (!repId) continue;
    if (!byRep[repId]) byRep[repId] = [];
    byRep[repId].push(s);
  }

  let updated = 0;
  let skipped = 0;

  for (const [repId, repSummaries] of Object.entries(byRep)) {
    const existingCustomers = await getCustomersForUser(repId);
    const byNameLower = new Map<string, Customer>(
      existingCustomers.map((c) => [c.name.toLowerCase(), c])
    );

    for (const summary of repSummaries) {
      const nameLower = summary.customerName.toLowerCase();
      const existing = byNameLower.get(nameLower) ?? byNameLower.get(nameLower.split(" - ")[0].trim());
      if (!existing) { skipped++; continue; }

      const newProfile = higherProfile(summary.profile, existing.profile);
      if (newProfile === existing.profile) continue;

      await updateCustomer(existing.id, { profile: newProfile, profileUpdatedAt: Date.now() }, adminUserId, existing);
      updated++;
    }
  }

  await saveImportBatch({
    importedAt: Date.now(),
    importedBy: adminUserId,
    filename: `[BULK] ${filename}`,
    rowCount: summaries.length,
    successCount: updated,
    errorCount: skipped,
    errors: [],
    columnMapping: { Customer: "customerName", "Product Family": "profile" },
  });

  return { updated, skipped };
}
