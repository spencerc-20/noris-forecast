// components/forecast/StructurePill.tsx — Colored badge for deal structure (Layer 2 deal classification).
// Pipeline-only structures (trial, mentorship) shown in muted orange/rose to signal they don't count in forecast.

import type { DealStructure } from "@/types";

const STRUCTURE_LABELS: Record<DealStructure, string> = {
  standalone: "Standalone",
  package: "Package",
  bulk: "Bulk",
  combo: "Combo",
  trial: "Trial",
  mentorship: "Mentorship",
};

/** Full class strings for Tailwind tree-shaking. */
const STRUCTURE_COLORS: Record<DealStructure, string> = {
  standalone: "bg-emerald-100 text-emerald-700",
  package: "bg-teal-100 text-teal-700",
  bulk: "bg-cyan-100 text-cyan-700",
  combo: "bg-violet-100 text-violet-700",
  trial: "bg-orange-100 text-orange-600",
  mentorship: "bg-rose-100 text-rose-600",
};

export function StructurePill({ structure }: { structure: DealStructure }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STRUCTURE_COLORS[structure]}`}
    >
      {STRUCTURE_LABELS[structure]}
    </span>
  );
}
