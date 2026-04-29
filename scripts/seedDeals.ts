#!/usr/bin/env ts-node
// scripts/seedDeals.ts — Create 5 realistic test deals + month_start snapshot for Spencer (admin).
// Uses Firebase REST API directly — no firebase-admin or @/ imports needed.
//
// Run: npx ts-node scripts/seedDeals.ts

import * as fs from "fs";
import * as path from "path";

// ── Load .env.local ───────────────────────────────────────────────────────────

function loadEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  const env: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const ENV = loadEnv();
const DB_URL = ENV["NEXT_PUBLIC_FIREBASE_DATABASE_URL"]!.replace(/\/$/, "");
const API_KEY = ENV["NEXT_PUBLIC_FIREBASE_API_KEY"]!;

if (!DB_URL || !API_KEY) {
  console.error("❌ Missing Firebase config in .env.local");
  process.exit(1);
}

// ── Seed constants ────────────────────────────────────────────────────────────

const OWNER_ID     = "iGRqfRpSgoczX1mkU0HEbkiXrtk1"; // Spencer (admin)
const OWNER_EMAIL  = "spencerc@norismedical.com";       // password = email per app auth model

// ── Inline types (no @/ aliases) ─────────────────────────────────────────────

interface CustomerRow {
  name: string;
  ownerId: string;
  lifecycleStatus: string;
  leadTemperature: string;
  profile: string;
  region?: string;
}

interface DealPayload {
  customerId: string;
  customerName: string;
  ownerId: string;
  region: string;
  procedureTier: string;
  dealStructure: string;
  isForecastEligible: boolean;
  stage: string;
  dealValue: number;
  closeProbability: number;
  isOverride: boolean;
  overrideReason: null;
  expectedCloseDate: string;
  lastMeetingDate: null;
  nextMeetingDate: string;
  closedAt: null;
  linkedDealId: null;
  notes: string;
  decisionMaker: string;
  createdAt: number;
  updatedAt: number;
}

interface DealRecord {
  id: string;
  payload: DealPayload;
}

// ── Firebase REST helpers ─────────────────────────────────────────────────────

async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Auth failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { idToken: string };
  return data.idToken;
}

async function dbGet<T>(p: string, idToken: string): Promise<T | null> {
  const res = await fetch(`${DB_URL}/${p}.json?auth=${idToken}`);
  if (!res.ok) throw new Error(`GET /${p} failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T | null>;
}

async function dbPatch(
  p: string,
  body: Record<string, unknown>,
  idToken: string
): Promise<void> {
  const res = await fetch(`${DB_URL}/${p}.json?auth=${idToken}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH /${p} failed: ${res.status} ${await res.text()}`);
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** ISO date "YYYY-MM-DD" for N days from today. */
function daysFrom(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Last calendar day of the current month. */
function endOfMonth(): string {
  const t = new Date();
  const eom = new Date(t.getFullYear(), t.getMonth() + 1, 0);
  return `${eom.getFullYear()}-${pad(eom.getMonth() + 1)}-${pad(eom.getDate())}`;
}

/** 15th of next month. */
function midNextMonth(): string {
  const t = new Date();
  const nm = new Date(t.getFullYear(), t.getMonth() + 1, 15);
  return `${nm.getFullYear()}-${pad(nm.getMonth() + 1)}-15`;
}

/** "YYYY-MM" for the current month. */
function yyyyMM(): string {
  const t = new Date();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}`;
}

// ── Firebase push-key generator ───────────────────────────────────────────────
// Mirrors the Firebase client SDK algorithm so keys sort chronologically.

const PUSH_CHARS = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";
let lastPushTime = 0;
const lastRandChars: number[] = new Array(12).fill(0);

function generatePushKey(): string {
  let now = Date.now();
  const duplicateTime = now === lastPushTime;
  lastPushTime = now;

  const timeStampChars: string[] = new Array(8);
  for (let i = 7; i >= 0; i--) {
    timeStampChars[i] = PUSH_CHARS[now % 64];
    now = Math.floor(now / 64);
  }

  let id = timeStampChars.join("");

  if (!duplicateTime) {
    for (let i = 0; i < 12; i++) {
      lastRandChars[i] = Math.floor(Math.random() * 64);
    }
  } else {
    let carry = true;
    for (let i = 11; i >= 0 && carry; i--) {
      lastRandChars[i]++;
      carry = lastRandChars[i] >= 64;
      if (carry) lastRandChars[i] = 0;
    }
  }

  for (let i = 0; i < 12; i++) id += PUSH_CHARS[lastRandChars[i]];
  return id;
}

// ── Snapshot builder (inline — mirrors snapshotLogic.ts) ─────────────────────

const ELIGIBLE_STRUCTURES = new Set(["standalone", "package", "bulk", "combo"]);

function buildMonthStartSnapshot(
  deals: DealRecord[],
  customerMap: Record<string, CustomerRow>,
  month: string
): Record<string, unknown> {
  const now = new Date();
  const currentYear = now.getFullYear();

  const byTier: Record<string, number> = {
    everything: 0, full_arch: 0, ra_only: 0, standard: 0, course: 0, tools: 0,
  };
  const byStructure: Record<string, number> = {
    standalone: 0, package: 0, bulk: 0, combo: 0, trial: 0, mentorship: 0,
  };
  const byStage: Record<string, number> = {
    lead: 0, discovery: 0, quoted: 0, verbal: 0, won: 0, lost: 0,
  };
  const byLifecycle: Record<string, number> = {
    potential: 0, new: 0, existing: 0, inactive: 0, lost: 0,
  };
  const byTemperature: Record<string, number> = {
    cold: 0, warm: 0, hot: 0, engaged: 0,
  };
  const byProfile: Record<string, number> = {
    new: 0, tools_only: 0, course_only: 0, standard: 0, ra_only: 0, full_arch: 0, everything: 0,
  };
  const byCommissionStatus: Record<string, number> = { new: 0, existing: 0, none: 0 };
  const dealEntries: Record<string, unknown> = {};
  let totalForecast = 0;

  for (const { id, payload: d } of deals) {
    const eligible = ELIGIBLE_STRUCTURES.has(d.dealStructure);
    const wv = eligible ? (d.dealValue * d.closeProbability) / 100 : 0;
    totalForecast += wv;

    byTier[d.procedureTier] = (byTier[d.procedureTier] ?? 0) + wv;
    byStructure[d.dealStructure] = (byStructure[d.dealStructure] ?? 0) + wv;
    byStage[d.stage] = (byStage[d.stage] ?? 0) + wv;

    const cust = customerMap[d.customerId];
    if (cust) {
      byLifecycle[cust.lifecycleStatus] = (byLifecycle[cust.lifecycleStatus] ?? 0) + wv;
      byTemperature[cust.leadTemperature] = (byTemperature[cust.leadTemperature] ?? 0) + wv;
      byProfile[cust.profile] = (byProfile[cust.profile] ?? 0) + wv;
      const commVal = (cust as unknown as Record<string, unknown>)["commissionStatus"] as Record<number, string> | null;
      const cs = commVal?.[currentYear] ?? null;
      byCommissionStatus[cs ?? "none"] = (byCommissionStatus[cs ?? "none"] ?? 0) + wv;
    } else {
      byCommissionStatus["none"] += wv;
    }

    dealEntries[id] = {
      dealId: id,
      customerName: d.customerName,
      procedureTier: d.procedureTier,
      dealStructure: d.dealStructure,
      stage: d.stage,
      dealValue: d.dealValue,
      closeProbability: d.closeProbability,
      weightedValue: wv,
      isForecastEligible: eligible,
      expectedCloseDate: d.expectedCloseDate,
    };
  }

  return {
    userId: OWNER_ID,
    month,
    tag: "month_start",
    snapshotDate: now.toISOString().slice(0, 10),
    takenAt: now.getTime(),
    totalForecast,
    dealCount: deals.length,
    byTier,
    byStructure,
    byStage,
    byLifecycle,
    byTemperature,
    byCommissionStatus,
    byProfile,
    deals: dealEntries,
  };
}

// ── Deal templates ────────────────────────────────────────────────────────────

interface Template {
  stage: string;
  tier: string;
  structure: string;
  value: number;
  prob: number;          // must match stage default (lead=10, discovery=25, quoted=50, verbal=75)
  closeDateFn: () => string;
  nextMeetingDays: number;
  notes: string;
}

// Stages spread across lead / discovery / quoted / verbal. Two quoted (realistic pipeline).
// Values between $8k and $65k per spec.
function getTemplates(): Template[] {
  return [
    {
      stage: "verbal", tier: "everything", structure: "standalone", value: 58_000, prob: 75,
      closeDateFn: endOfMonth,
      nextMeetingDays: 3,
      notes:
        "Full-arch zygo case — patient pre-op scheduled for next month. Verbal commitment received; " +
        "purchase order in progress.",
    },
    {
      stage: "quoted", tier: "full_arch", structure: "package", value: 42_500, prob: 50,
      closeDateFn: endOfMonth,
      nextMeetingDays: 7,
      notes:
        "Tuff TT full-arch package. Formal quote sent. Waiting on patient financing approval " +
        "from the practice; follow-up call booked.",
    },
    {
      stage: "quoted", tier: "standard", structure: "standalone", value: 14_500, prob: 50,
      closeDateFn: midNextMonth,
      nextMeetingDays: 5,
      notes:
        "Mono implant restock order. Price-comparing with one other rep — " +
        "booked demo to walk through Noris clinical data.",
    },
    {
      stage: "discovery", tier: "ra_only", structure: "standalone", value: 28_000, prob: 25,
      closeDateFn: midNextMonth,
      nextMeetingDays: 10,
      notes:
        "Interested in expanding into zygomatic/pterygoid cases. " +
        "Discovery call scheduled — assessing current case volume and training needs.",
    },
    {
      stage: "lead", tier: "full_arch", structure: "package", value: 63_000, prob: 10,
      closeDateFn: midNextMonth,
      nextMeetingDays: 14,
      notes:
        "Inbound referral from existing customer network. High potential — " +
        "does 4–5 full-arch cases/month, currently with a competitor. First call next week.",
    },
  ];
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════");
  console.log(" Noris Forecast — Seed Deals for Spencer");
  console.log("═══════════════════════════════════════════════\n");

  // 1. Authenticate
  console.log("🔐 Signing in as Spencer…");
  const idToken = await signIn(OWNER_EMAIL, OWNER_EMAIL);
  console.log("   ✓ Authenticated\n");

  // 2. Load all customers — pick 5 with the richest profiles
  console.log("📋 Loading customers from Firebase…");
  const allCustomers = await dbGet<Record<string, CustomerRow>>(
    "forecast_v1/customers",
    idToken
  );

  if (!allCustomers) {
    console.error("❌ No customers in database. Run the CSV import first.");
    process.exit(1);
  }

  const entries = Object.entries(allCustomers);
  console.log(`   Found ${entries.length} total customers.\n`);

  if (entries.length < 5) {
    console.error(`❌ Need ≥ 5 customers; found ${entries.length}. Run import first.`);
    process.exit(1);
  }

  // Sort: prefer richer profiles (everything > full_arch > ra_only > ...)
  // then prefer existing lifecycle (stable customers)
  const profileRank: Record<string, number> = {
    everything: 0, full_arch: 1, ra_only: 2, standard: 3,
    tools_only: 4, course_only: 5, new: 6,
  };
  const lifecycleRank: Record<string, number> = {
    existing: 0, new: 1, potential: 2, inactive: 3, lost: 4,
  };
  const sorted = [...entries].sort(([, a], [, b]) => {
    const pd = (profileRank[a.profile] ?? 6) - (profileRank[b.profile] ?? 6);
    if (pd !== 0) return pd;
    return (lifecycleRank[a.lifecycleStatus] ?? 4) - (lifecycleRank[b.lifecycleStatus] ?? 4);
  });
  const picks = sorted.slice(0, 5);

  // 3. Build deals from templates
  const templates = getTemplates();
  const now = Date.now();
  const month = yyyyMM();
  const dealsToWrite: DealRecord[] = [];

  console.log("🛠  Building 5 deals:");
  console.log(
    "   " + ["#", "Customer", "Stage", "Tier", "Structure", "Value", "Close"].join("  ").padEnd(90)
  );
  console.log("   " + "─".repeat(86));

  for (let i = 0; i < 5; i++) {
    const [customerId, customer] = picks[i];
    const t = templates[i];
    const id = generatePushKey();

    const deal: DealPayload = {
      customerId,
      customerName: customer.name,
      ownerId: OWNER_ID,
      region: customer.region ?? "INSIDE",
      procedureTier: t.tier,
      dealStructure: t.structure,
      isForecastEligible: ELIGIBLE_STRUCTURES.has(t.structure),
      stage: t.stage,
      dealValue: t.value,
      closeProbability: t.prob,
      isOverride: false,
      overrideReason: null,
      expectedCloseDate: t.closeDateFn(),
      lastMeetingDate: null,
      nextMeetingDate: daysFrom(t.nextMeetingDays),
      closedAt: null,
      linkedDealId: null,
      notes: t.notes,
      decisionMaker: customer.name,
      createdAt: now,
      updatedAt: now,
    };

    dealsToWrite.push({ id, payload: deal });

    const wv = ELIGIBLE_STRUCTURES.has(t.structure) ? (t.value * t.prob) / 100 : 0;
    console.log(
      `   ${i + 1}  ${customer.name.slice(0, 28).padEnd(28)}  ` +
      `${t.stage.padEnd(10)}  ${t.tier.padEnd(12)}  ${t.structure.padEnd(12)}  ` +
      `$${t.value.toLocaleString().padStart(7)}  ` +
      `(wv $${wv.toLocaleString()})`
    );
  }

  // 4. Write all 5 deals in a single multi-path PATCH (one round-trip)
  console.log("\n💾 Writing deals to Firebase…");
  const dealsMultiPath: Record<string, unknown> = {};
  for (const { id, payload } of dealsToWrite) {
    dealsMultiPath[`deals/${id}`] = payload;
  }
  await dbPatch("forecast_v1", dealsMultiPath, idToken);
  console.log("   ✓ 5 deals written");

  // 5. Build and write month_start snapshot
  console.log("\n📸 Writing month_start snapshot…");
  const customerMap = Object.fromEntries(entries);
  const snapshot = buildMonthStartSnapshot(dealsToWrite, customerMap, month);

  // Write-once: only write if no existing month_start for this month
  const existing = await dbGet<unknown>(
    `forecast_v1/snapshots/${OWNER_ID}/${month}/month_start`,
    idToken
  );
  if (existing) {
    console.log(`   ⚠  month_start for ${month} already exists — skipping snapshot write.`);
    console.log("      (Delete it manually in Firebase Console to re-seed.)");
  } else {
    await dbPatch(
      `forecast_v1/snapshots/${OWNER_ID}/${month}`,
      { month_start: snapshot },
      idToken
    );
    console.log(`   ✓ month_start snapshot written for ${month}`);
  }

  // 6. Summary
  const totalForecast = snapshot["totalForecast"] as number;
  const fmt = (n: number) =>
    `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log(`║  ✅  Seed complete for ${month}               `);
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  Deals created : 5`);
  console.log(`║  Total forecast: ${fmt(totalForecast)}`);
  console.log(`║  Snapshot tag  : month_start`);
  console.log("╠══════════════════════════════════════════════╣");
  console.log("║  View at: https://noris-forecast.vercel.app  ");
  console.log("╚══════════════════════════════════════════════╝\n");
}

main().catch((err: unknown) => {
  console.error(
    "\n❌ Seed failed:",
    err instanceof Error ? err.message : String(err)
  );
  process.exit(1);
});
