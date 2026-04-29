// app/(app)/customers/layout.tsx — Sub-navigation for all /customers/* pages.
// Individual customer detail pages (/customers/[customerId]) suppress the tab bar.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/customers", label: "All" },
  { href: "/customers/lost", label: "Lost" },
  { href: "/customers/inactive", label: "Inactive" },
  { href: "/customers/portfolio", label: "Portfolio" },
];

export default function CustomersLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Don't show tabs on individual customer detail pages
  const isDetailPage =
    pathname !== "/customers" &&
    !pathname.startsWith("/customers/lost") &&
    !pathname.startsWith("/customers/inactive") &&
    !pathname.startsWith("/customers/portfolio");

  return (
    <div>
      {!isDetailPage && (
        <div className="border-b bg-white px-6">
          <nav className="flex gap-0 -mb-px">
            {TABS.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-4 py-3 text-sm border-b-2 transition-colors ${
                    active
                      ? "border-zinc-800 font-medium text-zinc-900"
                      : "border-transparent text-zinc-500 hover:text-zinc-800"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
      {children}
    </div>
  );
}
