// components/admin/ConfigEditor.tsx — Read-only reference for all V1 taxonomy values:
// pipeline stages (with default probabilities), procedure tiers (with hierarchy rank),
// and deal structures (with forecast-eligibility). V2 will make these editable.

import {
  STAGE_DEFAULT_PROBABILITY,
  TIER_RANK,
  FORECAST_ELIGIBLE_STRUCTURES,
} from "@/types";
import type { DealStage, ProcedureTier, DealStructure } from "@/types";

// ── Stages ───────────────────────────────────────────────────────────────────

const STAGE_ROWS: { id: DealStage; label: string; note: string }[] = [
  { id: "lead",      label: "Lead",       note: "Cold contact, minimal engagement" },
  { id: "discovery", label: "Discovery",  note: "Actively exploring Noris products" },
  { id: "quoted",    label: "Quoted",     note: "Formal quote sent" },
  { id: "verbal",    label: "Verbal",     note: "Verbal commitment received" },
  { id: "won",       label: "Closed Won", note: "Deal closed — triggers profile + commission recompute" },
  { id: "lost",      label: "Closed Lost",note: "Deal lost — excluded from forecast" },
];

// ── Procedure tiers ───────────────────────────────────────────────────────────

const TIER_ROWS: { id: ProcedureTier; label: string; description: string }[] = [
  { id: "everything", label: "Everything",  description: "Full-arch case using zygomatic and/or pterygoid implants" },
  { id: "full_arch",  label: "Full Arch",   description: "Full-arch case without zygo/ptery" },
  { id: "ra_only",    label: "RA Only",     description: "Zygo/ptery implants, not in a full-arch case" },
  { id: "standard",   label: "Standard",    description: "Single-tooth, partials, routine implant business" },
  { id: "course",     label: "Course",      description: "Education only — courses and training" },
  { id: "tools",      label: "Tools",       description: "Tools, supplies, instruments — no implants" },
];

// ── Deal structures ───────────────────────────────────────────────────────────

const STRUCTURE_ROWS: { id: DealStructure; label: string; description: string }[] = [
  { id: "standalone",  label: "Standalone",   description: "Single clinical deal" },
  { id: "package",     label: "Package",      description: "Bundled product + service deal" },
  { id: "bulk",        label: "Bulk Order",   description: "High-volume purchase order" },
  { id: "combo",       label: "Combo",        description: "Course + clinical deal combined" },
  { id: "trial",       label: "Trial Surgery",description: "Trial case — leading indicator, not counted in forecast" },
  { id: "mentorship",  label: "Mentorship",   description: "Mentorship engagement — leading indicator, not counted in forecast" },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {note && <p className="text-xs text-muted-foreground mt-0.5">{note}</p>}
    </div>
  );
}

function EligiblePill({ eligible }: { eligible: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        eligible
          ? "bg-emerald-100 text-emerald-700"
          : "bg-zinc-100 text-zinc-500"
      }`}
    >
      {eligible ? "Forecast" : "Pipeline only"}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ConfigEditor() {
  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        V1 taxonomy values are fixed in code. Contact engineering to change probability defaults or add new tiers.
      </p>

      {/* Pipeline stages */}
      <div>
        <SectionHeader
          title="Pipeline stages"
          note="Changing a deal's stage resets close probability to the stage default. Overrides &gt;±10% require a written reason."
        />
        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="grid grid-cols-[140px_80px_1fr] gap-3 px-4 py-2 border-b bg-zinc-50 text-xs font-medium text-muted-foreground">
            <div>Stage</div>
            <div>Default %</div>
            <div>Notes</div>
          </div>
          {STAGE_ROWS.map(({ id, label, note }) => (
            <div
              key={id}
              className="grid grid-cols-[140px_80px_1fr] gap-3 px-4 py-2.5 border-b last:border-b-0 items-center"
            >
              <span className="text-sm font-medium">{label}</span>
              <span className="text-sm tabular-nums font-mono text-zinc-700">
                {STAGE_DEFAULT_PROBABILITY[id]}%
              </span>
              <span className="text-sm text-muted-foreground">{note}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Procedure tiers */}
      <div>
        <SectionHeader
          title="Procedure tiers"
          note="Hierarchical — highest tier reached becomes the customer profile (never demotes). Tier 1 is highest."
        />
        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="grid grid-cols-[24px_160px_1fr] gap-3 px-4 py-2 border-b bg-zinc-50 text-xs font-medium text-muted-foreground">
            <div>#</div>
            <div>Tier</div>
            <div>Definition</div>
          </div>
          {TIER_ROWS.map(({ id, label, description }) => (
            <div
              key={id}
              className="grid grid-cols-[24px_160px_1fr] gap-3 px-4 py-2.5 border-b last:border-b-0 items-center"
            >
              <span className="text-xs text-muted-foreground font-mono">
                {TIER_RANK[id]}
              </span>
              <span className="text-sm font-medium">{label}</span>
              <span className="text-sm text-muted-foreground">{description}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Deal structures */}
      <div>
        <SectionHeader
          title="Deal structures"
          note="Forecast-eligible structures count toward the weighted $ forecast. Pipeline-only structures are tracked but excluded."
        />
        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="grid grid-cols-[160px_130px_1fr] gap-3 px-4 py-2 border-b bg-zinc-50 text-xs font-medium text-muted-foreground">
            <div>Structure</div>
            <div>Eligibility</div>
            <div>Notes</div>
          </div>
          {STRUCTURE_ROWS.map(({ id, label, description }) => {
            const eligible = FORECAST_ELIGIBLE_STRUCTURES.includes(id);
            return (
              <div
                key={id}
                className="grid grid-cols-[160px_130px_1fr] gap-3 px-4 py-2.5 border-b last:border-b-0 items-center"
              >
                <span className="text-sm font-medium">{label}</span>
                <EligiblePill eligible={eligible} />
                <span className="text-sm text-muted-foreground">{description}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
