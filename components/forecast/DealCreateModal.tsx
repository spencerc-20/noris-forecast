// components/forecast/DealCreateModal.tsx — New deal creation dialog.
// Customer name is free text in Session 3; replaced with a proper customer picker in Session 4.
// Stage selection auto-sets the default close probability.
// Override modal fires if user deviates >±10pp from stage default.

"use client";

import { useState } from "react";
import type { DealStage, DealStructure, ProcedureTier } from "@/types";
import { STAGE_DEFAULT_PROBABILITY, FORECAST_ELIGIBLE_STRUCTURES } from "@/types";
import { createDeal } from "@/lib/firebase/deals";
import { ProbabilityOverrideModal } from "./ProbabilityOverrideModal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface DealCreateModalProps {
  open: boolean;
  onClose: () => void;
  ownerId: string;
  region: string;
}

const STAGE_OPTIONS: { value: DealStage; label: string }[] = [
  { value: "lead", label: "Lead (10%)" },
  { value: "discovery", label: "Discovery (25%)" },
  { value: "quoted", label: "Quoted (50%)" },
  { value: "verbal", label: "Verbal (75%)" },
];

const TIER_OPTIONS: { value: ProcedureTier; label: string }[] = [
  { value: "everything", label: "Everything (Full arch + zygo/ptery)" },
  { value: "full_arch", label: "Full Arch" },
  { value: "ra_only", label: "RA Only (zygo/ptery, not full arch)" },
  { value: "standard", label: "Standard" },
  { value: "course", label: "Course / Training" },
  { value: "tools", label: "Tools / Supplies" },
];

const STRUCTURE_OPTIONS: { value: DealStructure; label: string; eligible: boolean }[] = [
  { value: "standalone", label: "Standalone", eligible: true },
  { value: "package", label: "Package", eligible: true },
  { value: "bulk", label: "Bulk Order", eligible: true },
  { value: "combo", label: "Combo (course + clinical)", eligible: true },
  { value: "trial", label: "Trial Surgery (pipeline only)", eligible: false },
  { value: "mentorship", label: "Mentorship (pipeline only)", eligible: false },
];

interface FormState {
  customerName: string;
  stage: DealStage;
  procedureTier: ProcedureTier;
  dealStructure: DealStructure;
  dealValue: string;
  closeProbability: string;
  expectedCloseDate: string;
  decisionMaker: string;
  notes: string;
}

const DEFAULT_STAGE: DealStage = "discovery";

export function DealCreateModal({
  open,
  onClose,
  ownerId,
  region,
}: DealCreateModalProps) {
  const [form, setForm] = useState<FormState>({
    customerName: "",
    stage: DEFAULT_STAGE,
    procedureTier: "standard",
    dealStructure: "standalone",
    dealValue: "",
    closeProbability: String(STAGE_DEFAULT_PROBABILITY[DEFAULT_STAGE]),
    expectedCloseDate: "",
    decisionMaker: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Override modal state: holds the proposed probability while waiting for reason
  const [pendingProb, setPendingProb] = useState<number | null>(null);

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleStageChange(stage: DealStage) {
    setForm((f) => ({
      ...f,
      stage,
      closeProbability: String(STAGE_DEFAULT_PROBABILITY[stage]),
    }));
  }

  function handleProbabilityBlur() {
    const prob = parseInt(form.closeProbability, 10);
    if (isNaN(prob) || prob < 0 || prob > 100) return;
    const defaultProb = STAGE_DEFAULT_PROBABILITY[form.stage];
    if (Math.abs(prob - defaultProb) > 10) {
      setPendingProb(prob);
    }
  }

  async function handleSubmit(e: React.FormEvent, overrideReason?: string) {
    e.preventDefault();
    if (!form.customerName.trim()) {
      setError("Customer name is required.");
      return;
    }
    const dealValue = parseFloat(form.dealValue);
    if (isNaN(dealValue) || dealValue < 0) {
      setError("Deal value must be a valid number.");
      return;
    }
    const closeProbability = parseInt(form.closeProbability, 10);
    if (isNaN(closeProbability) || closeProbability < 0 || closeProbability > 100) {
      setError("Close probability must be 0–100.");
      return;
    }

    // Re-check override before saving
    const defaultProb = STAGE_DEFAULT_PROBABILITY[form.stage];
    const isOverride = Math.abs(closeProbability - defaultProb) > 10;
    if (isOverride && !overrideReason) {
      setPendingProb(closeProbability);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await createDeal(
        {
          customerId: "",
          customerName: form.customerName.trim(),
          ownerId,
          region,
          procedureTier: form.procedureTier,
          dealStructure: form.dealStructure,
          stage: form.stage,
          dealValue,
          closeProbability,
          isOverride,
          overrideReason: overrideReason ?? null,
          expectedCloseDate: form.expectedCloseDate,
          lastMeetingDate: null,
          nextMeetingDate: null,
          linkedDealId: null,
          notes: form.notes,
          decisionMaker: form.decisionMaker,
          closedAt: null,
        },
        ownerId
      );
      onClose();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deal.");
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setForm({
      customerName: "",
      stage: DEFAULT_STAGE,
      procedureTier: "standard",
      dealStructure: "standalone",
      dealValue: "",
      closeProbability: String(STAGE_DEFAULT_PROBABILITY[DEFAULT_STAGE]),
      expectedCloseDate: "",
      decisionMaker: "",
      notes: "",
    });
    setError(null);
    setPendingProb(null);
  }

  const isForecastEligible = FORECAST_ELIGIBLE_STRUCTURES.includes(
    form.dealStructure
  );

  return (
    <>
      <Dialog
        open={open && pendingProb === null}
        onOpenChange={(o) => {
          if (!o) { onClose(); resetForm(); }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Deal</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(e) => handleSubmit(e)}
            className="space-y-4 mt-2"
          >
            {/* Customer */}
            <div className="space-y-1.5">
              <Label htmlFor="customerName">
                Customer name{" "}
                <span className="text-muted-foreground font-normal">
                  (Session 4 adds customer picker)
                </span>
              </Label>
              <Input
                id="customerName"
                placeholder="Dr. Patel / Practice Name"
                required
                value={form.customerName}
                onChange={(e) => set("customerName", e.target.value)}
              />
            </div>

            {/* Tier + Structure */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Procedure tier</Label>
                <Select
                  value={form.procedureTier}
                  onValueChange={(v) => set("procedureTier", v as ProcedureTier)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIER_OPTIONS.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Deal structure</Label>
                <Select
                  value={form.dealStructure}
                  onValueChange={(v) =>
                    set("dealStructure", v as DealStructure)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STRUCTURE_OPTIONS.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!isForecastEligible && (
                  <p className="text-xs text-orange-600">
                    Pipeline only — not counted in forecast
                  </p>
                )}
              </div>
            </div>

            {/* Stage + Probability */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Stage</Label>
                <Select
                  value={form.stage}
                  onValueChange={(v) => handleStageChange(v as DealStage)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGE_OPTIONS.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prob">Close probability (%)</Label>
                <Input
                  id="prob"
                  type="number"
                  min={0}
                  max={100}
                  value={form.closeProbability}
                  onChange={(e) => set("closeProbability", e.target.value)}
                  onBlur={handleProbabilityBlur}
                />
              </div>
            </div>

            {/* Value + Close date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dealValue">Deal value ($)</Label>
                <Input
                  id="dealValue"
                  type="number"
                  min={0}
                  placeholder="45000"
                  required
                  value={form.dealValue}
                  onChange={(e) => set("dealValue", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="closeDate">Expected close date</Label>
                <Input
                  id="closeDate"
                  type="date"
                  required
                  value={form.expectedCloseDate}
                  onChange={(e) => set("expectedCloseDate", e.target.value)}
                />
              </div>
            </div>

            {/* Decision maker */}
            <div className="space-y-1.5">
              <Label htmlFor="dm">Decision maker</Label>
              <Input
                id="dm"
                placeholder="Dr. Patel"
                value={form.decisionMaker}
                onChange={(e) => set("decisionMaker", e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={2}
                placeholder="Context, next steps…"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => { onClose(); resetForm(); }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create deal"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Override reason modal */}
      {pendingProb !== null && (
        <ProbabilityOverrideModal
          open
          stage={form.stage}
          proposedProbability={pendingProb}
          onConfirm={(reason) => {
            setPendingProb(null);
            // Re-run submit with the confirmed override reason
            handleSubmit(
              { preventDefault: () => {} } as React.FormEvent,
              reason
            );
          }}
          onCancel={() => {
            // Revert probability to stage default
            set(
              "closeProbability",
              String(STAGE_DEFAULT_PROBABILITY[form.stage])
            );
            setPendingProb(null);
          }}
        />
      )}
    </>
  );
}
