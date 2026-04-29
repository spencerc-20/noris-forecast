// components/admin/ImportHistory.tsx — List of past import batches from forecast_v1/imports.

"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { getImportBatches } from "@/lib/firebase/imports";
import type { ImportBatch } from "@/types";

export function ImportHistory() {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    getImportBatches().then((data) => {
      setBatches(data);
      setLoading(false);
    });
  }, []);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600" />
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center text-sm text-muted-foreground">
        No imports yet.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 px-4 py-2 border-b bg-zinc-50 text-xs font-medium text-muted-foreground">
        <div>File</div>
        <div>Date</div>
        <div className="text-right">Rows</div>
        <div className="text-right">Success</div>
        <div className="text-right">Errors</div>
      </div>
      {batches.map((b) => {
        const isOpen = expanded.has(b.id);
        return (
          <div key={b.id} className="border-b last:border-b-0">
            <button
              className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 w-full px-4 py-3 items-center hover:bg-zinc-50 text-left"
              onClick={() => b.errors.length > 0 && toggle(b.id)}
            >
              <div className="flex items-center gap-2 min-w-0">
                {b.errors.length > 0 ? (
                  isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />
                ) : (
                  <span className="w-3" />
                )}
                <span className="text-sm truncate">{b.filename}</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {format(b.importedAt, "MMM d, yyyy")}
              </span>
              <span className="text-sm text-right tabular-nums">{b.rowCount}</span>
              <span className="text-sm text-right tabular-nums text-emerald-600">{b.successCount}</span>
              <span className={`text-sm text-right tabular-nums ${b.errorCount > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                {b.errorCount}
              </span>
            </button>

            {/* Error details */}
            {isOpen && b.errors.length > 0 && (
              <div className="px-4 pb-3 space-y-1 bg-red-50/50">
                {b.errors.slice(0, 20).map((e, i) => (
                  <p key={i} className="text-xs text-red-700">
                    Row {e.rowIndex + 2}: {e.field ? `[${e.field}] ` : ""}{e.message}
                  </p>
                ))}
                {b.errors.length > 20 && (
                  <p className="text-xs text-red-500">…and {b.errors.length - 20} more</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
