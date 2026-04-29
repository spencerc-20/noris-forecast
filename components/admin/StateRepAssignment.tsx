// components/admin/StateRepAssignment.tsx — Map each state to a rep user for bulk CSV import.
// Grouped by region. Admin sets this once after creating users, before running bulk import.
// Stored at forecast_v1/config/stateToRepMap.

"use client";

import { useEffect, useState } from "react";
import { STATE_TO_REGION, ALL_REGIONS } from "@/lib/forecast/regionConfig";
import { getStateToRepMap, saveStateToRepMap } from "@/lib/firebase/config";
import { getAllUsers } from "@/lib/firebase/users";
import { Button } from "@/components/ui/button";
import type { AppUser } from "@/types";

const REGION_COLORS: Record<string, string> = {
  INSIDE: "bg-blue-100 text-blue-700",
  TX: "bg-orange-100 text-orange-700",
  EAST: "bg-green-100 text-green-700",
  CENTRAL: "bg-purple-100 text-purple-700",
  EILEEN: "bg-pink-100 text-pink-700",
  CALIFORNIA: "bg-yellow-100 text-yellow-700",
};

export function StateRepAssignment() {
  const [reps, setReps] = useState<AppUser[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    Promise.all([getAllUsers(), getStateToRepMap()]).then(([users, map]) => {
      setReps(users.filter((u) => u.role === "rep"));
      setMapping(map);
      setLoading(false);
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await saveStateToRepMap(mapping);
      setSavedAt(new Date());
    } finally {
      setSaving(false);
    }
  }

  // Group states by region
  const byRegion: Record<string, string[]> = {};
  for (const region of ALL_REGIONS) byRegion[region] = [];
  for (const [state, region] of Object.entries(STATE_TO_REGION)) {
    byRegion[region]?.push(state);
  }

  const assigned = Object.values(mapping).filter(Boolean).length;
  const total = Object.keys(STATE_TO_REGION).length;

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600" />
      </div>
    );
  }

  if (reps.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        No rep users found. Create reps in the Users tab first, then return here to assign states.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {assigned} of {total} states assigned to reps
          </p>
          {savedAt && (
            <p className="text-xs text-emerald-600 mt-0.5">
              Saved {savedAt.toLocaleTimeString()}
            </p>
          )}
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save assignments"}
        </Button>
      </div>

      <div className="space-y-3">
        {ALL_REGIONS.map((region) => {
          const states = (byRegion[region] ?? []).sort();
          const regionReps = reps.filter((r) => r.region === region);
          const colorClass = REGION_COLORS[region] ?? "bg-zinc-100 text-zinc-700";

          return (
            <div key={region} className="rounded-lg border bg-white overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-zinc-50">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
                  {region}
                </span>
                {regionReps.length === 0 && (
                  <span className="text-xs text-amber-600">No reps in this region yet</span>
                )}
              </div>

              <div className="divide-y">
                {states.map((state) => {
                  const currentRepId = mapping[state] ?? "";
                  return (
                    <div key={state} className="flex items-center gap-3 px-4 py-2">
                      <span className="w-8 font-mono text-sm font-medium shrink-0">{state}</span>
                      <select
                        className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm h-7"
                        value={currentRepId}
                        onChange={(e) =>
                          setMapping((m) => ({ ...m, [state]: e.target.value }))
                        }
                        disabled={regionReps.length === 0}
                      >
                        <option value="">— Unassigned —</option>
                        {regionReps.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <Button size="sm" onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save assignments"}
      </Button>
    </div>
  );
}
