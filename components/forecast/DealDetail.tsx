// components/forecast/DealDetail.tsx — Full deal edit form: classification, stage, probability
// override, value, dates, notes, edit history, delete. Manages its own local editing state;
// calls onSave/onDelete callbacks supplied by the page.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import type { Deal, DealStage, DealStructure, ProcedureTier } from "@/types";
import { STAGE_DEFAULT_PROBABILITY, FORECAST_ELIGIBLE_STRUCTURES } from "@/types";
import { formatCurrency, weightedValue } from "@/lib/forecast/calculations";
import { STAGE_LABELS } from "@/lib/forecast/stageConfig";
import { ProbabilityOverrideModal } from "@/components/forecast/ProbabilityOverrideModal";
import { EditHistoryPanel } from "@/components/shared/EditHistoryPanel";
import { TierPill } from "@/components/forecast/TierPill";
import { StructurePill } from "@/components/forecast/StructurePill";
import { StagePill } from "@/components/shared/StagePill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

const STAGE_OPTIONS: DealStage[] = ["lead", "discovery", "quoted", "verbal", "won", "lost"];
const TIER_OPTIONS: ProcedureTier[] = ["everything", "full_arch", "ra_only", "standard", "course", "tools"];
const TIER_LABELS: Record<ProcedureTier, string> = {
  everything: "Everything",
  full_arch: "Full Arch",
  ra_only: "RA Only",
  standard: "Standard",
  course: "Course",
  tools: "Tools",
};
const STRUCTURE_OPTIONS: DealStructure[] = ["standalone", "package", "bulk", "combo", "trial", "mentorship"];
const STRUCTURE_LABELS: Record<DealStructure, string> = {
  standalone: "Standalone",
  package: "Package",
  bulk: "Bulk Order",
  combo: "Combo",
  trial: "Trial Surgery",
  mentorship: "Mentorship",
};

interface DealDetailProps {
  deal: Deal;
  dealId: string;
  canSeeFullHistory: boolean;
  onSave: (updates: Partial<Deal>, overrideReason?: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function DealDetail({
  deal,
  dealId,
  canSeeFullHistory,
  onSave,
  onDelete,
}: DealDetailProps) {
  const router = useRouter();

  const [savedDeal, setSavedDeal] = useState<Deal>(deal);
  const [local, setLocal] = useState<Deal>({ ...deal });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [pendingProb, setPendingProb] = useState<number | null>(null);

  const hasChanges = JSON.stringify(savedDeal) !== JSON.stringify(local);

  function updateLocal(field: keyof Deal, value: unknown) {
    setLocal((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function handleStageChange(stage: DealStage) {
    setLocal((prev) => ({
      ...prev,
      stage,
      closeProbability: STAGE_DEFAULT_PROBABILITY[stage],
      isOverride: false,
      overrideReason: null,
    }));
  }

  function handleProbabilityBlur(e: React.FocusEvent<HTMLInputElement>) {
    const prob = parseInt(e.target.value, 10);
    if (isNaN(prob) || prob < 0 || prob > 100) return;
    const defaultProb = STAGE_DEFAULT_PROBABILITY[local.stage];
    if (Math.abs(prob - defaultProb) > 10) {
      setPendingProb(prob);
    } else {
      updateLocal("closeProbability", prob);
      updateLocal("isOverride", false);
      updateLocal("overrideReason", null);
    }
  }

  function handleStructureChange(structure: DealStructure) {
    setLocal((prev) => ({
      ...prev,
      dealStructure: structure,
      isForecastEligible: FORECAST_ELIGIBLE_STRUCTURES.includes(structure),
    }));
  }

  async function handleSave(overrideReason?: string) {
    setSaving(true);
    setSaveError(null);
    try {
      const updates: Partial<Deal> = {};
      (Object.keys(local) as (keyof Deal)[]).forEach((k) => {
        if (k === "id" || k === "createdAt") return;
        if (JSON.stringify(local[k]) !== JSON.stringify(savedDeal[k])) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (updates as any)[k] = local[k];
        }
      });
      await onSave(updates, overrideReason);
      setSavedDeal({ ...local });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
      setPendingProb(null);
    }
  }

  function handleSaveClick() {
    const defaultProb = STAGE_DEFAULT_PROBABILITY[local.stage];
    if (Math.abs(local.closeProbability - defaultProb) > 10 && !local.isOverride) {
      setPendingProb(local.closeProbability);
      return;
    }
    handleSave(local.overrideReason ?? undefined);
  }

  const wv = weightedValue(local);

  return (
    <>
      <div className="mx-auto max-w-3xl px-6 py-6 space-y-6">
        {/* Back + header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-zinc-900 mb-2"
            >
              <ArrowLeft size={14} /> Back
            </button>
            <h1 className="text-xl font-semibold">{savedDeal.customerName}</h1>
            <div className="flex items-center gap-2 mt-1.5">
              <TierPill tier={savedDeal.procedureTier} />
              <StructurePill structure={savedDeal.dealStructure} />
              <StagePill stage={savedDeal.stage} />
              {!savedDeal.isForecastEligible && (
                <Badge variant="outline" className="text-orange-600 border-orange-200">
                  Pipeline only
                </Badge>
              )}
              {savedDeal.isOverride && (
                <Badge variant="outline" className="text-orange-600 border-orange-200">
                  Override
                </Badge>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-semibold tabular-nums">
              {formatCurrency(savedDeal.dealValue)}
            </p>
            <p className="text-sm text-muted-foreground tabular-nums">
              {savedDeal.closeProbability}% → {formatCurrency(wv)} weighted
            </p>
          </div>
        </div>

        {/* Unsaved changes bar */}
        {hasChanges && (
          <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
            <p className="text-sm text-blue-700 font-medium">Unsaved changes</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setLocal({ ...savedDeal })}>
                Discard
              </Button>
              <Button size="sm" onClick={handleSaveClick} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        )}

        {saveError && (
          <Alert variant="destructive">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}

        {/* Form fields */}
        <div className="rounded-lg border bg-white divide-y">
          {/* Classification */}
          <div className="grid grid-cols-2 gap-4 p-4">
            <div className="space-y-1.5">
              <Label>Procedure tier</Label>
              <Select
                value={local.procedureTier}
                onValueChange={(v) => updateLocal("procedureTier", v as ProcedureTier)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIER_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{TIER_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Deal structure</Label>
              <Select
                value={local.dealStructure}
                onValueChange={(v) => handleStructureChange(v as DealStructure)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STRUCTURE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{STRUCTURE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!local.isForecastEligible && (
                <p className="text-xs text-orange-600">Pipeline only — not counted in forecast</p>
              )}
            </div>
          </div>

          {/* Stage + Probability */}
          <div className="grid grid-cols-2 gap-4 p-4">
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <Select value={local.stage} onValueChange={(v) => handleStageChange(v as DealStage)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prob">
                Close probability (%)
                {local.isOverride && (
                  <span className="ml-1.5 text-orange-600 font-normal text-xs">
                    override — default {STAGE_DEFAULT_PROBABILITY[local.stage]}%
                  </span>
                )}
              </Label>
              <Input
                id="prob"
                type="number"
                min={0}
                max={100}
                value={local.closeProbability}
                onChange={(e) => updateLocal("closeProbability", parseInt(e.target.value, 10) || 0)}
                onBlur={handleProbabilityBlur}
              />
              {local.isOverride && local.overrideReason && (
                <p className="text-xs text-muted-foreground italic">"{local.overrideReason}"</p>
              )}
            </div>
          </div>

          {/* Value + Close date */}
          <div className="grid grid-cols-2 gap-4 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="value">Deal value ($)</Label>
              <Input
                id="value"
                type="number"
                min={0}
                value={local.dealValue}
                onChange={(e) => updateLocal("dealValue", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="closeDate">Expected close date</Label>
              <Input
                id="closeDate"
                type="date"
                value={local.expectedCloseDate}
                onChange={(e) => updateLocal("expectedCloseDate", e.target.value)}
              />
            </div>
          </div>

          {/* Meetings */}
          <div className="grid grid-cols-2 gap-4 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="lastMtg">Last meeting date</Label>
              <Input
                id="lastMtg"
                type="date"
                value={local.lastMeetingDate ?? ""}
                onChange={(e) => updateLocal("lastMeetingDate", e.target.value || null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nextMtg">Next meeting date</Label>
              <Input
                id="nextMtg"
                type="date"
                value={local.nextMeetingDate ?? ""}
                onChange={(e) => updateLocal("nextMeetingDate", e.target.value || null)}
              />
            </div>
          </div>

          {/* Decision maker + notes */}
          <div className="p-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dm">Decision maker</Label>
              <Input
                id="dm"
                value={local.decisionMaker}
                onChange={(e) => updateLocal("decisionMaker", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Deal notes</Label>
              <Textarea
                id="notes"
                rows={3}
                value={local.notes}
                onChange={(e) => updateLocal("notes", e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Edit history */}
        <div>
          <h2 className="text-sm font-medium mb-3">Edit history</h2>
          <div className="rounded-lg border bg-white p-4">
            <EditHistoryPanel recordId={dealId} limitToThirtyDays={!canSeeFullHistory} />
          </div>
        </div>

        {/* Danger zone */}
        <div className="rounded-lg border border-red-200 p-4">
          <h2 className="text-sm font-medium text-red-700 mb-2">Danger zone</h2>
          {!deleteConfirm ? (
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setDeleteConfirm(true)}
            >
              <Trash2 size={14} className="mr-1.5" />
              Delete deal
            </Button>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-red-700">Are you sure? This cannot be undone.</p>
              <Button variant="destructive" size="sm" onClick={onDelete}>
                Yes, delete
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(false)}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Override reason modal */}
      {pendingProb !== null && (
        <ProbabilityOverrideModal
          open
          stage={local.stage}
          proposedProbability={pendingProb}
          existingReason={local.overrideReason}
          onConfirm={(reason) => {
            setLocal((prev) => ({
              ...prev,
              closeProbability: pendingProb,
              isOverride: true,
              overrideReason: reason,
            }));
            setPendingProb(null);
          }}
          onCancel={() => {
            setLocal((prev) => ({
              ...prev,
              closeProbability: STAGE_DEFAULT_PROBABILITY[prev.stage],
              isOverride: false,
              overrideReason: null,
            }));
            setPendingProb(null);
          }}
        />
      )}
    </>
  );
}
