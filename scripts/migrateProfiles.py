#!/usr/bin/env python3
# scripts/migrateProfiles.py — Recompute procedureProfile + profileRatios for all customers
# that have productFamilyBreakdown data, using the new TUFF/RA majority-based logic.
#
# Run: python3 scripts/migrateProfiles.py
#
# Family groups (normalized form — lowercase, _ and - → space):
#   RA   : zygomatic implant | zygoma drills | implants pteryfit
#   TUFF : tuff | tuff pro implant | implants tuff unicon | unicon family
#   OTHER: mbi implant | mbi n c implant | mono bendable | mono implants | multi unit
#   Tools/supplies → ignored for classification
#
# raFraction = raUnits / (tuffUnits + raUnits):
#   >= 0.80 → ra_only
#   <= 0.15 → full_arch
#   else    → everything
# No TUFF or RA but otherUnits > 0 → other
# Nothing clinical → tools_only

import json
import subprocess
import tempfile
import os
import re
import sys
from datetime import datetime, timezone

DB_URL = "https://noris-forecast-default-rtdb.firebaseio.com"
API_KEY = "AIzaSyABa2mzIkuCfkASXy6kYPm945eiP3bSgdI"
EMAIL   = "spencerc@norismedical.com"
BATCH   = 50

# ── Thresholds (mirror sheet2Parser.ts) ──────────────────────────────────────
RA_ONLY_THRESHOLD    = 0.80
FULL_ARCH_THRESHOLD  = 0.15

# ── Family sets (lowercase sanitized form — mirrors sheet2Parser.ts) ─────────
# Keys are exactly what Firebase stores, lowercased.
# Use family_key.lower() for direct lookup — do NOT use normalize_family()
# for classification, since commas survive normalization and cause mismatches.
# E.g. "Tuff,_Tuff_TT".lower() == "tuff,_tuff_tt" ✓
#      normalize_family("Tuff,_Tuff_TT") == "tuff, tuff tt"  ← comma stays, no match
RA_FAMILIES = {
    "zygomatic_implant",
    "zygoma_drills",
    "implants_pteryfit",
}

TUFF_FAMILIES = {
    "tuff,_tuff_tt",         # "Tuff, Tuff TT" → sanitised "Tuff,_Tuff_TT" → lower
    "tuff_pro_implant",
    "implants_tuff_unicon",
    "unicon_family",
}

OTHER_IMPLANT_FAMILIES = {
    "mbi_implant",
    "mbi_n-c_implant",       # "MBI N/C Implant" → sanitised "MBI_N-C_Implant" → lower
    "mono_bendable",
    "mono_implants",
    "multi_unit",
}


def normalize_family(raw: str) -> str:
    """Kept for potential future use — NOT used for profile classification."""
    s = raw.lower()
    s = re.sub(r"[_\-]", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def derive_profile_and_ratios(breakdown: dict) -> tuple[str, dict]:
    """Mirror deriveProfileAndRatios() in sheet2Parser.ts."""
    tuff_units  = 0
    ra_units    = 0
    other_units = 0

    for family_key, entry in breakdown.items():
        qty = entry.get("qty", 0) if isinstance(entry, dict) else 0
        # Use family_key.lower() directly against lowercase sanitized sets —
        # avoids the fragile normalize_family() path where commas survive.
        lower_key = family_key.lower()
        if lower_key in RA_FAMILIES:
            ra_units += qty
        elif lower_key in TUFF_FAMILIES:
            tuff_units += qty
        elif lower_key in OTHER_IMPLANT_FAMILIES:
            other_units += qty
        # else: tools/supplies — ignored

    total_clinical = tuff_units + ra_units + other_units
    tuff_pct  = round((tuff_units  / total_clinical) * 100) if total_clinical > 0 else 0
    ra_pct    = round((ra_units    / total_clinical) * 100) if total_clinical > 0 else 0
    other_pct = round((other_units / total_clinical) * 100) if total_clinical > 0 else 0

    ratios = {
        "tuffUnits":  tuff_units,
        "raUnits":    ra_units,
        "otherUnits": other_units,
        "tuffPct":    tuff_pct,
        "raPct":      ra_pct,
        "otherPct":   other_pct,
    }

    if total_clinical == 0:
        profile = "tools_only"
    elif tuff_units == 0 and ra_units == 0:
        profile = "other"
    else:
        tuff_plus_ra = tuff_units + ra_units
        ra_fraction  = ra_units / tuff_plus_ra if tuff_plus_ra > 0 else 0

        if ra_fraction >= RA_ONLY_THRESHOLD:
            profile = "ra_only"
        elif ra_fraction <= FULL_ARCH_THRESHOLD:
            profile = "full_arch"
        else:
            profile = "everything"

    return profile, ratios


def curl_json(method, url, body=None, body_file=None):
    args = ["curl", "-s", "-X", method, url, "-H", "Content-Type: application/json"]
    if body_file:
        args += ["-d", f"@{body_file}"]
    elif body:
        args += ["-d", body]
    result = subprocess.run(args, capture_output=True, text=True)
    return result.stdout


# ── Auth ─────────────────────────────────────────────────────────────────────
auth_body = json.dumps({"email": EMAIL, "password": EMAIL, "returnSecureToken": True})
auth_resp = json.loads(curl_json("POST",
    f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
    body=auth_body))
token = auth_resp.get("idToken", "")
if not token:
    print(f"Auth failed: {auth_resp}")
    sys.exit(1)
print(f"Authenticated as {EMAIL}")

# ── Fetch all customers ───────────────────────────────────────────────────────
print("Fetching customers…")
raw = curl_json("GET", f"{DB_URL}/forecast_v1/customers.json?auth={token}")
data = json.loads(raw)
print(f"  {len(data)} customers loaded")

# ── Filter to those with productFamilyBreakdown ───────────────────────────────
targets = [
    (k, v) for k, v in data.items()
    if isinstance(v, dict) and isinstance(v.get("productFamilyBreakdown"), dict)
    and len(v["productFamilyBreakdown"]) > 0
]
print(f"  {len(targets)} customers have productFamilyBreakdown — reclassifying…")

if not targets:
    print("Nothing to do.")
    sys.exit(0)

# ── Compute new profiles ──────────────────────────────────────────────────────
now_ts = int(datetime.now(timezone.utc).timestamp() * 1000)

# Tally for reporting
profile_counts: dict[str, int] = {}
written = 0

for b in range(0, len(targets), BATCH):
    batch = targets[b:b + BATCH]
    patch = {}

    for cid, cust in batch:
        breakdown = cust["productFamilyBreakdown"]
        profile, ratios = derive_profile_and_ratios(breakdown)
        profile_counts[profile] = profile_counts.get(profile, 0) + 1

        patch[f"forecast_v1/customers/{cid}/procedureProfile"] = profile
        patch[f"forecast_v1/customers/{cid}/profileRatios"]    = ratios
        patch[f"forecast_v1/customers/{cid}/profileUpdatedAt"] = now_ts

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(patch, f)
        fname = f.name

    resp = curl_json("PATCH", f"{DB_URL}/.json?auth={token}", body_file=fname)
    os.unlink(fname)

    if '"error"' in resp:
        print(f"  ERROR batch {b // BATCH + 1}: {resp[:300]}")
        sys.exit(1)

    written += len(batch)
    batch_num   = b // BATCH + 1
    total_batches = (len(targets) + BATCH - 1) // BATCH
    print(f"  Batch {batch_num}/{total_batches}: wrote {len(batch)} ({written}/{len(targets)})")

# ── Summary ───────────────────────────────────────────────────────────────────
print(f"\n✓ Done. Reclassified {written} customers.")
print("\nNew procedureProfile distribution:")
order = ["everything", "full_arch", "ra_only", "other", "standard", "tools_only", "course_only", "new"]
for p in order:
    if p in profile_counts:
        print(f"  {p:15s}: {profile_counts[p]:4d}")
for p, c in sorted(profile_counts.items()):
    if p not in order:
        print(f"  {p:15s}: {c:4d}  (unexpected)")
