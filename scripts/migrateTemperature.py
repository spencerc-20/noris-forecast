#!/usr/bin/env python3
# scripts/migrateTemperature.py — Migrate existing+cold customers to warm.
# Run: python3 scripts/migrateTemperature.py

import json
import subprocess
import tempfile
import os
import sys
from datetime import datetime, timezone

DB_URL = "https://noris-forecast-default-rtdb.firebaseio.com"
API_KEY = "AIzaSyABa2mzIkuCfkASXy6kYPm945eiP3bSgdI"
EMAIL = "spencerc@norismedical.com"

def curl_json(method, url, body=None, body_file=None):
    args = ["curl", "-s", "-X", method, url, "-H", "Content-Type: application/json"]
    if body_file:
        args += ["-d", f"@{body_file}"]
    elif body:
        args += ["-d", body]
    result = subprocess.run(args, capture_output=True, text=True)
    return result.stdout

# --- Auth ---
auth_body = json.dumps({"email": EMAIL, "password": EMAIL, "returnSecureToken": True})
auth_resp = json.loads(curl_json("POST",
    f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
    body=auth_body))
token = auth_resp.get("idToken", "")
if not token:
    print(f"Auth failed: {auth_resp}")
    sys.exit(1)
print(f"Authenticated as {EMAIL}")

# --- Fetch all customers ---
print("Fetching customers...")
raw = curl_json("GET", f"{DB_URL}/forecast_v1/customers.json?auth={token}")
data = json.loads(raw)

targets = [(k, v) for k, v in data.items()
           if isinstance(v, dict)
           and v.get("lifecycleStatus") == "existing"
           and v.get("leadTemperature") == "cold"]

print(f"Found {len(targets)} existing+cold customers to migrate → warm")

if not targets:
    print("Nothing to do.")
    sys.exit(0)

now_ts = int(datetime.now(timezone.utc).timestamp() * 1000)
BATCH = 50
written = 0

for b in range(0, len(targets), BATCH):
    batch = targets[b:b + BATCH]
    patch = {}
    for cid, _ in batch:
        patch[f"forecast_v1/customers/{cid}/leadTemperature"] = "warm"
        patch[f"forecast_v1/customers/{cid}/temperatureUpdatedAt"] = now_ts

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(patch, f)
        fname = f.name

    resp = curl_json("PATCH", f"{DB_URL}/.json?auth={token}", body_file=fname)
    os.unlink(fname)

    if '"error"' in resp:
        print(f"  ERROR batch {b // BATCH + 1}: {resp[:300]}")
        sys.exit(1)

    written += len(batch)
    batch_num = b // BATCH + 1
    total_batches = (len(targets) + BATCH - 1) // BATCH
    print(f"  Batch {batch_num}/{total_batches}: wrote {len(batch)} ({written}/{len(targets)})")

print(f"\n✓ Done. Migrated {written} customers: existing+cold → existing+warm")
