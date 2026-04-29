// components/admin/StateRepAssignment.tsx — Territory map editor.
// Reads/writes forecast_v1/config/territories. Seeds from TERRITORY_SEED on first load.
// Grouped by region. Inline add/edit/delete. Rep dropdown shows all non-disabled users
// (reps + player-coaches like Eileen and Nick). Changes save immediately to Firebase.

"use client";

import { useEffect, useState } from "react";
import {
  subscribeToTerritories,
  addTerritory,
  updateTerritory,
  deleteTerritory,
  initializeTerritoriesIfNeeded,
} from "@/lib/firebase/config";
import { getAllUsersAdmin } from "@/lib/firebase/users";
import { ALL_REGIONS } from "@/lib/forecast/regionConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TerritoryEntry, AppUser } from "@/types";

const REGION_COLORS: Record<string, string> = {
  INSIDE:     "bg-blue-100 text-blue-700",
  TX:         "bg-orange-100 text-orange-700",
  EAST:       "bg-green-100 text-green-700",
  CENTRAL:    "bg-purple-100 text-purple-700",
  EILEEN:     "bg-pink-100 text-pink-700",
  CALIFORNIA: "bg-yellow-100 text-yellow-700",
  CANADA:     "bg-teal-100 text-teal-700",
};

interface EditForm {
  territory: string;
  region: string;
  repId: string;   // "" means null (Open)
  stateCode: string;
  notes: string;
}

const BLANK_FORM: EditForm = {
  territory: "",
  region: ALL_REGIONS[0],
  repId: "",
  stateCode: "",
  notes: "",
};

function entryToForm(t: TerritoryEntry): EditForm {
  return {
    territory: t.territory,
    region: t.region,
    repId: t.repId ?? "",
    stateCode: t.stateCode ?? "",
    notes: t.notes ?? "",
  };
}

export function StateRepAssignment() {
  const [territories, setTerritories] = useState<TerritoryEntry[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(BLANK_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Add state
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<EditForm>(BLANK_FORM);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  // Deleting
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    // Load users, then seed territories if needed, then subscribe
    getAllUsersAdmin().then(async (allUsers) => {
      setUsers(allUsers);
      await initializeTerritoriesIfNeeded(allUsers);
      setLoading(false);
    });

    const unsub = subscribeToTerritories((data) => {
      setTerritories(data);
      setLoading(false);
    });

    return unsub;
  }, []);

  // ── Edit ─────────────────────────────────────────────────────────────────

  function startEdit(t: TerritoryEntry) {
    setEditingId(t.id);
    setEditForm(entryToForm(t));
    setEditError("");
    setShowAdd(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError("");
  }

  async function handleSaveEdit(id: string) {
    if (!editForm.territory.trim()) {
      setEditError("Territory name is required");
      return;
    }
    setEditSaving(true);
    setEditError("");
    try {
      const updates: Partial<Omit<TerritoryEntry, "id">> = {
        territory: editForm.territory.trim(),
        region: editForm.region,
        repId: editForm.repId || null,
        stateCode: editForm.stateCode.trim().toUpperCase() || undefined,
        notes: editForm.notes.trim() || undefined,
      };
      await updateTerritory(id, updates);
      setEditingId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setEditSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteTerritory(id);
      if (editingId === id) setEditingId(null);
    } finally {
      setDeletingId(null);
    }
  }

  // ── Add ───────────────────────────────────────────────────────────────────

  function openAdd() {
    setShowAdd(true);
    setAddForm(BLANK_FORM);
    setAddError("");
    setEditingId(null);
  }

  async function handleAdd() {
    if (!addForm.territory.trim()) {
      setAddError("Territory name is required");
      return;
    }
    setAddSaving(true);
    setAddError("");
    try {
      await addTerritory({
        territory: addForm.territory.trim(),
        region: addForm.region,
        repId: addForm.repId || null,
        stateCode: addForm.stateCode.trim().toUpperCase() || undefined,
        notes: addForm.notes.trim() || undefined,
      });
      setShowAdd(false);
      setAddForm(BLANK_FORM);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setAddSaving(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  // All active (non-disabled) users for rep dropdown — includes player-coaches
  const activeUsers = users.filter((u) => !u.disabled);

  // Group territories by region (ordered per ALL_REGIONS, then any extras)
  const byRegion: Record<string, TerritoryEntry[]> = {};
  for (const region of ALL_REGIONS) byRegion[region] = [];
  for (const t of territories) {
    if (!byRegion[t.region]) byRegion[t.region] = [];
    byRegion[t.region].push(t);
  }
  // Sort entries within each region by territory name
  for (const list of Object.values(byRegion)) {
    list.sort((a, b) => a.territory.localeCompare(b.territory));
  }

  const totalTerritories = territories.length;
  const assignedCount = territories.filter((t) => t.repId).length;

  // ── Render helpers ────────────────────────────────────────────────────────

  function RepSelect({
    value,
    onChange,
    className,
  }: {
    value: string;
    onChange: (v: string) => void;
    className?: string;
  }) {
    return (
      <select
        className={`rounded-md border border-input bg-white px-2 py-1 text-sm h-8 ${className ?? ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— Open (unassigned) —</option>
        {activeUsers.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} · {u.role} · {u.region}
          </option>
        ))}
      </select>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {assignedCount} of {totalTerritories} territories assigned to a rep
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ambiguous states (VA, CA, TX) flag customers Unassigned on bulk import — assign manually via Single Rep mode.
          </p>
        </div>
        <Button size="sm" onClick={openAdd} disabled={showAdd}>
          + Add territory
        </Button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 space-y-3">
          <h3 className="text-sm font-medium">New territory</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Territory name *</label>
              <Input
                className="h-8 text-sm"
                placeholder="e.g. North East California"
                value={addForm.territory}
                onChange={(e) => setAddForm((f) => ({ ...f, territory: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Region *</label>
              <select
                className="w-full rounded-md border border-input bg-white px-2 py-1 text-sm h-8"
                value={addForm.region}
                onChange={(e) => setAddForm((f) => ({ ...f, region: e.target.value }))}
              >
                {ALL_REGIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Rep (optional)</label>
              <RepSelect
                value={addForm.repId}
                onChange={(v) => setAddForm((f) => ({ ...f, repId: v }))}
                className="w-full"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">State code (for CSV fallback)</label>
              <Input
                className="h-8 text-sm font-mono"
                placeholder="e.g. CA, TX, NY"
                value={addForm.stateCode}
                maxLength={3}
                onChange={(e) => setAddForm((f) => ({ ...f, stateCode: e.target.value.toUpperCase() }))}
              />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-xs text-muted-foreground">Notes (optional)</label>
              <Input
                className="h-8 text-sm"
                placeholder="e.g. specific accounts, special instructions"
                value={addForm.notes}
                onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          {addError && <p className="text-xs text-red-600">{addError}</p>}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!addForm.territory.trim() || addSaving}
              onClick={handleAdd}
            >
              {addSaving ? "Adding…" : "Add territory"}
            </Button>
            <button
              onClick={() => setShowAdd(false)}
              className="rounded border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Territory groups by region */}
      {ALL_REGIONS.map((region) => {
        const entries = byRegion[region] ?? [];
        const colorClass = REGION_COLORS[region] ?? "bg-zinc-100 text-zinc-700";

        return (
          <div key={region} className="rounded-lg border bg-white overflow-hidden">
            {/* Region header */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-zinc-50">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
                {region}
              </span>
              <span className="text-xs text-muted-foreground">
                {entries.filter((t) => t.repId).length} / {entries.length} assigned
              </span>
            </div>

            {entries.length === 0 && (
              <div className="px-4 py-3 text-xs text-muted-foreground italic">
                No territories in this region yet. Use + Add territory above.
              </div>
            )}

            {entries.map((t) => {
              const isEditing = editingId === t.id;
              const repUser = activeUsers.find((u) => u.id === t.repId);

              return (
                <div key={t.id} className="border-b last:border-b-0">
                  {/* ── Display row ──────────────────────────────────────── */}
                  {!isEditing && (
                    <div className="grid grid-cols-[2fr_2fr_1fr_auto] gap-3 px-4 py-2.5 items-center">
                      <div>
                        <p className="text-sm font-medium">{t.territory}</p>
                        {t.notes && (
                          <p className="text-xs text-muted-foreground truncate max-w-xs">{t.notes}</p>
                        )}
                      </div>
                      <div>
                        {repUser ? (
                          <p className="text-sm">{repUser.name}</p>
                        ) : (
                          <p className="text-sm text-amber-600 italic">Open</p>
                        )}
                      </div>
                      <div>
                        {t.stateCode ? (
                          <span className="inline-block font-mono text-xs rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-600">
                            {t.stateCode}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex gap-1.5 justify-end">
                        <button
                          onClick={() => startEdit(t)}
                          className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          disabled={deletingId === t.id}
                          className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
                        >
                          {deletingId === t.id ? "…" : "Delete"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Edit row ─────────────────────────────────────────── */}
                  {isEditing && (
                    <div className="px-4 py-3 bg-blue-50/40 border-l-2 border-blue-400 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Territory name</label>
                          <Input
                            className="h-8 text-sm"
                            value={editForm.territory}
                            onChange={(e) => setEditForm((f) => ({ ...f, territory: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Region</label>
                          <select
                            className="w-full rounded-md border border-input bg-white px-2 py-1 text-sm h-8"
                            value={editForm.region}
                            onChange={(e) => setEditForm((f) => ({ ...f, region: e.target.value }))}
                          >
                            {ALL_REGIONS.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Rep</label>
                          <RepSelect
                            value={editForm.repId}
                            onChange={(v) => setEditForm((f) => ({ ...f, repId: v }))}
                            className="w-full"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">State code</label>
                          <Input
                            className="h-8 text-sm font-mono"
                            placeholder="e.g. CA"
                            value={editForm.stateCode}
                            maxLength={3}
                            onChange={(e) => setEditForm((f) => ({ ...f, stateCode: e.target.value.toUpperCase() }))}
                          />
                        </div>
                        <div className="space-y-1 col-span-2">
                          <label className="text-xs text-muted-foreground">Notes</label>
                          <Input
                            className="h-8 text-sm"
                            value={editForm.notes}
                            onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                          />
                        </div>
                      </div>
                      {editError && <p className="text-xs text-red-600">{editError}</p>}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 px-2.5 text-xs"
                          disabled={editSaving}
                          onClick={() => handleSaveEdit(t.id)}
                        >
                          {editSaving ? "Saving…" : "Save"}
                        </Button>
                        <button
                          onClick={cancelEdit}
                          className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
