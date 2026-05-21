#!/usr/bin/env python3
# scripts/migrateDocType.py — Recompute docType + profileRatios per REVAMP_SPEC v2.0
# for every customer that has Sheet 2 productFamilyBreakdown data.
#
# Family groups (lowercase sanitized form — matches the keys actually stored in Firebase):
#   RA    : zygomatic_implant | zygoma_drills | implants_pteryfit
#   TUFF  : tuff,_tuff_tt | tuff_pro_implant | implants_tuff_unicon | unicon_family
#   OTHER : mbi_implant | mbi_n-c_implant | mono_bendable | mono_implants | multi_unit
#   Tools : everything else (ignored for clinical classification)
#
# Doc-type rules (evaluated in order):
#   1. No implant units at all                            → "other"
#   2. RA + TUFF both > 0:
#        raFraction >= 0.80                                → "ra_only"
#        raFraction <= 0.15                                → "full_arch"
#        else (meaningful mix, neither dominates)          → "full_arch_ra"
#   3. TUFF only                                          → "full_arch"
#   4. RA only                                            → "ra_only"
#   5. Other implants only (MBI / Mono / Multi Unit)      → "singles"
#
# "everything" is reserved (manual assignment / future threshold tuning).
# This script NEVER auto-writes it.
#
# Respects docTypeIsOverride: if the rep manually picked a docType, we leave it alone.

import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

DB_URL  = "https://noris-forecast-default-rtdb.firebaseio.com"
API_KEY = "AIzaSyABa2mzIkuCfkASXy6kYPm945eiP3bSgdI"
EMAIL   = "spencerc@norismedical.com"
BATCH   = 50

RA_ONLY_THRESHOLD   = 0.80
FULL_ARCH_THRESHOLD = 0.15

RA_FAMILIES = {
    "zygomatic_implant",
    "zygoma_drills",
    "implants_pteryfit",
}
TUFF_FAMILIES = {
    "tuff,_tuff_tt",
    "tuff_pro_implant",
    "implants_tuff_unicon",
    "unicon_family",
}
OTHER_IMPLANT_FAMILIES = {
    "mbi_implant",
    "mbi_n-c_implant",
    "mono_bendable",
    "mono_implants",
    "multi_unit",
}


def derive_doc_type_and_ratios(breakdown: dict) -> tuple[str, dict]:
    """Mirror deriveDocTypeAndRatios() in lib/import/sheet2Parser.ts."""
    tuff = ra = other = 0
    for family_key, entry in breakdown.items():
        qty = entry.get("qty", 0) if isinstance(entry, dict) else 0
        k = family_key.lower()
        if   k in RA_FAMILIES:            ra    += qty
        elif k in TUFF_FAMILIES:          tuff  += qty
        elif k in OTHER_IMPLANT_FAMILIES: other += qty

    total = tuff + ra + other
    tuff_pct  = round((tuff  / total) * 100) if total > 0 else 0
    ra_pct    = round((ra    / total) * 100) if total > 0 else 0
    other_pct = round((other / total) * 100) if total > 0 else 0
    ratios = {
        "tuffUnits": tuff, "raUnits": ra, "otherUnits": other,
        "tuffPct": tuff_pct, "raPct": ra_pct, "otherPct": other_pct,
    }

    if total == 0:
        return "other", ratios
    if tuff > 0 and ra > 0:
        ra_fraction = ra / (tuff + ra)
        if   ra_fraction >= RA_ONLY_THRESHOLD:    return "ra_only",      ratios
        elif ra_fraction <= FULL_ARCH_THRESHOLD:  return "full_arch",    ratios
        else:                                     return "full_arch_ra", ratios
    if tuff > 0:  return "full_arch", ratios
    if ra   > 0:  return "ra_only",   ratios
    return "singles", ratios  # other-implants only


def curl_json(method, url, body=None, body_file=None):
    args = ["curl", "-s", "-X", method, url, "-H", "Content-Type: application/json"]
    if body_file:   args += ["-d", f"@{body_file}"]
    elif body:      args += ["-d", body]
    return subprocess.run(args, capture_output=True, text=True).stdout


# ── Auth ─────────────────────────────────────────────────────────────────────
auth = json.loads(curl_json("POST",
    f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
    body=json.dumps({"email": EMAIL, "password": EMAIL, "returnSecureToken": True})))
token = auth.get("idToken", "")
if not token:
    print(f"Auth failed: {auth}"); sys.exit(1)
print(f"Authenticated as {EMAIL}")

# ── Fetch ────────────────────────────────────────────────────────────────────
print("Fetching customers…")
data = json.loads(curl_json("GET", f"{DB_URL}/forecast_v1/customers.json?auth={token}"))
print(f"  {len(data)} customers loaded")

targets = [
    (cid, c) for cid, c in data.items()
    if isinstance(c, dict)
    and isinstance(c.get("productFamilyBreakdown"), dict)
    and len(c["productFamilyBreakdown"]) > 0
]
print(f"  {len(targets)} have productFamilyBreakdown — reclassifying…")

if not targets:
    print("Nothing to do."); sys.exit(0)

# ── Compute + write ──────────────────────────────────────────────────────────
now_ts = int(datetime.now(timezone.utc).timestamp() * 1000)
doc_counts: dict[str, int] = {}
overridden  = 0
written     = 0

for b in range(0, len(targets), BATCH):
    chunk = targets[b:b + BATCH]
    patch = {}

    for cid, c in chunk:
        doc_type, ratios = derive_doc_type_and_ratios(c["productFamilyBreakdown"])
        doc_counts[doc_type] = doc_counts.get(doc_type, 0) + 1

        # Always update profileRatios + timestamp (audit trail)
        patch[f"forecast_v1/customers/{cid}/profileRatios"]    = ratios
        patch[f"forecast_v1/customers/{cid}/profileUpdatedAt"] = now_ts

        # Respect rep override
        if c.get("docTypeIsOverride"):
            overridden += 1
        else:
            patch[f"forecast_v1/customers/{cid}/docType"] = doc_type

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(patch, f); fname = f.name
    resp = curl_json("PATCH", f"{DB_URL}/.json?auth={token}", body_file=fname)
    os.unlink(fname)
    if '"error"' in resp:
        print(f"  ERROR batch {b // BATCH + 1}: {resp[:300]}"); sys.exit(1)

    written += len(chunk)
    total_batches = (len(targets) + BATCH - 1) // BATCH
    print(f"  Batch {b // BATCH + 1}/{total_batches}: wrote {len(chunk)} ({written}/{len(targets)})")

# ── Summary ──────────────────────────────────────────────────────────────────
print(f"\n✓ Done. Reclassified {written} customers ({overridden} skipped due to rep override).")
print("\nNew docType distribution (auto-derived):")
order = ["everything", "full_arch_ra", "full_arch", "ra_only", "singles", "other"]
for d in order:
    if d in doc_counts:
        print(f"  {d:15s}: {doc_counts[d]:4d}")
for d, n in sorted(doc_counts.items()):
    if d not in order:
        print(f"  {d:15s}: {n:4d}  (unexpected)")
