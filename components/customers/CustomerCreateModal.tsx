// components/customers/CustomerCreateModal.tsx — New customer creation dialog.
// Collects the essential fields needed at creation. Full details editable on customer detail page.
// Auto-assigns region from state via STATE_TO_REGION.

"use client";

import { useState } from "react";
import type { LeadTemperature } from "@/types";
import { createCustomer } from "@/lib/firebase/customers";
import { STATE_TO_REGION } from "@/lib/forecast/regionConfig";
import type { Customer } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

const TEMP_OPTIONS: { value: LeadTemperature; label: string }[] = [
  { value: "cold",    label: "Cold" },
  { value: "warm",    label: "Warm" },
  { value: "hot",     label: "Hot" },
  { value: "engaged", label: "Engaged" },
];

interface CustomerCreateModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (customer: Customer) => void;
  ownerId: string;
  region: string;
  /** Pre-fill customer name from the deal flow search query. */
  initialName?: string;
}

interface FormState {
  name: string;
  practiceName: string;
  state: string;
  phone: string;
  email: string;
  leadTemperature: LeadTemperature;
}

export function CustomerCreateModal({
  open,
  onClose,
  onSuccess,
  ownerId,
  region,
  initialName = "",
}: CustomerCreateModalProps) {
  const [form, setForm] = useState<FormState>({
    name: initialName,
    practiceName: "",
    state: "",
    phone: "",
    email: "",
    leadTemperature: "warm",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const derivedRegion = form.state
    ? (STATE_TO_REGION[form.state.toUpperCase()] ?? region)
    : region;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Customer name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const customer = await createCustomer(
        {
          name: form.name.trim(),
          practiceName: form.practiceName.trim(),
          address: "",
          state: form.state.toUpperCase(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          lifecycleStatus: "new",
          leadTemperature: form.leadTemperature,
          temperatureUpdatedAt: Date.now(),
          ownerId,
          region: derivedRegion,
          currentSystems: "",
          norisImplantUse: "",
          primaryPainPoint: "",
          notes: "",
          annualRevenue: {},
          revenueDataSource: {},
          firstOrderDate: null,
          lastOrderDate: null,
          orderCadenceDays: null,
          lostReason: null,
          lostCompetitor: null,
          lostDate: null,
          lostDealValue: null,
          winBackQueueDate: null,
          importBatchId: null,
          createdBy: ownerId,
        },
        ownerId
      );
      onSuccess(customer);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create customer.");
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setForm({
      name: initialName,
      practiceName: "",
      state: "",
      phone: "",
      email: "",
      leadTemperature: "warm",
    });
    setError(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          resetForm();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Customer</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="cust-name">Customer name</Label>
            <Input
              id="cust-name"
              placeholder="Dr. Patel"
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="practice">Practice name</Label>
            <Input
              id="practice"
              placeholder="Springfield Oral Surgery"
              value={form.practiceName}
              onChange={(e) => set("practiceName", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="state">
                State{" "}
                <span className="text-muted-foreground font-normal text-xs">
                  (auto-assigns region)
                </span>
              </Label>
              <Input
                id="state"
                placeholder="TX"
                maxLength={2}
                value={form.state}
                onChange={(e) => set("state", e.target.value.toUpperCase())}
              />
              {form.state && (
                <p className="text-xs text-muted-foreground">
                  Region: {derivedRegion}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Lead temperature</Label>
              <Select
                value={form.leadTemperature}
                onValueChange={(v) => set("leadTemperature", v as LeadTemperature)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMP_OPTIONS.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="(555) 000-0000"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-email">Email</Label>
              <Input
                id="cust-email"
                type="email"
                placeholder="dr@practice.com"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
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
              onClick={() => {
                onClose();
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create customer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
