// app/(app)/customers/[customerId]/page.tsx — Customer detail: all fields editable,
// computed fields (profile, commission, meeting dates) shown read-only.
// "Mark as lost" flow requires lostReason. Edit history panel at bottom.

"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import type { Customer, Deal, LifecycleStatus, LeadTemperature } from "@/types";
import { getCustomer, updateCustomer, deleteCustomer } from "@/lib/firebase/customers";
import { getDealsForUser } from "@/lib/firebase/deals";
import { useAuth } from "@/lib/firebase/auth";
import { isManager, isAdmin } from "@/lib/permissions/roles";
import { STATE_TO_REGION } from "@/lib/forecast/regionConfig";
import { UnifiedStatusBadge } from "@/components/customers/UnifiedStatusBadge";
import { CustomerProfileBadge } from "@/components/customers/CustomerProfileBadge";
import { LeadTemperatureBadge } from "@/components/customers/LeadTemperatureBadge";
import { EditHistoryPanel } from "@/components/shared/EditHistoryPanel";
import { TierPill } from "@/components/forecast/TierPill";
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
import { format, parseISO, formatDistanceToNow } from "date-fns";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const LIFECYCLE_OPTIONS: { value: LifecycleStatus; label: string }[] = [
  { value: "potential", label: "Potential" },
  { value: "new",       label: "New prospect" },
  { value: "existing",  label: "Existing" },
  { value: "inactive",  label: "Inactive" },
  { value: "lost",      label: "Lost" },
];

const TEMP_OPTIONS: { value: LeadTemperature; label: string }[] = [
  { value: "cold",    label: "Cold" },
  { value: "warm",    label: "Warm" },
  { value: "hot",     label: "Hot" },
  { value: "engaged", label: "Engaged" },
];

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = use(params);
  const router = useRouter();
  const { appUser } = useAuth();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [local, setLocal] = useState<Customer | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    async function load() {
      const [c, allDeals] = await Promise.all([
        getCustomer(customerId),
        appUser ? getDealsForUser(appUser.id) : Promise.resolve([]),
      ]);
      setCustomer(c);
      setLocal(c ? { ...c } : null);
      setDeals(allDeals.filter((d) => d.customerId === customerId));
      setLoading(false);
    }
    load();
  }, [customerId, appUser]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600" />
      </div>
    );
  }

  if (!customer || !local) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <p className="text-muted-foreground">Customer not found.</p>
      </div>
    );
  }

  const hasChanges = JSON.stringify(customer) !== JSON.stringify(local);

  const isStale =
    !local.temperatureUpdatedAt ||
    Date.now() - local.temperatureUpdatedAt > THIRTY_DAYS_MS;

  const canSeeFullHistory =
    appUser && (isManager(appUser) || isAdmin(appUser));

  function updateLocal(field: keyof Customer, value: unknown) {
    setLocal((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function handleStateChange(state: string) {
    const upper = state.toUpperCase();
    const derivedRegion = STATE_TO_REGION[upper] ?? local!.region;
    setLocal((prev) =>
      prev ? { ...prev, state: upper, region: derivedRegion } : prev
    );
  }

  function handleTemperatureChange(temp: LeadTemperature) {
    setLocal((prev) =>
      prev
        ? { ...prev, leadTemperature: temp, temperatureUpdatedAt: Date.now() }
        : prev
    );
  }

  async function handleSave() {
    if (!appUser) return;
    setSaving(true);
    setSaveError(null);
    try {
      const l = local!;
      const c = customer!;
      const updates: Partial<Customer> = {};
      (Object.keys(l) as (keyof Customer)[]).forEach((k) => {
        if (k === "id" || k === "createdAt") return;
        if (JSON.stringify(l[k]) !== JSON.stringify(c[k])) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (updates as any)[k] = l[k];
        }
      });
      await updateCustomer(customerId, updates, appUser.id, c);
      setCustomer({ ...l });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!appUser) return;
    await deleteCustomer(customerId, appUser.id);
    router.replace("/customers");
  }

  const currentYear = new Date().getFullYear();
  const openDeals = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
  const closedDeals = deals.filter((d) => d.stage === "won" || d.stage === "lost");

  return (
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
          <h1 className="text-xl font-semibold">{customer.name}</h1>
          {customer.practiceName && (
            <p className="text-sm text-muted-foreground">{customer.practiceName}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <UnifiedStatusBadge
              lifecycleStatus={customer.lifecycleStatus}
              commissionStatus={customer.commissionStatus}
              year={currentYear}
            />
            <LeadTemperatureBadge
              temperature={customer.leadTemperature}
              isStale={isStale}
            />
            <CustomerProfileBadge profile={customer.profile} />
            {customer.region && (
              <Badge variant="outline" className="text-zinc-500">
                {customer.region}
              </Badge>
            )}
          </div>
        </div>
        <div className="text-right shrink-0 space-y-0.5">
          {customer.lastMeetingDate && (
            <p className="text-xs text-muted-foreground">
              Last mtg: {format(parseISO(customer.lastMeetingDate), "MMM d")}
            </p>
          )}
          {customer.nextMeetingDate && (
            <p className="text-xs text-muted-foreground">
              Next mtg: {format(parseISO(customer.nextMeetingDate), "MMM d")}
            </p>
          )}
        </div>
      </div>

      {/* Unsaved changes bar */}
      {hasChanges && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
          <p className="text-sm text-blue-700 font-medium">Unsaved changes</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setLocal({ ...customer })}>
              Discard
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
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

      {/* Form */}
      <div className="rounded-lg border bg-white divide-y">
        {/* Identity */}
        <div className="grid grid-cols-2 gap-4 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Contact name</Label>
            <Input
              id="name"
              value={local.name}
              onChange={(e) => updateLocal("name", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="practice">Practice name</Label>
            <Input
              id="practice"
              value={local.practiceName}
              onChange={(e) => updateLocal("practiceName", e.target.value)}
            />
          </div>
        </div>

        {/* Contact */}
        <div className="grid grid-cols-2 gap-4 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={local.phone}
              onChange={(e) => updateLocal("phone", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={local.email}
              onChange={(e) => updateLocal("email", e.target.value)}
            />
          </div>
        </div>

        {/* Address + state + region */}
        <div className="grid grid-cols-3 gap-4 p-4">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={local.address}
              onChange={(e) => updateLocal("address", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="state">State</Label>
            <Input
              id="state"
              maxLength={2}
              value={local.state}
              onChange={(e) => handleStateChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Region: {local.region}</p>
          </div>
        </div>

        {/* Status + Temperature */}
        <div className="grid grid-cols-2 gap-4 p-4">
          <div className="space-y-1.5">
            <Label>Lifecycle status</Label>
            <Select
              value={local.lifecycleStatus}
              onValueChange={(v) => updateLocal("lifecycleStatus", v as LifecycleStatus)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LIFECYCLE_OPTIONS.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Lead temperature</Label>
            <Select
              value={local.leadTemperature}
              onValueChange={(v) => handleTemperatureChange(v as LeadTemperature)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TEMP_OPTIONS.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isStale && local.temperatureUpdatedAt && (
              <p className="text-xs text-amber-600">
                Last updated {formatDistanceToNow(local.temperatureUpdatedAt)} ago
              </p>
            )}
          </div>
        </div>

        {/* Lost tracking — shown only when status is lost */}
        {local.lifecycleStatus === "lost" && (
          <div className="grid grid-cols-2 gap-4 p-4 bg-red-50/50">
            <div className="space-y-1.5">
              <Label htmlFor="lostReason">Lost reason</Label>
              <Input
                id="lostReason"
                placeholder="e.g. Went with competitor"
                value={local.lostReason ?? ""}
                onChange={(e) => updateLocal("lostReason", e.target.value || null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lostCompetitor">Lost to competitor</Label>
              <Input
                id="lostCompetitor"
                placeholder="e.g. Nobel Biocare"
                value={local.lostCompetitor ?? ""}
                onChange={(e) =>
                  updateLocal("lostCompetitor", e.target.value || null)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="winBack">Win-back queue date</Label>
              <Input
                id="winBack"
                type="date"
                value={local.winBackQueueDate ?? ""}
                onChange={(e) =>
                  updateLocal("winBackQueueDate", e.target.value || null)
                }
              />
            </div>
          </div>
        )}

        {/* Sales context */}
        <div className="p-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="currentSystems">Current systems</Label>
            <Input
              id="currentSystems"
              placeholder="e.g. Straumann, Nobel Biocare"
              value={local.currentSystems}
              onChange={(e) => updateLocal("currentSystems", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="norisUse">Noris implant use</Label>
            <Input
              id="norisUse"
              placeholder="e.g. Full arch cases only"
              value={local.norisImplantUse}
              onChange={(e) => updateLocal("norisImplantUse", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="painPoint">Primary pain point</Label>
            <Input
              id="painPoint"
              placeholder="e.g. Cost of zygo kits"
              value={local.primaryPainPoint}
              onChange={(e) => updateLocal("primaryPainPoint", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custNotes">Notes</Label>
            <Textarea
              id="custNotes"
              rows={3}
              value={local.notes}
              onChange={(e) => updateLocal("notes", e.target.value)}
            />
          </div>
        </div>

        {/* Computed fields — read only */}
        <div className="p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Computed (auto-updated)
          </p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Profile</p>
              <CustomerProfileBadge profile={customer.profile} className="mt-1" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Commission status {currentYear}</p>
              <p className="mt-1 font-medium">
                {customer.commissionStatus?.[currentYear] ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Last meeting (derived)</p>
              <p className="mt-1">
                {customer.lastMeetingDate
                  ? format(parseISO(customer.lastMeetingDate), "MMM d, yyyy")
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Next meeting (derived)</p>
              <p className="mt-1">
                {customer.nextMeetingDate
                  ? format(parseISO(customer.nextMeetingDate), "MMM d, yyyy")
                  : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Revenue history */}
        {Object.keys(customer.annualRevenue ?? {}).length > 0 && (
          <div className="p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Annual revenue (from import)
            </p>
            <div className="flex gap-4 flex-wrap text-sm">
              {Object.entries(customer.annualRevenue)
                .sort(([a], [b]) => Number(b) - Number(a))
                .map(([year, amount]) => (
                  <div key={year} className="text-center">
                    <p className="text-xs text-muted-foreground">{year}</p>
                    <p className="font-medium tabular-nums">
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                        minimumFractionDigits: 0,
                      }).format(amount)}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Open deals */}
      {openDeals.length > 0 && (
        <div>
          <h2 className="text-sm font-medium mb-3">Open deals ({openDeals.length})</h2>
          <div className="rounded-lg border bg-white divide-y">
            {openDeals.map((deal) => (
              <button
                key={deal.id}
                onClick={() => router.push(`/deal/${deal.id}`)}
                className="flex w-full items-center gap-4 px-4 py-3 hover:bg-zinc-50 text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{deal.notes || "No notes"}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <TierPill tier={deal.procedureTier} />
                    <StagePill stage={deal.stage} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium tabular-nums">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      minimumFractionDigits: 0,
                    }).format(deal.dealValue)}
                  </p>
                  {deal.expectedCloseDate && (
                    <p className="text-xs text-muted-foreground">
                      Closes {format(parseISO(deal.expectedCloseDate), "MMM d")}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Closed deals */}
      {closedDeals.length > 0 && (
        <div>
          <h2 className="text-sm font-medium mb-3 text-muted-foreground">
            Closed deals ({closedDeals.length})
          </h2>
          <div className="rounded-lg border bg-white divide-y opacity-70">
            {closedDeals.map((deal) => (
              <button
                key={deal.id}
                onClick={() => router.push(`/deal/${deal.id}`)}
                className="flex w-full items-center gap-4 px-4 py-3 hover:bg-zinc-50 text-left"
              >
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <StagePill stage={deal.stage} />
                  <TierPill tier={deal.procedureTier} />
                </div>
                <p className="text-sm tabular-nums">
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    minimumFractionDigits: 0,
                  }).format(deal.dealValue)}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Edit history */}
      <div>
        <h2 className="text-sm font-medium mb-3">Edit history</h2>
        <div className="rounded-lg border bg-white p-4">
          <EditHistoryPanel
            recordId={customerId}
            limitToThirtyDays={!canSeeFullHistory}
          />
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
            Delete customer
          </Button>
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-sm text-red-700">
              This also leaves orphaned deals. Are you sure?
            </p>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              Yes, delete
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirm(false)}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
