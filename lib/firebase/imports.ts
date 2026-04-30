// lib/firebase/imports.ts — Import batch tracking for forecast_v1/imports/{importBatchId}.

import { ref, push, set, get } from "firebase/database";
import { db } from "./client";
import type { ImportBatch } from "@/types";

const DB_ROOT = "forecast_v1";
const IMPORTS_PATH = `${DB_ROOT}/imports`;

/** Save a completed import batch and return it with its generated id. */
export async function saveImportBatch(
  batch: Omit<ImportBatch, "id">
): Promise<ImportBatch> {
  const newRef = push(ref(db, IMPORTS_PATH));
  await set(newRef, batch);
  return { id: newRef.key!, ...batch };
}

/** One-shot read of all import batches, newest first. */
export async function getImportBatches(): Promise<ImportBatch[]> {
  const snap = await get(ref(db, IMPORTS_PATH));
  if (!snap.exists()) return [];
  const batches: ImportBatch[] = [];
  snap.forEach((child) => {
    const val = child.val();
    // Firebase omits empty arrays — normalise so errors is always an array.
    batches.push({ errors: [], columnMapping: {}, ...val, id: child.key! } as ImportBatch);
  });
  return batches.sort((a, b) => b.importedAt - a.importedAt);
}
