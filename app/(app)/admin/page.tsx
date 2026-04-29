// app/(app)/admin/page.tsx — Admin panel: four tabs.
// Users: create / disable / enable users.
// Territory Map: assign states to reps — must be configured before bulk CSV import.
// CSV Import: bulk (auto-assign by state→rep) + single-rep, plus import history below.
// Config: read-only reference for stages, procedure tiers, and deal structures.
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
import { ConfigEditor } from "@/components/admin/ConfigEditor";

type Tab = "users" | "territory" | "import" | "config";

const TABS: { id: Tab; label: string }[] = [
  { id: "users",     label: "Users" },
  { id: "territory", label: "Territory Map" },
  { id: "import",    label: "CSV Import" },
  { id: "config",    label: "Config" },
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
    <div className="mx-auto max-w-5xl px-6 py-6 space-y-4">
      <h1 className="text-lg font-semibold">Admin</h1>

      {/* Tab bar */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              tab === id
                ? "bg-zinc-800 text-white border-zinc-800"
                : "border-zinc-200 text-muted-foreground hover:border-zinc-400"
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

      {/* Config — read-only taxonomy reference */}
      {tab === "config" && <ConfigEditor />}
    </div>
  );
}
