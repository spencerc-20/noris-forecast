// components/admin/CsvImporter.tsx — CSV import UI: drop zone → preview → run → results.
// Modes: single-rep (admin picks one rep) or bulk (auto-assign by state→rep map).
// Auto-detects Sheet1 (revenue by year) vs Sheet2 (product families → profile update).

"use client";

import { useRef, useState } from "react";
import { format } from "date-fns";
import { parseCsv } from "@/lib/import/csvParser";
import { validateRows } from "@/lib/import/csvValidator";
import { parseSheet2 } from "@/lib/import/sheet2Parser";
import {
  runImport,
  runBulkImport,
  previewBulkImport,
  runSheet2Import,
  runBulkSheet2Import,
  type BulkPreview,
} from "@/lib/import/importPipeline";
import { useAuth } from "@/lib/firebase/auth";
import { getAllUsers } from "@/lib/firebase/users";
import { Button } from "@/components/ui/button";
import type { AppUser } from "@/types";
import type { ImportError } from "@/types";

type Step = "idle" | "preview" | "running" | "done";
type FileFormat = "sheet1" | "sheet2" | "generic";
type ImportMode = "single" | "bulk";

interface PreviewData {
  filename: string;
  csvText: string;
  format: FileFormat;
  // Sheet1/generic
  rowCount?: number;
  validCount?: number;
  errors?: ImportError[];
  revenueYears?: number[];
  // Sheet2
  customerCount?: number;
  profileBreakdown?: Record<string, number>;
  // Bulk-specific
  bulkPreview?: BulkPreview;
  repNameMap?: Record<string, string>; // repId → name
}

interface DoneData {
  created?: number;
  updated: number;
  skipped?: number;
  errorCount: number;
  format: FileFormat;
  mode: ImportMode;
}

const FORMAT_LABELS: Record<FileFormat, string> = {
  sheet1: "Revenue history (Sheet 1)",
  sheet2: "Product breakdown (Sheet 2)",
  generic: "Revenue history",
};

export function CsvImporter() {
  const { appUser } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>("bulk");
  const [step, setStep] = useState<Step>("idle");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [done, setDone] = useState<DoneData | null>(null);
  const [targetRep, setTargetRep] = useState<AppUser | null>(null);
  const [reps, setReps] = useState<AppUser[]>([]);
  const [repsLoaded, setRepsLoaded] = useState(false);
  const [runError, setRunError] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  async function loadReps(): Promise<AppUser[]> {
    if (repsLoaded) return reps;
    const all = await getAllUsers();
    const repList = all.filter((u) => u.role === "rep");
    setReps(repList);
    setRepsLoaded(true);
    return repList;
  }

  async function handleFile(file: File) {
    const text = await file.text();
    const firstLine = text.split("\n")[0] ?? "";
    const isSheet2 = firstLine.toLowerCase().includes("product family");

    if (isSheet2) {
      const summaries = parseSheet2(text);
      const profileBreakdown: Record<string, number> = {};
      for (const s of summaries) {
        profileBreakdown[s.profile] = (profileBreakdown[s.profile] ?? 0) + 1;
      }

      let bulkPreview: BulkPreview | undefined;
      let repNameMap: Record<string, string> | undefined;
      if (mode === "bulk") {
        const allReps = await loadReps();
        repNameMap = Object.fromEntries(allReps.map((r) => [r.id, r.name]));
        // For sheet2 bulk we don't have a separate preview fn — just show customer count
      } else {
        await loadReps();
      }

      setPreview({ filename: file.name, csvText: text, format: "sheet2", customerCount: summaries.length, profileBreakdown, bulkPreview, repNameMap });
    } else {
      const { rows, rawColumnNames, detectedFormat } = parseCsv(text);
      const { errors, validRows } = validateRows(rows);

      // Detect revenue years from column names
      const revenueYears = [
        ...new Set(
          rawColumnNames
            .map((c) => c.match(/(\d{4})/)?.[1])
            .filter((y): y is string => !!y)
            .map(Number)
            .filter((y) => y >= 2000 && y <= 2100)
        ),
      ].sort();

      let bulkPreview: BulkPreview | undefined;
      let repNameMap: Record<string, string> | undefined;

      if (mode === "bulk") {
        const allReps = await loadReps();
        repNameMap = Object.fromEntries(allReps.map((r) => [r.id, r.name]));
        bulkPreview = await previewBulkImport(text);
      } else {
        await loadReps();
      }

      setPreview({ filename: file.name, csvText: text, format: detectedFormat, rowCount: rows.length, validCount: validRows.length, errors, revenueYears, bulkPreview, repNameMap });
    }

    setStep("preview");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith(".csv")) handleFile(file);
  }

  async function handleRun() {
    if (!preview || !appUser) return;
    if (mode === "single" && !targetRep) return;

    setStep("running");
    setRunError("");

    try {
      if (mode === "bulk") {
        if (preview.format === "sheet2") {
          const result = await runBulkSheet2Import(preview.csvText, preview.filename, appUser.id);
          setDone({ updated: result.updated, skipped: result.skipped, errorCount: 0, format: "sheet2", mode: "bulk" });
        } else {
          const result = await runBulkImport(preview.csvText, preview.filename, appUser.id);
          setDone({ created: result.totalCreated, updated: result.totalUpdated, errorCount: result.totalErrors, format: preview.format, mode: "bulk" });
        }
      } else {
        if (preview.format === "sheet2") {
          const result = await runSheet2Import(preview.csvText, preview.filename, targetRep!.id, appUser.id);
          setDone({ updated: result.updated, skipped: result.skipped, errorCount: 0, format: "sheet2", mode: "single" });
        } else {
          const result = await runImport(preview.csvText, preview.filename, targetRep!.id, appUser.id);
          setDone({ created: result.created, updated: result.updated, errorCount: result.batch.errorCount, format: preview.format, mode: "single" });
        }
      }
      setStep("done");
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Import failed");
      setStep("preview");
    }
  }

  function reset() {
    setStep("idle");
    setPreview(null);
    setDone(null);
    setRunError("");
    setTargetRep(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (step === "done" && done) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 space-y-2">
          <p className="font-medium text-emerald-800">
            {FORMAT_LABELS[done.format]} import complete
            {done.mode === "bulk" && " — bulk"}
          </p>
          <p className="text-sm text-emerald-700">
            {done.format === "sheet2" ? (
              <>{done.updated} profiles updated{done.skipped !== undefined && ` · ${done.skipped} not found`}</>
            ) : (
              <>{done.created} created · {done.updated} updated{done.errorCount > 0 && ` · ${done.errorCount} errors/skipped`}</>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>Import another file</Button>
      </div>
    );
  }

  // ── Running ───────────────────────────────────────────────────────────────
  if (step === "running") {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600" />
        <p className="text-sm text-muted-foreground">Importing… this may take a minute for large files.</p>
      </div>
    );
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  if (step === "preview" && preview) {
    const canRun = mode === "bulk"
      ? (preview.format === "sheet2" ? (preview.customerCount ?? 0) > 0 : (preview.validCount ?? 0) > 0)
      : !!targetRep && (preview.format === "sheet2" ? true : (preview.validCount ?? 0) > 0);

    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-sm">{preview.filename}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {FORMAT_LABELS[preview.format]}
              {preview.format !== "sheet2" && preview.rowCount !== undefined && ` · ${preview.rowCount} rows · ${preview.validCount} valid`}
              {preview.format !== "sheet2" && preview.revenueYears && preview.revenueYears.length > 0 && ` · Years: ${preview.revenueYears.join(", ")}`}
              {preview.format === "sheet2" && ` · ${preview.customerCount} customers`}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={reset}>Change file</Button>
        </div>

        {/* Bulk breakdown */}
        {mode === "bulk" && preview.bulkPreview && (
          <div className="rounded-lg border bg-zinc-50 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Auto-assignment preview</p>
            {preview.bulkPreview.repBreakdown
              .sort((a, b) => b.rowCount - a.rowCount)
              .map(({ repId, rowCount }) => (
                <div key={repId} className="flex justify-between text-sm">
                  <span>{preview.repNameMap?.[repId] ?? repId}</span>
                  <span className="tabular-nums text-muted-foreground">{rowCount} customers</span>
                </div>
              ))}
            {preview.bulkPreview.ambiguousStates && preview.bulkPreview.ambiguousStates.length > 0 && (
              <p className="text-xs text-orange-700 mt-1">
                Ambiguous — multiple reps or open slots (assign manually):{" "}
                {preview.bulkPreview.ambiguousStates.join(", ")}
              </p>
            )}
            {preview.bulkPreview.unmappedStates.length > 0 && (
              <p className="text-xs text-amber-700 mt-1">
                Skipped — no territory configured for states:{" "}
                {preview.bulkPreview.unmappedStates.join(", ")}
              </p>
            )}
          </div>
        )}

        {/* Sheet2 profile breakdown */}
        {preview.format === "sheet2" && preview.profileBreakdown && (
          <div className="rounded-lg border bg-zinc-50 p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground mb-1">Derived profiles</p>
            {Object.entries(preview.profileBreakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([profile, count]) => (
                <div key={profile} className="flex justify-between text-sm">
                  <span className="capitalize">{profile.replace(/_/g, " ")}</span>
                  <span className="tabular-nums text-muted-foreground">{count}</span>
                </div>
              ))}
          </div>
        )}

        {/* Validation errors */}
        {preview.format !== "sheet2" && preview.errors && preview.errors.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1 max-h-48 overflow-y-auto">
            <p className="text-xs font-medium text-amber-800">{preview.errors.length} rows skipped</p>
            {preview.errors.slice(0, 20).map((e, i) => (
              <p key={i} className="text-xs text-amber-700">
                Row {e.rowIndex + 2}: {e.field ? `[${e.field}] ` : ""}{e.message}
              </p>
            ))}
            {preview.errors.length > 20 && <p className="text-xs text-amber-600">…and {preview.errors.length - 20} more</p>}
          </div>
        )}

        {/* Single-rep picker */}
        {mode === "single" && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              {preview.format === "sheet2" ? "Update profiles for rep's customers" : "Import customers for rep"}
            </label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm h-9"
              value={targetRep?.id ?? ""}
              onChange={(e) => setTargetRep(reps.find((r) => r.id === e.target.value) ?? null)}
            >
              <option value="">— Select rep —</option>
              {reps.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.region})</option>)}
            </select>
          </div>
        )}

        {runError && <p className="text-xs text-red-600">{runError}</p>}

        <div className="flex gap-2">
          <Button onClick={handleRun} disabled={!canRun}>
            {mode === "bulk"
              ? preview.format === "sheet2"
                ? `Update profiles — ${preview.customerCount} customers`
                : `Bulk import — ${preview.bulkPreview?.validRows ?? preview.validCount ?? 0} rows`
              : preview.format === "sheet2"
              ? `Update profiles`
              : `Import ${preview.validCount} rows`}
          </Button>
          <Button variant="outline" onClick={reset}>Cancel</Button>
        </div>
        {mode === "bulk" && (((preview.bulkPreview?.unmappedStates?.length ?? 0) > 0) || ((preview.bulkPreview?.ambiguousStates?.length ?? 0) > 0)) && (
          <p className="text-xs text-muted-foreground">
            Skipped rows can be imported manually via <strong>Single rep</strong> mode after configuring the <strong>Territory Map</strong>.
          </p>
        )}
      </div>
    );
  }

  // ── Idle: drop zone ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-1">
        {(["bulk", "single"] as ImportMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              mode === m
                ? "bg-zinc-800 text-white border-zinc-800"
                : "border-zinc-200 text-muted-foreground hover:border-zinc-400"
            }`}
          >
            {m === "bulk" ? "Bulk (auto-assign by state)" : "Single rep"}
          </button>
        ))}
      </div>

      {mode === "bulk" ? (
        <p className="text-sm text-muted-foreground">
          Automatically assigns each customer to their rep based on the state→rep map configured in <strong>Territory Map</strong>.
          Run Sheet 1 first (revenue), then Sheet 2 (profiles).
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Import all customers in the file to a single rep. Useful for targeted re-imports or corrections.
        </p>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-12 cursor-pointer transition-colors ${
          isDragOver ? "border-zinc-400 bg-zinc-50" : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/50"
        }`}
      >
        <p className="text-sm font-medium">Drop CSV here or click to browse</p>
        <p className="text-xs text-muted-foreground mt-1">Sheet 1 or Sheet 2 — auto-detected</p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
    </div>
  );
}
