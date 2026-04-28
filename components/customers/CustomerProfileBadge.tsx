// components/customers/CustomerProfileBadge.tsx — Customer profile tier badge.
// Colors mirror TierPill to reinforce the same clinical hierarchy concept.

import type { CustomerProfile } from "@/types";

const PROFILE_STYLES: Record<CustomerProfile, string> = {
  everything:  "bg-purple-100 text-purple-700",
  full_arch:   "bg-indigo-100 text-indigo-700",
  ra_only:     "bg-blue-100 text-blue-700",
  standard:    "bg-sky-100 text-sky-700",
  course_only: "bg-amber-100 text-amber-700",
  tools_only:  "bg-zinc-100 text-zinc-600",
  new:         "bg-zinc-50 text-zinc-400",
};

const PROFILE_LABELS: Record<CustomerProfile, string> = {
  everything:  "Everything",
  full_arch:   "Full arch",
  ra_only:     "RA only",
  standard:    "Standard",
  course_only: "Course only",
  tools_only:  "Tools only",
  new:         "No history",
};

interface CustomerProfileBadgeProps {
  profile: CustomerProfile;
  className?: string;
}

export function CustomerProfileBadge({ profile, className = "" }: CustomerProfileBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PROFILE_STYLES[profile]} ${className}`}
    >
      {PROFILE_LABELS[profile]}
    </span>
  );
}
