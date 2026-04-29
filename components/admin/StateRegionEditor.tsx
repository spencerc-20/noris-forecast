// components/admin/StateRegionEditor.tsx — Read-only display of state→region mapping.
// V1: code-level only. Update lib/forecast/regionConfig.ts to change mappings.

"use client";

import { STATE_TO_REGION, ALL_REGIONS } from "@/lib/forecast/regionConfig";

const REGION_COLORS: Record<string, string> = {
  INSIDE: "bg-blue-100 text-blue-700",
  TX: "bg-orange-100 text-orange-700",
  EAST: "bg-green-100 text-green-700",
  CENTRAL: "bg-purple-100 text-purple-700",
  EILEEN: "bg-pink-100 text-pink-700",
  CALIFORNIA: "bg-yellow-100 text-yellow-700",
};

export function StateRegionEditor() {
  const byRegion: Record<string, string[]> = {};
  for (const region of ALL_REGIONS) byRegion[region] = [];
  for (const [state, region] of Object.entries(STATE_TO_REGION)) {
    if (byRegion[region]) byRegion[region].push(state);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        <strong>V1 — read-only.</strong> To change state assignments, edit{" "}
        <code className="bg-amber-100 px-1 py-0.5 rounded">lib/forecast/regionConfig.ts</code>{" "}
        and redeploy. Live editing is planned for V2.
      </div>

      <div className="space-y-3">
        {ALL_REGIONS.map((region) => {
          const states = byRegion[region] ?? [];
          const colorClass = REGION_COLORS[region] ?? "bg-zinc-100 text-zinc-700";
          return (
            <div key={region} className="rounded-lg border bg-white p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
                  {region}
                </span>
                <span className="text-xs text-muted-foreground">{states.length} states</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {states.sort().map((s) => (
                  <span
                    key={s}
                    className="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-mono"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
