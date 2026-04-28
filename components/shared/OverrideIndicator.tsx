// components/shared/OverrideIndicator.tsx — Small pill shown on deals where the rep manually
// overrode the stage-default close probability. Visible to managers as an at-a-glance signal.

interface OverrideIndicatorProps {
  reason: string | null;
}

export function OverrideIndicator({ reason }: OverrideIndicatorProps) {
  return (
    <span
      className="inline-flex items-center rounded-full bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-700"
      title={reason ?? "Probability overridden from stage default"}
    >
      Override
    </span>
  );
}
