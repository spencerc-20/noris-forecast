// app/(app)/layout.tsx — Authenticated shell. Redirects to /login if not signed in.
// Client component required for useAuth() hook and router redirect.

"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  Globe,
  Settings,
  LogOut,
  BarChart3,
} from "lucide-react";
import { useAuth, signOut } from "@/lib/firebase/auth";
import { isAdmin, isManager, isVP } from "@/lib/permissions/roles";
import { Button } from "@/components/ui/button";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, appUser, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600" />
      </div>
    );
  }

  if (!user || !appUser) return null; // awaiting redirect

  const navLinks = [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      show: true,
    },
    {
      href: "/team",
      label: "Team",
      icon: Users,
      show: isManager(appUser) || isVP(appUser) || isAdmin(appUser),
    },
    {
      href: "/region",
      label: "Region",
      icon: Globe,
      show: isVP(appUser) || isAdmin(appUser),
    },
    {
      href: "/customers",
      label: "Customers",
      icon: BarChart3,
      show: true,
    },
    {
      href: "/admin",
      label: "Admin",
      icon: Settings,
      show: isAdmin(appUser),
    },
  ].filter((l) => l.show);

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <header className="sticky top-0 z-40 border-b bg-white">
        <div className="flex h-12 items-center justify-between px-6">
          {/* Brand + nav */}
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold tracking-tight">
              Noris Forecast
            </span>
            <nav className="flex items-center gap-0.5">
              {navLinks.map(({ href, label, icon: Icon }) => {
                const active =
                  pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? "bg-zinc-100 font-medium text-zinc-900"
                        : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* User + sign out */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{appUser.name}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
            >
              <LogOut size={12} />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
