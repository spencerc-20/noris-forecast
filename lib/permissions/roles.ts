// lib/permissions/roles.ts — Role-based access helpers.
// These are client-side guards for UI decisions. Firebase security rules are the enforcement layer.

import type { AppUser } from "@/types";

export const isRep = (user: AppUser) => user.role === "rep";
export const isManager = (user: AppUser) => user.role === "manager";
export const isVP = (user: AppUser) => user.role === "vp";
export const isAdmin = (user: AppUser) => user.role === "admin";

/** True if viewer can see the target rep's dashboard (own data, or manager/VP/admin). */
export function canViewRep(viewer: AppUser, targetUserId: string): boolean {
  if (viewer.id === targetUserId) return true;
  if (isAdmin(viewer) || isVP(viewer) || isManager(viewer)) return true;
  return false;
}

/** True if viewer can see data for the given region. */
export function canViewRegion(viewer: AppUser, region: string): boolean {
  if (isAdmin(viewer) || isVP(viewer)) return true;
  if (isManager(viewer) && viewer.region === region) return true;
  return false;
}

/** Default landing route based on role. */
export function defaultRoute(user: AppUser): string {
  // Admins land on the region picker so they can drill into any region; the
  // /admin tab is still one click away in the topbar.
  if (isAdmin(user)) return "/region";
  if (isVP(user)) return "/region";
  if (isManager(user)) return "/team";
  return "/dashboard";
}
