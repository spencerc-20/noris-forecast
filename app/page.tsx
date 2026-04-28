// app/page.tsx — Root redirect. Sends authenticated users to their role-based default route,
// unauthenticated users to /login.

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase/auth";
import { defaultRoute } from "@/lib/permissions/roles";

export default function RootPage() {
  const router = useRouter();
  const { user, appUser, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (appUser) {
      router.replace(defaultRoute(appUser));
    }
    // If user exists but appUser hasn't loaded yet, wait for next effect run
  }, [user, appUser, loading, router]);

  return null;
}
