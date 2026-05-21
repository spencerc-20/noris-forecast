// app/(app)/admin/page.tsx — Admin panel: three tabs (REVAMP v2.0).
// Users: create / disable / enable users.
// Territory Map: assign states to reps — must be configured before bulk CSV import.
// CSV Import: bulk (auto-assign by state→rep) + single-rep, plus import history below.
// (The "Config" tab was removed — it documented the deal-era taxonomy that no longer exists.)
// Restricted to users with role "admin". Redirects others to /dashboard.

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase/auth";
import { isAdmin } from "@/lib/permissions/roles";
import { UserManagement } from "@/components/admin/UserManagement";
import { StateRepAssignment } from "@/components/admin/StateRepAssignment";
import { CsvImporter } from "@/components/admin/CsvImporter";
import { ImportHistory } from "@/components/admin/ImportHistory";

type Tab = "users" | "territory" | "import";

const TABS: { id: Tab; label: string }[] = [
  { id: "users",     label: "Users" },
  { id: "territory", label: "Territory Map" },
  { id: "import",    label: "CSV Import" },
];

export default function AdminPage() {
  const router = useRouter();
  const { appUser, loading } = useAuth();
  // Territory Map is the default — it must be configured before bulk import works.
  const [tab, setTab] = useState<Tab>("territory");

  useEffect(() => {
    if (!loading && appUser && !isAdmin(appUser)) {
      router.replace("/dashboard");
    }
  }, [appUser, loading, router]);

  if (loading || !appUser) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600" />
      </div>
    );
  }

  if (!isAdmin(appUser)) return null;

  return (
    <div className="mx-auto max-w-5xl px-[22px] py-7 space-y-5">
      <h1 className="text-[18px] font-semibold text-[color:var(--text-spec)] leading-tight">
        Admin
      </h1>

      {/* Tab bar */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${
              tab === id
                ? "bg-[color:var(--noris)] text-white border-[color:var(--noris)]"
                : "border-[color:var(--border-spec)] text-[color:var(--muted-spec)] hover:text-[color:var(--text-spec)] hover:border-[color:var(--muted-spec)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Users */}
      {tab === "users" && <UserManagement />}

      {/* Territory Map — configure state→rep assignments before running bulk import */}
      {tab === "territory" && <StateRepAssignment />}

      {/* CSV Import + history below */}
      {tab === "import" && (
        <div className="space-y-8">
          <CsvImporter />
          <div>
            <h2 className="text-sm font-semibold mb-3">Import history</h2>
            <ImportHistory />
          </div>
        </div>
      )}
    </div>
  );
}
