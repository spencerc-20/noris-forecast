// app/(app)/customers/inactive/page.tsx — Inactive customers: auto-flagged churned accounts.
// Rep: own inactive customers. Manager / VP / Admin: all inactive customers.

"use client";

import { useEffect, useState } from "react";
import {
  subscribeToUserCustomers,
  subscribeToAllCustomers,
} from "@/lib/firebase/customers";
import { useAuth } from "@/lib/firebase/auth";
import { isAdmin, isManager, isVP } from "@/lib/permissions/roles";
import { InactiveList } from "@/components/customers/InactiveList";
import type { Customer } from "@/types";

export default function InactiveCustomersPage() {
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
    <div className="mx-auto max-w-5xl px-6 py-6 space-y-4">
      <h1 className="text-lg font-semibold">Inactive Customers</h1>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600" />
        </div>
      ) : (
        <InactiveList customers={customers} />
      )}
    </div>
  );
}
