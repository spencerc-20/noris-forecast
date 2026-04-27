# Noris Monthly Forecast Tool — Architecture (v1.3)

**Status:** V1 spec, pre-build
**Owner:** Spencer (Sales Ops)
**Stack target:** Next.js 15 + Tailwind + Firebase Realtime DB + Vercel
**Changelog:**
- v1.1 — two-layer deal classification + customer profile derivation
- v1.2 — added customer fields per regional management request: lifecycle, lead temperature, contact info, current systems, Noris use, primary pain point, customer/deal meeting rollup
- v1.3 — split lifecycle status (sales) from commission status (commission). Added `inactive` lifecycle, annual revenue history for CSV import, state→region auto-mapping, inline customer creation from deal flow.

---

## 1. Purpose

A monthly sales forecasting tool for Noris Medical reps and regional managers. Reps update their pipeline continuously; the system frames it as a monthly forecast that managers review weekly. The killer feature is **forecast drift visibility** — managers can see at a glance how a rep's number has moved from month-start to today.

Secondary goals:
- **Customer portfolio intelligence** — surface what each customer buys (Course-only → Everything tier)
- **Lead temperature tracking** — surface where reps are getting traction vs stalling
- **Churn detection** — automatically identify customers who fell off
- **Commission-grade audit trail** — commission status is computed deterministically and stored per year for verification
- **Pain point reporting** (V2) — once enough free text accumulates, convert to pick-lists for trend analysis

This is **not** a CRM replacement. It's a forecast and pipeline review layer.

---

## 2. Core concepts

### 2.1 Soft commit model
- No "lock and commit" ritual. Reps update deals continuously.
- The **first weekly snapshot of each month** auto-tags as `month_start`.
- Every view shows **Month-Start Forecast** vs **Current Forecast** side by side.
- Sparkline shows weekly forecast trajectory across the month.
- Drift is automatic accountability — no rep ritual required.

### 2.2 Hybrid probability
- Each deal stage has a default close probability.
- Reps can override per deal.
- Overrides >±10% from stage default require a written reason (min 20 chars).
- Override indicator pill appears on the row for manager visibility.

### 2.3 Two-layer deal classification
Every deal has TWO independent tags:
- **Layer 1: Procedure tier** (clinical/product family — drives customer profile)
- **Layer 2: Deal structure** (how the deal is sold)

See section 4.

### 2.4 Customer status — two fields, unified display

Customers have **two separate status fields**:

- **`lifecycleStatus`** — sales-side semantics, rep-managed (potential / new / existing / inactive / lost)
- **`commissionStatus`** — commission-side semantics, system-computed per year from order history

These exist as distinct fields for **audit-grade integrity** (commission decisions need deterministic, recomputable values), but the UI displays them together as a single "Status" widget so reps don't think about two concepts.

See sections 4.3 and 4.4.

### 2.5 Three-dimensional customer classification (separate from status)
On top of status, every customer also carries:
- **Lead temperature** — how warm right now (Cold / Warm / Hot / Engaged) [rep-managed]
- **Customer profile** — what tier of cases they do (auto-derived from deal history)

### 2.6 Forecast-eligible vs pipeline-only
Forecast-eligible deal structures count toward the $ forecast: Standalone, Package, Bulk order, Combo.
Pipeline-only structures are tracked but excluded: Trial surgery, Mentorship.

Pipeline-only deals can link to a forecast-eligible deal they're feeding.

### 2.7 Weighted value
- `dealValue` (raw $)
- `closeProbability` (% — stage default or override)
- `weightedValue` = `dealValue * closeProbability / 100`

Forecast totals always use weighted value.

### 2.8 Default deal scope
Default view: current month + next month. Toggle to extend to 3-4 months. Closed Won/Lost deals drop out of default view.

### 2.9 Meeting rollup
Meetings logged at the **deal level**. Customer-level `lastMeetingDate`/`nextMeetingDate` are **derived** from the most recent / next meeting across the customer's deals.

### 2.10 Annual revenue history
Customers carry a `annualRevenue` map (`{year: $}`) populated on import from CSV. Used to:
- Auto-classify lifecycle status on import
- Detect inactive customers
- Compute commission status (which depends on prior-year orders)
- Power churn reporting

---

## 3. Stages and probabilities

| Stage | ID | Default % |
|---|---|---|
| Lead | `lead` | 10% |
| Discovery | `discovery` | 25% |
| Quoted | `quoted` | 50% |
| Verbal | `verbal` | 75% |
| Closed Won | `won` | 100% |
| Closed Lost | `lost` | 0% |

---

## 4. Taxonomies

### 4.1 Procedure tier (deal Layer 1) — hierarchical, highest wins

| Tier | ID | Definition |
|---|---|---|
| 1 | `everything` | Full-arch case using zygomatic and/or pterygoid implants |
| 2 | `full_arch` | Full-arch case without zygo/ptery |
| 3 | `ra_only` | Uses zygo and/or ptery, NOT in a full-arch case |
| 4 | `standard` | Single-tooth, partials, routine implant business |
| 5 | `course` | Education only — courses, training |
| 6 | `tools` | Tools, supplies, instruments, no implants |

V1: Reps pick the tier directly from a dropdown. V2: derive from line items.

### 4.2 Deal structure (deal Layer 2) — non-hierarchical

| Structure | ID | Forecast-eligible? |
|---|---|---|
| Standalone | `standalone` | Yes |
| Package | `package` | Yes |
| Bulk order | `bulk` | Yes |
| Combo (course + clinical) | `combo` | Yes |
| Trial surgery | `trial` | No — leading indicator |
| Mentorship | `mentorship` | No — leading indicator |

### 4.3 Lifecycle status — sales-side, rep-managed

| Status | Meaning | Set by |
|---|---|---|
| `potential` | Cold name on a list, never engaged | Manual / import default |
| `new` | Warm prospect, actively engaged, hasn't bought yet | Manual (rep promotes from potential) |
| `existing` | Has at least one closed-won deal in the system OR had revenue in current year per import | Auto on first deal close; auto on import |
| `inactive` | Was a customer, no orders in current year, but had revenue in prior years | Auto-flagged on import + nightly check |
| `lost` | Manually declared churned with a reason | Manual (rep, with required `lostReason`) |

State transitions:
- `potential → new` — manual (rep moved to active engagement)
- `new → existing` — automatic (first deal closes won)
- `existing → inactive` — automatic (no orders in current calendar year)
- `inactive → existing` — automatic (next order)
- `inactive → lost` — manual (rep declares churn with reason)
- `existing → lost` — manual (rep declares churn with reason)
- `lost → new` — manual (win-back queue)

### 4.4 Commission status — commission-side, system-computed

Stored as a per-year map on the customer:

```typescript
commissionStatus: {
  [year: number]: "new" | "existing" | null
}
```

**Computation rule (deterministic):**
- `commissionStatus[year] = "new"` if customer ordered in `year` AND did NOT order in `year - 1`
- `commissionStatus[year] = "existing"` if customer ordered in both `year` AND `year - 1`
- `commissionStatus[year] = null` if no orders in `year`

"Ordered" means: any closed-won deal with `closedAt` in that year, OR `annualRevenue[year] > 0` from import.

**Recomputed when:**
- Import runs (full recompute for affected years)
- A deal moves to `won` (recompute that year and the following year)
- A `won` deal is reverted (rare; full recompute)

**Stored, not computed on read.**

### 4.5 Lead temperature — rep-managed

| Temperature | Meaning |
|---|---|
| `cold` | Default for `potential` customers. Minimal engagement. |
| `warm` | Engaged, exploratory conversations. |
| `hot` | Active deal in progress, decision imminent. |
| `engaged` | Deeply engaged customer doing repeat business or in a large deal. |

Rep updates manually. Independent from deal stage.

**Staleness flag:** if `temperature` hasn't been updated in 30+ days, UI shows it greyed out / with an age indicator. Manager dashboards surface "stale temperature" lists.

### 4.6 Customer profile — auto-derived from deal history

| Profile | Rule |
|---|---|
| `new` | No closed-won deals yet |
| `tools_only` | All closed-won deals are `tools` tier |
| `course_only` | All closed-won deals are `course` tier (or mix of `tools`+`course`) |
| `standard` | Has clinical deals; highest tier reached is `standard` |
| `ra_only` | Has clinical deals; highest tier reached is `ra_only` |
| `full_arch` | Has clinical deals; highest tier reached is `full_arch` |
| `everything` | Has at least one `everything` deal |

Profile = highest tier ever reached. **Never demotes.** Recomputes when any deal moves to `won`.

### 4.7 UI naming clarification

- "Status" in the UI = unified display of `lifecycleStatus` + `commissionStatus[currentYear]`
- "Temperature" = `leadTemperature`
- "Profile" = `profile`

---

## 5. Data model (Firebase Realtime DB)

Database root: `forecast_v1/`

```
forecast_v1/
├── users/
│   └── {userId}/
│       ├── name, email
│       ├── role: "rep" | "manager" | "vp" | "admin"
│       ├── region: string
│       ├── managerId: string | null
│       ├── disabled: boolean
│       └── createdAt, lastLoginAt
│
├── deals/
│   └── {dealId}/
│       ├── customerId, customerName (denormalized)
│       ├── ownerId, region (denormalized)
│       ├── procedureTier: "everything" | "full_arch" | "ra_only" | "standard" | "course" | "tools"
│       ├── dealStructure: "standalone" | "package" | "bulk" | "combo" | "trial" | "mentorship"
│       ├── isForecastEligible: boolean
│       ├── stage: "lead" | "discovery" | "quoted" | "verbal" | "won" | "lost"
│       ├── dealValue: number
│       ├── closeProbability: number (0-100)
│       ├── isOverride: boolean
│       ├── overrideReason: string | null
│       ├── expectedCloseDate: ISO date
│       ├── lastMeetingDate, nextMeetingDate
│       ├── linkedDealId: string | null
│       ├── notes
│       ├── decisionMaker
│       ├── createdAt, updatedAt
│       └── closedAt: timestamp | null
│
├── customers/
│   └── {customerId}/
│       ├── name
│       ├── practiceName
│       ├── address
│       ├── state
│       ├── phone
│       ├── email
│       ├── lifecycleStatus: "potential" | "new" | "existing" | "inactive" | "lost"
│       ├── commissionStatus: { [year: number]: "new" | "existing" | null }
│       ├── leadTemperature: "cold" | "warm" | "hot" | "engaged"
│       ├── temperatureUpdatedAt: timestamp
│       ├── profile: "new" | "tools_only" | "course_only" | "standard" | "ra_only" | "full_arch" | "everything"
│       ├── profileUpdatedAt: timestamp
│       ├── ownerId, region
│       ├── currentSystems: string
│       ├── norisImplantUse: string
│       ├── primaryPainPoint: string
│       ├── notes
│       ├── annualRevenue: { [year: number]: number }
│       ├── revenueDataSource: { [year: number]: "csv_import" | "live_deals" }
│       ├── firstOrderDate, lastOrderDate
│       ├── orderCadenceDays: number | null
│       ├── lastMeetingDate, nextMeetingDate    // DERIVED from deals — never write directly
│       ├── lostReason, lostCompetitor, lostDate, lostDealValue
│       ├── winBackQueueDate
│       ├── createdAt, createdBy
│       └── importBatchId: string | null
│
├── snapshots/
│   └── {userId}/
│       └── {YYYY-MM}/
│           ├── month_start/
│           ├── week_1/ ... week_5/
│
├── editHistory/
│   └── {dealId or customerId}/
│       └── {logId}/  { timestamp, userId, field, oldValue, newValue, reason }
│
├── loginLog/
│   └── {userId}/
│       └── {timestamp}/  { success, userAgent }
│
├── imports/
│   └── {importBatchId}/
│       ├── importedAt, importedBy, filename
│       ├── rowCount, successCount, errorCount
│       ├── errors: [...], columnMapping: {...}
│
└── config/
    ├── stages, procedureTiers, dealStructures
    ├── lifecycleStatuses, leadTemperatures
    ├── stateToRegionMap: { "CA": "West", "TX": "South", ... }
    └── currentMonth: "YYYY-MM"
```

---

## 5.1 Computed field logic

See architecture document for full pseudocode:
- `recomputeCustomerProfile` — highest tier won deal ever, never demotes
- `recomputeCustomerMeetings` — max(lastMeetingDate), min(future nextMeetingDate) across open deals
- `maybePromoteCustomerLifecycle` — promotes potential/new/inactive → existing on deal close
- `maybeFlagInactive` — flags existing → inactive if no current-year activity
- `recomputeCommissionStatus` — deterministic: ordered this year AND NOT last year = new; both = existing; neither = null

---

## 6. CSV import

Expected format: `customer_name,state,revenue_YYYY,...` plus optional contact fields.

Pipeline: validate → match-or-create → region auto-assign → populate annualRevenue → auto-classify lifecycle → compute commissionStatus → batch track.

---

## 7. State → Region mapping

Configurable in `/lib/forecast/regionConfig.ts`. Unmapped states → `"Unassigned"`.

---

## 8. Pages and views

### 8.1 Routes
```
/                       → role-based redirect
/login                  → name picker → email password modal
/dashboard              → rep's own pipeline
/dashboard/[userId]     → manager view of a rep
/team                   → manager view of region
/region                 → VP view of all regions
/customers              → existing customers (filterable)
/customers/lost         → lost + win-back queue
/customers/inactive     → inactive (churned) customers
/customers/portfolio    → customer portfolio breakdown
/customers/[customerId] → customer detail
/deal/[dealId]          → deal detail
/admin                  → user/config management + CSV import
```

### 8.2 Auth model (deliberate product decision)
- Login page lists all rep names from `/users` (excluding disabled)
- Click name → modal: "Enter your email to sign in"
- Submit → Firebase `signInWithEmailAndPassword` with password = email
- Admin creating users automatically sets password = email
- No password reset flow — admin resets by recreating the user

### 8.3–8.11 View specs
See full architecture for ForecastHeader, DealList, CustomerPortfolio, InactiveList, DealDetail, CustomerDetail, TeamView, RegionView, AdminPanel specs.

---

## 9. Snapshot logic

Weekly Mondays, client-side trigger. First Monday of month tagged `month_start`. Includes `byTier`, `byStructure`, `byLifecycle`, `byTemperature`, `byCommissionStatus` aggregates.

---

## 10. Permissions

| Role | Reads | Writes |
|---|---|---|
| Rep | Own deals, customers, snapshots, last 30d edit history | Own deals, customers |
| Manager | All in their region + full edit history | Own data |
| VP | All across regions + full edit history | Read-only |
| Admin | Everything | Everything |

---

## 11. Component breakdown

```
/app
  /(auth)/login
  /(app)/layout.tsx  ← role-based redirect
    /dashboard, /dashboard/[userId]
    /team, /region
    /customers, /customers/lost, /customers/inactive
    /customers/portfolio, /customers/[customerId]
    /deal/[dealId]
    /admin

/components
  /forecast       — ForecastHeader, DealList, DealRow, DealDetail, SmartFilters, TierPill, StructurePill
  /customers      — CustomerList, CustomerCreateModal, UnifiedStatusBadge, LeadTemperatureBadge,
                    CustomerProfileBadge, CustomerSalesContext, AnnualRevenueChart,
                    LostCoachingLog, WinBackQueue, InactiveList, PortfolioBreakdown
  /manager        — DriftReport, RegionRollup, TierMixChart, TemperatureMixChart, CommissionNewChart
  /admin          — UserManagement, ConfigEditor, StateRegionEditor, CsvImporter, ImportHistory
  /shared         — Sparkline, StagePill, OverrideIndicator, EditHistoryPanel, ContactLinks

/lib
  /firebase       — client.ts, auth.ts, deals.ts, customers.ts, snapshots.ts, history.ts, imports.ts
  /forecast       — calculations.ts, snapshotLogic.ts, stageConfig.ts, customerProfile.ts,
                    commissionStatus.ts, lifecycleStatus.ts, regionConfig.ts
  /import         — csvParser.ts, csvValidator.ts, importPipeline.ts
  /permissions    — roles.ts

/types
  deal.ts, customer.ts, snapshot.ts, user.ts, taxonomy.ts, import.ts, index.ts
```

---

## 12. V1 vs V2 scope

### V1 must-have
Auth, role-based routing, rep dashboard, deal CRUD with hybrid probability + tier + structure, customer CRUD with all fields (lifecycle, commission status, temperature, profile, annualRevenue, state→region), inline customer creation, CSV importer, snapshots, manager/VP views, all customer list views, edit history, admin panel, login log.

### V2 deferred
Kanban, "what changed" diff, Cloud Functions, line-item tier derivation, CRM sync, real auth (magic link/SSO), pick-list conversions.

---

## 13. Dev rules

- Modular Firebase v9+ SDK only. No legacy namespaced API.
- Server components by default; `"use client"` only when state/interactivity needed.
- All Firebase reads/writes through `/lib/firebase/*` — never call Firebase directly from components.
- Top-of-file comment on every file.
- TODOs reference future sessions (e.g., `// TODO: implement in Session 3`).
- Percentages stored 0-100 integers, never 0-1 decimals.
- Currency: `Intl.NumberFormat`.
- No raw Date math — use date-fns.
- No localStorage/sessionStorage — use React state, Firebase, or URL params.
