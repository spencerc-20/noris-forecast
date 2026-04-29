// components/customers/CustomerSalesContext.tsx — Inline-editable panel for Current Systems,
// Noris Implant Use, Primary Pain Point, and Notes. Receives field values and an onChange
// callback from the customer detail form — does not write to Firebase directly.

"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type SalesContextField = "currentSystems" | "norisImplantUse" | "primaryPainPoint" | "notes";

interface CustomerSalesContextProps {
  currentSystems: string;
  norisImplantUse: string;
  primaryPainPoint: string;
  notes: string;
  onChange: (field: SalesContextField, value: string) => void;
}

export function CustomerSalesContext({
  currentSystems,
  norisImplantUse,
  primaryPainPoint,
  notes,
  onChange,
}: CustomerSalesContextProps) {
  return (
    <div className="p-4 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="currentSystems">Current systems</Label>
        <Input
          id="currentSystems"
          placeholder="e.g. Straumann, Nobel Biocare"
          value={currentSystems}
          onChange={(e) => onChange("currentSystems", e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="norisUse">Noris implant use</Label>
        <Input
          id="norisUse"
          placeholder="e.g. Full arch cases only"
          value={norisImplantUse}
          onChange={(e) => onChange("norisImplantUse", e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="painPoint">Primary pain point</Label>
        <Input
          id="painPoint"
          placeholder="e.g. Cost of zygo kits"
          value={primaryPainPoint}
          onChange={(e) => onChange("primaryPainPoint", e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="custNotes">Notes</Label>
        <Textarea
          id="custNotes"
          rows={3}
          value={notes}
          onChange={(e) => onChange("notes", e.target.value)}
        />
      </div>
    </div>
  );
}
