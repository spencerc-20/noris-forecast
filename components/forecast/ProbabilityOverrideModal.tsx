// components/forecast/ProbabilityOverrideModal.tsx — Modal shown when close probability
// deviates >±10pp from the stage default. Requires a written reason (min 20 chars).
// Fires onConfirm(reason) on submit, onCancel to revert the probability change.

"use client";

import { useState } from "react";
import type { DealStage } from "@/types";
import { STAGE_DEFAULT_PROBABILITY, STAGE_LABELS } from "@/lib/forecast/stageConfig";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

const MIN_REASON_LENGTH = 20;

interface ProbabilityOverrideModalProps {
  open: boolean;
  stage: DealStage;
  proposedProbability: number;
  existingReason?: string | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function ProbabilityOverrideModal({
  open,
  stage,
  proposedProbability,
  existingReason,
  onConfirm,
  onCancel,
}: ProbabilityOverrideModalProps) {
  const [reason, setReason] = useState(existingReason ?? "");
  const defaultProb = STAGE_DEFAULT_PROBABILITY[stage];
  const delta = proposedProbability - defaultProb;
  const tooShort = reason.trim().length < MIN_REASON_LENGTH;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (tooShort) return;
    onConfirm(reason.trim());
  }

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Override close probability</DialogTitle>
          <DialogDescription>
            {STAGE_LABELS[stage]} default is{" "}
            <strong>{defaultProb}%</strong>. You set{" "}
            <strong>{proposedProbability}%</strong> (
            {delta > 0 ? "+" : ""}
            {delta}pp). Deviations over ±10pp require a reason so managers
            can review it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          <div className="space-y-1.5">
            <Label htmlFor="override-reason">
              Reason{" "}
              <span className="text-muted-foreground font-normal">
                (min {MIN_REASON_LENGTH} characters)
              </span>
            </Label>
            <Textarea
              id="override-reason"
              placeholder="e.g. Customer verbally committed, waiting on partner sign-off before PO"
              rows={3}
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="text-xs text-muted-foreground text-right">
              {reason.trim().length}/{MIN_REASON_LENGTH} min
            </p>
          </div>

          {tooShort && reason.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                Please write at least {MIN_REASON_LENGTH} characters so the
                reason is meaningful.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel (revert to {defaultProb}%)
            </Button>
            <Button type="submit" disabled={tooShort}>
              Save override
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
