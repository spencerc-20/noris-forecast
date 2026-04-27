// app/(app)/layout.tsx — Authenticated layout. Redirects unauthenticated users to /login.
// Role-based redirect: reps → /dashboard, managers → /team, VPs → /region, admin → /admin.
// TODO: implement redirect logic in Session 1

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // TODO: check auth state, redirect if not authenticated
  return <>{children}</>;
}
