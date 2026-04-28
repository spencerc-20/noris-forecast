// lib/forecast/stageConfig.ts — Stage labels, display colors, and default probabilities.

import type { DealStage } from "@/types";
import { STAGE_DEFAULT_PROBABILITY } from "@/types";

export { STAGE_DEFAULT_PROBABILITY };

export const STAGE_LABELS: Record<DealStage, string> = {
  lead: "Lead",
  discovery: "Discovery",
  quoted: "Quoted",
  verbal: "Verbal",
  won: "Won",
  lost: "Lost",
};

/** Full Tailwind class strings — must be complete for Tailwind tree-shaking to work. */
export const STAGE_COLORS: Record<DealStage, string> = {
  lead: "bg-zinc-100 text-zinc-600",
  discovery: "bg-blue-100 text-blue-700",
  quoted: "bg-yellow-100 text-yellow-700",
  verbal: "bg-orange-100 text-orange-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-600",
};
