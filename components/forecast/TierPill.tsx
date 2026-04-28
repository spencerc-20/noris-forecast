// components/forecast/TierPill.tsx — Colored badge for procedure tier (Layer 1 deal classification).

import type { ProcedureTier } from "@/types";

const TIER_LABELS: Record<ProcedureTier, string> = {
  everything: "Everything",
  full_arch: "Full Arch",
  ra_only: "RA Only",
  standard: "Standard",
  course: "Course",
  tools: "Tools",
};

/** Full class strings for Tailwind tree-shaking. */
const TIER_COLORS: Record<ProcedureTier, string> = {
  everything: "bg-purple-100 text-purple-700",
  full_arch: "bg-indigo-100 text-indigo-700",
  ra_only: "bg-blue-100 text-blue-700",
  standard: "bg-sky-100 text-sky-700",
  course: "bg-amber-100 text-amber-700",
  tools: "bg-zinc-100 text-zinc-600",
};

export function TierPill({ tier }: { tier: ProcedureTier }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TIER_COLORS[tier]}`}
    >
      {TIER_LABELS[tier]}
    </span>
  );
}
