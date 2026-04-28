// components/shared/StagePill.tsx — Colored badge for deal stage.

import type { DealStage } from "@/types";
import { STAGE_LABELS, STAGE_COLORS } from "@/lib/forecast/stageConfig";

export function StagePill({ stage }: { stage: DealStage }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_COLORS[stage]}`}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}
