// app/(app)/customers/page.tsx — Customer list.
// Rep: sees own customers (ownerId = uid).
// Manager / VP / Admin: sees ALL customers across all reps.

"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  subscribeToUserCustomers,
  subscribeToAllCustomers,
} from "@/lib/firebase/customers";
import { useAuth } from "@/lib/firebase/auth";
import { isAdmin, isManager, isVP } from "@/lib/permissions/roles";
import { CustomerList } from "@/components/customers/CustomerList";
import { CustomerCreateModal } from "@/components/customers/CustomerCreateModal";
import { Button } from "@/components/ui/button";
import type { Customer } from "@/types";

export default function CustomersPage() {
  const { appUser } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

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

  const isRep = !isAdmin(appUser) && !isManager(appUser) && !isVP(appUser);
  const heading = isRep ? "My Customers" : "All Customers";

  return (
    <>
      <div className="mx-auto max-w-5xl px-6 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">{heading}</h1>
          {/* Only reps create customers directly; admins use CSV import */}
          {isRep && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={14} className="mr-1.5" />
              New customer
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600" />
          </div>
        ) : (
          <CustomerList customers={customers} />
        )}
      </div>

      {isRep && (
        <CustomerCreateModal
          open={createOpen}
          ownerId={appUser.id}
          region={appUser.region}
          onClose={() => setCreateOpen(false)}
          onSuccess={() => setCreateOpen(false)}
        />
      )}
    </>
  );
}
