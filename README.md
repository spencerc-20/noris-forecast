# Noris Monthly Forecast Tool

Internal sales forecasting tool for Noris Medical. Built on Next.js 15, Firebase Realtime DB, and Vercel.

## Auth model (deliberate product decision)

This tool uses an intentionally simple "email-as-password" auth scheme:

1. The login page lists all active reps by name (pulled from `/users` in the Realtime DB, excluding `disabled: true` accounts).
2. A rep clicks their name → a modal appears asking "Enter your email to sign in."
3. The system calls `signInWithEmailAndPassword(auth, email, email)` — the **password is the email address**.
4. When an admin creates a user, they set the Firebase Auth password to the user's email.
5. On match → user is logged in and routed based on role. On mismatch → error is shown.

**Why this scheme?**
- Reps don't need to remember a separate password.
- The org controls all accounts through the admin panel.
- `disabled: true` immediately blocks access for former reps without a password reset flow.
- Login attempts are logged to `/loginLog/{userId}/{timestamp}` for forensic use.

**Limitations + upgrade path:**
- Anyone who knows a rep's email can attempt to log in. Mitigated by: (a) not publishing the URL widely, (b) `disabled` flag for ex-reps, (c) login log for forensics.
- V1.5 plan: upgrade to magic-link or Google SSO via Firebase Auth — same `useAuth()` hook, no other changes needed.

**Admin creates a user:**
```
Firebase Console → Authentication → Users → Add user
  Email: rep@norismedical.com
  Password: rep@norismedical.com
Then add to Realtime DB at /forecast_v1/users/{uid}:
  { name, email, role, region, managerId, disabled: false, createdAt }
```

## Development

```bash
npm run dev
```

Requires `.env.local` with Firebase config (see `.env.local.example`).

## Stack

- **Framework:** Next.js 15 (App Router, TypeScript)
- **Database + Auth:** Firebase Realtime Database, Firebase Auth
- **UI:** shadcn/ui + Tailwind CSS
- **Icons:** lucide-react
- **Charts:** recharts (sparklines + bar charts)
- **Dates:** date-fns
- **CSV:** papaparse
- **Hosting:** Vercel

## Session roadmap

| Session | Focus |
|---|---|
| 1 (this) | Scaffolding, types, auth, routes, Vercel deploy |
| 2 | Rep dashboard list view |
| 3 | Deal CRUD + Firebase + edit history |
| 4 | Customer CRUD + all fields + computed fields |
| 5 | Customer detail page |
| 6 | Snapshot logic + ForecastHeader |
| 7 | Manager + VP views |
| 8 | Portfolio view + upsell lists |
| 9 | Existing / Inactive / Lost views |
| 10 | Admin panel + CSV importer |
| 11 | Polish + mobile QA |
| 12 | Rep onboarding |

## Key rules for future-Spencer or his replacement

- **All Firebase calls go through `/lib/firebase/*`** — never import Firebase directly in components.
- **Modular v9+ SDK only** — `import { get, ref } from "firebase/database"`, not `firebase.database()...`.
- **Percentages are 0-100 integers** — never 0-1 decimals.
- **Currency via `Intl.NumberFormat`**, dates via `date-fns`.
- **No localStorage/sessionStorage** — React state, Firebase, or URL params only.
- **Server components by default** — `"use client"` only when state/event handlers needed.
- See `CLAUDE.md` for full architecture spec.
