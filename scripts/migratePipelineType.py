#!/usr/bin/env python3
# scripts/migratePipelineType.py — Stamp pipelineType (+ default docType) on every customer.
#
# REVAMP v2.0 (2026-05) migration:
#   - pipelineType: old lifecycleStatus == "existing"  → "existing"
#                   everything else                      → "new"
#   - docType: defaults to "other". Step 2 (migrateDocType.py) overwrites this
#     for customers that have productFamilyBreakdown — Sheet2 import data.
#
# Idempotent: re-running just rewrites the same values.

import json
import os
import subprocess
import sys
import tempfile

DB_URL  = "https://noris-forecast-default-rtdb.firebaseio.com"
API_KEY = "AIzaSyABa2mzIkuCfkASXy6kYPm945eiP3bSgdI"
EMAIL   = "spencerc@norismedical.com"
BATCH   = 100


def curl_json(method, url, body=None, body_file=None):
    args = ["curl", "-s", "-X", method, url, "-H", "Content-Type: application/json"]
    if body_file:
        args += ["-d", f"@{body_file}"]
    elif body:
        args += ["-d", body]
    return subprocess.run(args, capture_output=True, text=True).stdout


# ── Auth ─────────────────────────────────────────────────────────────────────
auth = json.loads(curl_json("POST",
    f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
    body=json.dumps({"email": EMAIL, "password": EMAIL, "returnSecureToken": True})))
token = auth.get("idToken", "")
if not token:
    print(f"Auth failed: {auth}")
    sys.exit(1)
print(f"Authenticated as {EMAIL}")

# ── Fetch all customers ──────────────────────────────────────────────────────
print("Fetching customers…")
data = json.loads(curl_json("GET", f"{DB_URL}/forecast_v1/customers.json?auth={token}"))
print(f"  {len(data)} customers loaded")

# ── Build patch ──────────────────────────────────────────────────────────────
targets = [(cid, c) for cid, c in data.items() if isinstance(c, dict)]
counts = {"new": 0, "existing": 0}
docType_already_set = 0
patches = []

for cid, c in targets:
    lifecycle = c.get("lifecycleStatus")
    pipeline = "existing" if lifecycle == "existing" else "new"
    counts[pipeline] += 1

    patch_for_customer = {
        f"forecast_v1/customers/{cid}/pipelineType": pipeline,
    }
    # Only set docType default if not already present — don't clobber Step 2 output.
    if not c.get("docType"):
        patch_for_customer[f"forecast_v1/customers/{cid}/docType"] = "other"
    else:
        docType_already_set += 1

    patches.append(patch_for_customer)

print(f"  Pipeline split: new={counts['new']}, existing={counts['existing']}")
print(f"  docType already set on {docType_already_set} customers (left alone)")

# ── Write in batches ─────────────────────────────────────────────────────────
written = 0
for b in range(0, len(patches), BATCH):
    chunk = patches[b:b + BATCH]
    merged = {}
    for p in chunk:
        merged.update(p)

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(merged, f)
        fname = f.name

    resp = curl_json("PATCH", f"{DB_URL}/.json?auth={token}", body_file=fname)
    os.unlink(fname)

    if '"error"' in resp:
        print(f"  ERROR batch {b // BATCH + 1}: {resp[:300]}")
        sys.exit(1)

    written += len(chunk)
    total_batches = (len(patches) + BATCH - 1) // BATCH
    print(f"  Batch {b // BATCH + 1}/{total_batches}: wrote {len(chunk)} ({written}/{len(patches)})")

print(f"\n✓ Done. Stamped pipelineType on {written} customers.")
print(f"  new      : {counts['new']:4d}")
print(f"  existing : {counts['existing']:4d}")
