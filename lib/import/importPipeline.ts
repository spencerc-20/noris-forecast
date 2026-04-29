// lib/import/importPipeline.ts — Full CSV import pipeline: parse → validate → match/create → enrich → batch track.
// runImport: Sheet1 revenue data for a single rep.
// runBulkImport: Sheet1 auto-assigns each row to a rep based on state→repId map.
// runSheet2Import: Sheet2 product data — updates customer profiles only.
// runBulkSheet2Import: Sheet2 auto-assigns profile updates by state→repId map.

import { ref, update, push } from "firebase/database";
import { db } from "@/lib/firebase/client";
import { parseCsv } from "./csvParser";
import { parseSheet2 } from "./sheet2Parser";
import { validateRows } from "./csvValidator";
import { getCustomersForUser, createCustomer, updateCustomer } from "@/lib/firebase/customers";
import { saveImportBatch } from "@/lib/firebase/imports";
import { getTerritories } from "@/lib/firebase/config";
import { regionForState } from "@/lib/forecast/regionConfig";
import type { TerritoryEntry } from "@/types";
import { computeCommissionStatus } from "@/lib/forecast/commissionStatus";
import { higherProfile } from "@/lib/forecast/customerProfile";
import type { Customer, ImportBatch, ImportError, LifecycleStatus } from "@/types";

/** Firebase root — matches the DB root used across all lib/firebase/* files. */
const DB_ROOT = "forecast_v1";

/** Records written per Firebase multi-path update call in bulk import. */
const BULK_BATCH_SIZE = 50;

export interface ImportRunResult {
  batch: ImportBatch;
  created: number;
  updated: number;
}

/**
 * Derives a state→repId map from territories for bulk import.
 * A state is "clean" if there is exactly one distinct non-null repId AND no open (null) entries.
 * All other states are flagged as ambiguous and excluded from auto-assignment.
 */
function buildStateToRepMap(territories: TerritoryEntry[]): {
  stateToRep: Record<string, string>;
  ambiguousStates: string[];
} {
  // Group by stateCode
  const byState: Record<string, TerritoryEntry[]> = {};
  for (const t of territories) {
    if (!t.stateCode) continue;
    const sc = t.stateCode.toUpperCase();
    if (!byState[sc]) byState[sc] = [];
    byState[sc].push(t);
  }

  const stateToRep: Record<string, string> = {};
  const ambiguousStates: string[] = [];

  for (const [state, entries] of Object.entries(byState)) {
    const nonNullIds = [...new Set(entries.filter((e) => e.repId).map((e) => e.repId!))];
    const hasOpen = entries.some((e) => !e.repId);

    if (nonNullIds.length === 1 && !hasOpen) {
      // Exactly one rep, no open slots → clean assignment
      stateToRep[state] = nonNullIds[0];
    } else if (nonNullIds.length > 0 || hasOpen) {
      // Multiple reps OR mixed non-null + open → needs manual assignment
      ambiguousStates.push(state);
    }
    // If nonNullIds.length === 0 && !hasOpen: no territories for this state → unmapped
  }

  return { stateToRep, ambiguousStates: ambiguousStates.sort() };
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
  skippedRows: number;       // validation errors + unmapped + ambiguous states
  repBreakdown: BulkRepSummary[];
  unmappedStates: string[];  // states that have no territory entries at all
  ambiguousStates: string[]; // states with multiple reps or open slots — needs manual assignment
}

/**
 * Preview a bulk import: parse + validate, return per-rep breakdown without writing anything.
 */
export async function previewBulkImport(csvText: string): Promise<BulkPreview> {
  const { rows } = parseCsv(csvText);
  const { validRows, invalidRowIndices } = await Promise.resolve(validateRows(rows));
  const territories = await getTerritories();
  const { stateToRep, ambiguousStates } = buildStateToRepMap(territories);

  const repCounts: Record<string, number> = {};
  const unmappedStates = new Set<string>();
  const ambiguousSet = new Set(ambiguousStates);

  for (const row of validRows) {
    const state = row.state.toUpperCase();
    if (ambiguousSet.has(state)) continue; // flagged ambiguous — excluded from auto-assign
    const repId = stateToRep[state];
    if (!repId) {
      unmappedStates.add(state);
    } else {
      repCounts[repId] = (repCounts[repId] ?? 0) + 1;
    }
  }

  const skipped = invalidRowIndices.size + unmappedStates.size + ambiguousSet.size;

  return {
    totalRows: rows.length,
    validRows: validRows.length,
    skippedRows: skipped,
    repBreakdown: Object.entries(repCounts).map(([repId, rowCount]) => ({ repId, rowCount })),
    unmappedStates: [...unmappedStates].sort(),
    ambiguousStates,
  };
}

export interface BulkImportResult {
  totalCreated: number;
  totalUpdated: number;
  totalErrors: number;
  repResults: Array<{ repId: string; created: number; updated: number }>;
}

/**
 * Sheet1 bulk import — two-phase approach to avoid per-record Firebase round-trips:
 *
 * Phase 1 (reads): Parse, validate, match each row against existing customers per rep.
 *   Builds a list of pending payloads — no writes yet.
 *
 * Phase 2 (writes): Flush pending records in BULK_BATCH_SIZE multi-path update() calls.
 *   Each call writes up to 50 records in a single Firebase round-trip (~100ms vs ~3s
 *   for 50 sequential set() calls). Calls onProgress after every batch.
 *
 * This is ~40× faster than the old per-record approach for a 2120-row import.
 * Per-record logEdit() is intentionally skipped; the import batch record is the audit trail.
 */
export async function runBulkImport(
  csvText: string,
  filename: string,
  adminUserId: string,
  onProgress?: (written: number, total: number) => void
): Promise<BulkImportResult> {
  const currentYear = new Date().getFullYear();
  const { rows, columnMapping } = parseCsv(csvText);
  const { validRows, errors: validationErrors } = validateRows(rows);
  const territories = await getTerritories();
  const { stateToRep } = buildStateToRepMap(territories);

  // Group valid rows by repId (ambiguous / unmapped states are silently excluded —
  // they show up as skipped in the preview and must be imported manually)
  const rowsByRep: Record<string, typeof validRows> = {};
  for (const row of validRows) {
    const repId = stateToRep[row.state.toUpperCase()];
    if (!repId) continue;
    if (!rowsByRep[repId]) rowsByRep[repId] = [];
    rowsByRep[repId].push(row);
  }

  // ── Phase 1: prepare all write payloads (no Firebase writes yet) ──────────

  interface PendingRecord {
    key: string;
    isNew: boolean;
    repId: string;
    payload: Record<string, unknown>;
  }

  const pending: PendingRecord[] = [];
  const perRepCounts: Record<string, { created: number; updated: number }> = {};

  for (const [repId, repRows] of Object.entries(rowsByRep)) {
    const existingCustomers = await getCustomersForUser(repId);
    const byNameLower = new Map<string, Customer>(
      existingCustomers.map((c) => [c.name.toLowerCase(), c])
    );
    perRepCounts[repId] = { created: 0, updated: 0 };

    for (const row of repRows) {
      const nameLower = row.customerName.trim().toLowerCase();
      const existing = byNameLower.get(nameLower);
      const region = regionForState(row.state.toUpperCase()) ?? "Unassigned";

      // Merge revenue + commission status
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

      if (existing) {
        const newLifecycle = classifyLifecycleFromRevenue(existing.lifecycleStatus, mergedRevenue, currentYear);
        pending.push({
          key: existing.id,
          isNew: false,
          repId,
          payload: {
            annualRevenue: mergedRevenue,
            revenueDataSource: mergedSource,
            commissionStatus: mergedCommission,
            lifecycleStatus: newLifecycle,
            region: existing.region || region,
            ...(existing.practiceName ? {} : row.practiceName ? { practiceName: row.practiceName } : {}),
            ...(existing.state ? {} : { state: row.state.toUpperCase() }),
          },
        });
        perRepCounts[repId].updated++;
      } else {
        // Generate a push key client-side — no network call needed
        const newKey = push(ref(db, `${DB_ROOT}/customers`)).key!;
        const now = Date.now();
        const newLifecycle = classifyLifecycleFromRevenue("potential", mergedRevenue, currentYear);
        pending.push({
          key: newKey,
          isNew: true,
          repId,
          payload: {
            name: row.customerName.trim(),
            practiceName: row.practiceName ?? "",
            address: row.address ?? "",
            state: row.state.toUpperCase(),
            phone: row.phone ?? "",
            email: row.email ?? "",
            lifecycleStatus: newLifecycle,
            leadTemperature: "cold",
            temperatureUpdatedAt: now,
            ownerId: repId,
            region,
            currentSystems: row.currentSystems ?? "",
            norisImplantUse: row.norisImplantUse ?? "",
            primaryPainPoint: row.primaryPainPoint ?? "",
            notes: row.notes ?? "",
            annualRevenue: mergedRevenue,
            revenueDataSource: mergedSource,
            commissionStatus: mergedCommission,
            profile: "new",
            profileUpdatedAt: now,
            lastMeetingDate: null,
            nextMeetingDate: null,
            firstOrderDate: null,
            lastOrderDate: null,
            orderCadenceDays: null,
            lostReason: null,
            lostCompetitor: null,
            lostDate: null,
            lostDealValue: null,
            winBackQueueDate: null,
            importBatchId: null,
            createdAt: now,
            createdBy: adminUserId,
          },
        });
        perRepCounts[repId].created++;
      }
    }
  }

  // ── Phase 2: write in batches of BULK_BATCH_SIZE ──────────────────────────

  const total = pending.length;
  let written = 0;
  const batchErrors: string[] = [];

  for (let i = 0; i < pending.length; i += BULK_BATCH_SIZE) {
    const chunk = pending.slice(i, i + BULK_BATCH_SIZE);
    const multiPath: Record<string, unknown> = {};

    for (const record of chunk) {
      if (record.isNew) {
        // New record: write full object at customers/{key}
        multiPath[`customers/${record.key}`] = record.payload;
      } else {
        // Existing record: write only changed fields (merge semantics)
        for (const [field, value] of Object.entries(record.payload)) {
          multiPath[`customers/${record.key}/${field}`] = value;
        }
      }
    }

    try {
      await update(ref(db, DB_ROOT), multiPath);
      written += chunk.length;
    } catch (err) {
      const batchNum = Math.floor(i / BULK_BATCH_SIZE) + 1;
      batchErrors.push(
        `Batch ${batchNum} (rows ${i + 1}–${i + chunk.length}): ${
          err instanceof Error ? err.message : "Write failed"
        }`
      );
      // Do not increment written — these records were not saved
    }

    onProgress?.(written, total);
  }

  // ── Phase 3: save import batch record ────────────────────────────────────

  const totalCreated = Object.values(perRepCounts).reduce((s, c) => s + c.created, 0);
  const totalUpdated = Object.values(perRepCounts).reduce((s, c) => s + c.updated, 0);
  const totalErrors = validationErrors.length + (total - written);

  await saveImportBatch({
    importedAt: Date.now(),
    importedBy: adminUserId,
    filename: `[BULK] ${filename}`,
    rowCount: rows.length,
    successCount: written,
    errorCount: totalErrors,
    errors: [
      ...validationErrors,
      ...batchErrors.map((msg) => ({ rowIndex: -1, field: null as null, message: msg })),
    ],
    columnMapping,
  });

  // Surface any batch write errors — these were previously silent
  if (batchErrors.length > 0) {
    throw new Error(
      `${batchErrors.length} batch(es) failed — ${total - written} records not written.\n` +
      batchErrors.slice(0, 3).join("\n")
    );
  }

  return {
    totalCreated,
    totalUpdated,
    totalErrors,
    repResults: Object.entries(perRepCounts).map(([repId, counts]) => ({
      repId,
      ...counts,
    })),
  };
}

/**
 * Sheet2 bulk import: auto-assigns profile updates by territory-derived state→rep map.
 * Ambiguous states (VA, CA, TX) are skipped.
 */
export async function runBulkSheet2Import(
  csvText: string,
  filename: string,
  adminUserId: string
): Promise<{ updated: number; skipped: number }> {
  const summaries = parseSheet2(csvText);
  const territories = await getTerritories();
  const { stateToRep } = buildStateToRepMap(territories);

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
