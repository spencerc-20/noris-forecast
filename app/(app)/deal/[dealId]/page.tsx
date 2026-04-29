// app/(app)/deal/[dealId]/page.tsx — Loads the deal from Firebase, delegates all UI to DealDetail.

"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import type { Deal } from "@/types";
import { getDeal, updateDeal, deleteDeal } from "@/lib/firebase/deals";
import { useAuth } from "@/lib/firebase/auth";
import { isManager, isAdmin } from "@/lib/permissions/roles";
import { DealDetail } from "@/components/forecast/DealDetail";

export default function DealDetailPage({
  params,
}: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = use(params);
  const router = useRouter();
  const { appUser } = useAuth();

  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDeal(dealId).then((d) => {
      setDeal(d);
      setLoading(false);
    });
  }, [dealId]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600" />
      </div>
    );
  }

  if (!deal || !appUser) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <p className="text-muted-foreground">Deal not found.</p>
      </div>
    );
  }

  const canSeeFullHistory = isManager(appUser) || isAdmin(appUser);

  async function handleSave(updates: Partial<Deal>, overrideReason?: string) {
    await updateDeal(dealId, updates, appUser!.id, deal!, overrideReason);
    setDeal((prev) => (prev ? { ...prev, ...updates } : prev));
  }

  async function handleDelete() {
    await deleteDeal(dealId, appUser!.id);
    router.replace("/dashboard");
  }

  return (
    <DealDetail
      deal={deal}
      dealId={dealId}
      canSeeFullHistory={canSeeFullHistory}
      onSave={handleSave}
      onDelete={handleDelete}
    />
  );
}
