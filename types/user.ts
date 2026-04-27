// types/user.ts — User interface for forecast_v1/users/{userId}

import type { UserRole } from "./taxonomy";

export interface AppUser {
  id: string; // Firebase Auth UID (also the Realtime DB key)
  name: string; // Display name, e.g. "Sarah M."
  email: string; // Also used as password in the email-as-password auth scheme
  role: UserRole;
  region: string;
  managerId: string | null; // userId of manager; null for VPs and admin
  /**
   * When true, the user cannot authenticate. Set by admin when a rep leaves.
   * Checked at auth.ts level — signIn() rejects disabled users before Firebase call.
   */
  disabled: boolean;
  createdAt: number; // Unix timestamp ms
  lastLoginAt: number | null;
}
