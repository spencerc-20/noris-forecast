#!/usr/bin/env python3
# scripts/migrateRepForecastsToObject.py — Reshape repForecasts from scalar
# to object form so currentRevenue can sit alongside forecast.
#
# Before:  forecast_v1/repForecasts/{repId}/{YYYY-MM} = 5000        (scalar)
# After:   forecast_v1/repForecasts/{repId}/{YYYY-MM} = {forecast: 5000}
#
# The PaceTracker writes currentRevenue at
# forecast_v1/repForecasts/{repId}/{YYYY-MM}/currentRevenue. RTDB can't have
# both a scalar and child keys at the same path — the scalar value must be
# wrapped in an object first, or the next write would orphan the existing
# forecast number.
#
# Idempotent: months already in object form are left alone.

import json
import os
import subprocess
import sys
import tempfile

DB_URL  = "https://noris-forecast-default-rtdb.firebaseio.com"
API_KEY = "AIzaSyABa2mzIkuCfkASXy6kYPm945eiP3bSgdI"
EMAIL   = "spencerc@norismedical.com"
PASS    = "Noris!2026"
BATCH   = 100


def curl_json(method, url, body=None, body_file=None):
    args = ["curl", "-s", "-X", method, url, "-H", "Content-Type: application/json"]
    if body_file: args += ["-d", f"@{body_file}"]
    elif body is not None:
        args += ["-d", body if isinstance(body, str) else json.dumps(body)]
    out = subprocess.run(args, capture_output=True, text=True).stdout
    try:    return json.loads(out)
    except: return {"_raw": out}


# 1. Auth
auth = curl_json(
    "POST",
    f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
    {"email": EMAIL, "password": PASS, "returnSecureToken": True},
)
token = auth.get("idToken")
if not token:
    print(f"Auth failed: {auth}"); sys.exit(1)
print(f"Authenticated as {EMAIL}")

# 2. Pull the whole repForecasts tree.
print("Fetching repForecasts…")
tree = curl_json("GET", f"{DB_URL}/forecast_v1/repForecasts.json?auth={token}") or {}
if not isinstance(tree, dict):
    print(f"Unexpected shape: {type(tree)}"); sys.exit(1)
print(f"  {len(tree)} reps have repForecasts entries")

# 3. Identify rows that need wrapping.
patches = {}
already_ok = 0
total_months = 0
for rep_id, months in tree.items():
    if not isinstance(months, dict):
        continue
    for month_key, val in months.items():
        total_months += 1
        if isinstance(val, (int, float)):
            # Scalar — wrap it.
            patches[f"forecast_v1/repForecasts/{rep_id}/{month_key}"] = {"forecast": val}
        elif isinstance(val, dict):
            # Already an object — leave it alone (idempotent).
            already_ok += 1

print(f"  {total_months} month entries scanned")
print(f"  {already_ok} already in object form (left alone)")
print(f"  {len(patches)} need wrapping (scalar → {{forecast: …}})")

if not patches:
    print("Nothing to do."); sys.exit(0)

# 4. Write in batches of BATCH path → value patches.
items = list(patches.items())
written = 0
for b in range(0, len(items), BATCH):
    chunk = dict(items[b:b + BATCH])
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(chunk, f); fname = f.name
    resp = curl_json("PATCH", f"{DB_URL}/.json?auth={token}", body_file=fname)
    os.unlink(fname)
    if "error" in resp:
        print(f"  ERROR batch {b // BATCH + 1}: {resp['error']}"); sys.exit(1)
    written += len(chunk)
    total_batches = (len(items) + BATCH - 1) // BATCH
    print(f"  Batch {b // BATCH + 1}/{total_batches}: wrote {len(chunk)} ({written}/{len(items)})")

print(f"\n✓ Done. Wrapped {written} scalar forecast values into {{forecast: …}} objects.")
