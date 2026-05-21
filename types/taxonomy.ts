// types/taxonomy.ts — Shared enum types and constants for customer classification.
//
// REVAMP v2.0 (2026-05): Deal-era enums (ProcedureTier, DealStructure, DealStage)
// were deleted along with the deals system. CustomerProfile / LifecycleStatus are
// kept only because the Customer interface still references them as @deprecated
// fields for backwards-compat with stored Firebase data.

export type CustomerProfile =
  | "new"
  | "tools_only"
  | "course_only"
  | "other"
  | "standard"
  | "ra_only"
  | "full_arch"
  | "everything";

export type LifecycleStatus =
  | "potential"
  | "new"
  | "existing"
  | "inactive"
  | "lost";

export type LeadTemperature = "cold" | "warm" | "hot" | "engaged";

export type CommissionStatusValue = "new" | "existing" | null;

export type UserRole = "rep" | "manager" | "vp" | "admin";

export type RevenueDataSource = "csv_import" | "live_deals";

// ────────────────────────────────────────────────────────────────────────────
// REVAMP v2.0 — pipelineType + docType (the active classification)
// ────────────────────────────────────────────────────────────────────────────

/** Whether the customer is a NEW prospect being pitched or an EXISTING recurring book account. */
export type PipelineType = "new" | "existing";

/**
 * Doc-type — clinical classification driven by Sheet 2 product-family unit mix.
 * Auto-derived for customers with productFamilyBreakdown; rep can override.
 *   ra_only       — RA implants only (Zygomatic / Pterygoid / Zygoma Drills)
 *   full_arch_ra  — Full Arch + RA mix (the default "Everything" bucket for now)
 *   full_arch     — TUFF / full-arch only, no meaningful RA
 *   singles       — Other implants only (MBI / Mono / Multi Unit), no TUFF / RA
 *   everything    — Heaviest mixed accounts (reserved — manual / future threshold)
 *   other         — No implant units (tools / courses / supplies only or empty)
 */
export type DocType =
  | "ra_only"
  | "full_arch_ra"
  | "full_arch"
  | "singles"
  | "everything"
  | "other";

/** Display order for doc-type chips and tables (highest clinical intensity first). */
export const DOC_TYPE_ORDER: DocType[] = [
  "everything",
  "full_arch_ra",
  "full_arch",
  "ra_only",
  "singles",
  "other",
];

/** Human-readable labels for doc-type. */
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  everything: "Everything",
  full_arch_ra: "Full Arch + RA",
  full_arch: "Full Arch",
  ra_only: "RA Only",
  singles: "Singles",
  other: "Other",
};

