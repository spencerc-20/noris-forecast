// components/rep/RepListFilters.tsx — Search + pipelineType + docType chips (dark theme).
//
// REVAMP v2.0 styling: transparent chips that brighten on hover, accent-coloured
// when active. Search field uses the dark surface palette directly (the shadcn
// <Input> styling didn't quite fit the dense spec — custom input here).

"use client";

import type { DocType, PipelineType } from "@/types";
import { DOC_TYPE_LABELS, DOC_TYPE_ORDER } from "@/types";

interface RepListFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  pipelineFilter: PipelineType | null;
  onPipelineChange: (v: PipelineType | null) => void;
  docTypeFilter: DocType | null;
  onDocTypeChange: (v: DocType | null) => void;
}

const PIPELINE_CHIPS: { value: PipelineType; label: string }[] = [
  { value: "new",      label: "New" },
  { value: "existing", label: "Existing" },
];

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
        active
          ? "bg-[color:var(--noris)] text-white border-[color:var(--noris)]"
          : "border-[color:var(--border-spec)] text-[color:var(--muted-spec)] hover:text-[color:var(--text-spec)] hover:border-[color:var(--muted-spec)]"
      }`}
    >
      {label}
    </button>
  );
}

export function RepListFilters({
  search,
  onSearchChange,
  pipelineFilter,
  onPipelineChange,
  docTypeFilter,
  onDocTypeChange,
}: RepListFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        placeholder="Search by name or practice…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="max-w-xs text-[12px] bg-[color:var(--surface)] border border-[color:var(--border-spec)] rounded-md px-2.5 py-1.5 text-[color:var(--text-spec)] placeholder:text-[color:var(--muted-spec)] focus:outline-none focus:border-[color:var(--noris)]"
      />
      <div className="flex gap-1">
        {PIPELINE_CHIPS.map(({ value, label }) => (
          <Chip
            key={value}
            label={label}
            active={pipelineFilter === value}
            onClick={() => onPipelineChange(pipelineFilter === value ? null : value)}
          />
        ))}
      </div>
      <div className="flex gap-1 flex-wrap">
        {DOC_TYPE_ORDER.map((d) => (
          <Chip
            key={d}
            label={DOC_TYPE_LABELS[d]}
            active={docTypeFilter === d}
            onClick={() => onDocTypeChange(docTypeFilter === d ? null : d)}
          />
        ))}
      </div>
    </div>
  );
}
