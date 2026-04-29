// app/(app)/customers/lost/page.tsx — Lost customers: win-back queue + coaching log.
// Rep: own lost customers. Manager / VP / Admin: all lost customers.

"use client";

import { useEffect, useState } from "react";
import {
  subscribeToUserCustomers,
  subscribeToAllCustomers,
} from "@/lib/firebase/customers";
import { useAuth } from "@/lib/firebase/auth";
import { isAdmin, isManager, isVP } from "@/lib/permissions/roles";
import { WinBackQueue } from "@/components/customers/WinBackQueue";
import { LostCoachingLog } from "@/components/customers/LostCoachingLog";
import type { Customer } from "@/types";

export default function LostCustomersPage() {
  const { appUser } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appUser) return;
    const canSeeAll = isAdmin(appUser) || isManager(appUser) || isVP(appUser);
    const handler = (data: Customer[]) => {
      setCustomers(data);
      setLoading(false);
    };
    const unsub = canSeeAll
      ? subscribeToAllCustomers(handler)
      : subscribeToUserCustomers(appUser.id, handler);
    return unsub;
  }, [appUser]);

  if (!appUser) return null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-6 space-y-6">
      <h1 className="text-lg font-semibold">Lost Customers</h1>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600" />
        </div>
      ) : (
        <>
          <WinBackQueue customers={customers} />
          <LostCoachingLog customers={customers} />
        </>
      )}
    </div>
  );
}
