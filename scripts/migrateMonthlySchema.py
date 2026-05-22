#!/usr/bin/env python3
# scripts/migrateMonthlySchema.py — Move top-level monthly fields into
# customers/{id}/months/{currentMonth}/. After Step 5 of the revamp every
# expectedMonthly / actualThisMonth / expectedMonthlyTotal / closeProbability /
# newStatus value lives per-month so the rep can switch months.
#
# Idempotent + safe:
#   - Only writes a per-month bucket when there's at least one non-null
#     monthly value to copy.
#   - Never deletes the top-level fields (kept as deprecated fallbacks).
#   - Skips customers that already have a months/{currentMonth} bucket.
#
# As of Step 1 migration the entire customer book was set to inPipeline=false,
# so there shouldn't actually be any monthly data to copy — but we run this
# anyway in case any rep edited a value between deploys.

import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime

DB_URL  = "https://noris-forecast-default-rtdb.firebaseio.com"
API_KEY = "AIzaSyABa2mzIkuCfkASXy6kYPm945eiP3bSgdI"
EMAIL   = "spencerc@norismedical.com"
BATCH   = 100

MONTHLY_FIELDS = [
    "expectedMonthly",
    "actualThisMonth",
    "expectedMonthlyTotal",
    "closeProbability",
    "newStatus",
]


def curl_json(method, url, body=None, body_file=None):
    args = ["curl", "-s", "-X", method, url, "-H", "Content-Type: application/json"]
    if body_file: args += ["-d", f"@{body_file}"]
    elif body:    args += ["-d", body]
    return subprocess.run(args, capture_output=True, text=True).stdout


# Auth
auth = json.loads(curl_json(
    "POST",
    f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
    body=json.dumps({"email": EMAIL, "password": EMAIL, "returnSecureToken": True})
))
token = auth.get("idToken", "")
if not token: print(f"Auth failed: {auth}"); sys.exit(1)
print(f"Authenticated as {EMAIL}")

print("Fetching customers…")
data = json.loads(curl_json("GET", f"{DB_URL}/forecast_v1/customers.json?auth={token}"))
print(f"  {len(data)} customers loaded")

now_month = datetime.utcnow().strftime("%Y-%m")
print(f"  Target month bucket: {now_month}")

candidates = []
for cid, c in data.items():
    if not isinstance(c, dict): continue
    # Skip if a bucket for the current month already exists.
    if isinstance(c.get("months"), dict) and now_month in c["months"]: continue
    # Pull any non-null monthly values from the top level.
    bucket = {}
    for f in MONTHLY_FIELDS:
        v = c.get(f)
        if v is not None and v != 0 and v != "":
            bucket[f] = v
    if bucket:
        candidates.append((cid, bucket))

print(f"  {len(candidates)} customers have legacy monthly data to copy")

if not candidates:
    print("Nothing to do."); sys.exit(0)

written = 0
for b in range(0, len(candidates), BATCH):
    chunk = candidates[b:b + BATCH]
    patch = {}
    for cid, bucket in chunk:
        for field, val in bucket.items():
            patch[f"forecast_v1/customers/{cid}/months/{now_month}/{field}"] = val

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(patch, f); fname = f.name
    resp = curl_json("PATCH", f"{DB_URL}/.json?auth={token}", body_file=fname)
    os.unlink(fname)
    if '"error"' in resp:
        print(f"  ERROR batch {b // BATCH + 1}: {resp[:300]}"); sys.exit(1)

    written += len(chunk)
    total_batches = (len(candidates) + BATCH - 1) // BATCH
    print(f"  Batch {b // BATCH + 1}/{total_batches}: wrote {len(chunk)} ({written}/{len(candidates)})")

print(f"\n✓ Done. Copied monthly data for {written} customers into months/{now_month}.")
print("Top-level fields left in place as deprecated fallbacks.")
