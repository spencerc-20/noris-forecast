// components/admin/UserManagement.tsx — Create, view, and disable/enable users.

"use client";

import { useEffect, useState } from "react";
import { getAllUsersAdmin, createUser, setUserDisabled, type CreateUserData } from "@/lib/firebase/users";
import { ALL_REGIONS } from "@/lib/forecast/regionConfig";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { AppUser } from "@/types";

const ROLES: AppUser["role"][] = ["rep", "manager", "vp", "admin"];

const ROLE_LABELS: Record<AppUser["role"], string> = {
  rep: "Rep",
  manager: "Manager",
  vp: "VP",
  admin: "Admin",
};

export function UserManagement() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [createError, setCreateError] = useState("");

  // Create form state
  const [form, setForm] = useState<CreateUserData>({
    name: "",
    email: "",
    role: "rep",
    region: ALL_REGIONS[0],
    managerId: null,
  });

  async function reload() {
    setLoading(true);
    const data = await getAllUsersAdmin();
    setUsers(data);
    setLoading(false);
  }

  useEffect(() => { reload(); }, []);

  async function handleCreate() {
    if (!form.name.trim() || !form.email.trim()) return;
    setActing("create");
    setCreateError("");
    try {
      await createUser(form);
      setShowCreate(false);
      setForm({ name: "", email: "", role: "rep", region: ALL_REGIONS[0], managerId: null });
      await reload();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setActing(null);
    }
  }

  async function handleToggleDisabled(user: AppUser) {
    setActing(user.id);
    try {
      await setUserDisabled(user.id, !user.disabled);
      await reload();
    } finally {
      setActing(null);
    }
  }

  const managers = users.filter((u) => u.role === "manager" || u.role === "vp");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{users.length} users total</p>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "+ New user"}
        </Button>
      </div>

      {/* Create user form */}
      {showCreate && (
        <div className="rounded-lg border bg-zinc-50 p-4 space-y-3">
          <h3 className="text-sm font-medium">New user</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Name</label>
              <Input
                className="h-8 text-sm"
                placeholder="Dr. Sarah M."
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Email (also used as password)</label>
              <Input
                className="h-8 text-sm"
                type="email"
                placeholder="sarah@practice.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Role</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm h-8"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AppUser["role"] }))}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Region</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm h-8"
                value={form.region}
                onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
              >
                {ALL_REGIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            {form.role === "rep" && managers.length > 0 && (
              <div className="space-y-1 col-span-2">
                <label className="text-xs text-muted-foreground">Manager (optional)</label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm h-8"
                  value={form.managerId ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, managerId: e.target.value || null }))}
                >
                  <option value="">None</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.region})</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {createError && <p className="text-xs text-red-600">{createError}</p>}
          <Button
            size="sm"
            disabled={!form.name.trim() || !form.email.trim() || acting === "create"}
            onClick={handleCreate}
          >
            {acting === "create" ? "Creating…" : "Create user"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Password will be set to their email address. They can use it to sign in immediately.
          </p>
        </div>
      )}

      {/* User table */}
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600" />
        </div>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="grid grid-cols-[2fr_2fr_1fr_1fr_80px] gap-3 px-4 py-2 border-b bg-zinc-50 text-xs font-medium text-muted-foreground">
            <div>Name</div>
            <div>Email</div>
            <div>Role</div>
            <div>Region</div>
            <div />
          </div>
          {users.map((u) => (
            <div
              key={u.id}
              className={`grid grid-cols-[2fr_2fr_1fr_1fr_80px] gap-3 px-4 py-3 border-b last:border-b-0 items-center ${
                u.disabled ? "opacity-40" : ""
              }`}
            >
              <div>
                <p className="text-sm font-medium">{u.name}</p>
                {u.disabled && <p className="text-xs text-muted-foreground">Disabled</p>}
              </div>
              <p className="text-sm text-muted-foreground truncate">{u.email}</p>
              <p className="text-sm">{ROLE_LABELS[u.role]}</p>
              <p className="text-sm text-muted-foreground">{u.region}</p>
              <button
                onClick={() => handleToggleDisabled(u)}
                disabled={acting === u.id}
                className={`rounded border px-2 py-1 text-xs disabled:opacity-50 ${
                  u.disabled
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                }`}
              >
                {acting === u.id ? "…" : u.disabled ? "Enable" : "Disable"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
