#!/usr/bin/env python3
# scripts/migrateInPipeline.py — Set inPipeline=false on every customer that
# does not already have the field set. The pipeline must START EMPTY — the
# initial CSV import accidentally dumped all 1626 records straight onto reps'
# dashboards. Reps will re-populate their pipelines explicitly via the
# "+ Add to pipeline" flow.
#
# Idempotent: if a customer already has inPipeline set (true or false), we
# leave it alone so we never undo a manual add-to-pipeline action.

import json
import os
import subprocess
import sys
import tempfile

DB_URL  = "https://noris-forecast-default-rtdb.firebaseio.com"
API_KEY = "AIzaSyABa2mzIkuCfkASXy6kYPm945eiP3bSgdI"
EMAIL   = "spencerc@norismedical.com"
BATCH   = 200


def curl_json(method, url, body=None, body_file=None):
    args = ["curl", "-s", "-X", method, url, "-H", "Content-Type: application/json"]
    if body_file:   args += ["-d", f"@{body_file}"]
    elif body:      args += ["-d", body]
    return subprocess.run(args, capture_output=True, text=True).stdout


# ── Auth ─────────────────────────────────────────────────────────────────────
auth = json.loads(curl_json(
    "POST",
    f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
    body=json.dumps({"email": EMAIL, "password": EMAIL, "returnSecureToken": True})
))
token = auth.get("idToken", "")
if not token:
    print(f"Auth failed: {auth}"); sys.exit(1)
print(f"Authenticated as {EMAIL}")

# ── Fetch ────────────────────────────────────────────────────────────────────
print("Fetching customers…")
data = json.loads(curl_json("GET", f"{DB_URL}/forecast_v1/customers.json?auth={token}"))
print(f"  {len(data)} customers loaded")

needs_default  = []  # field missing entirely → write false
already_set    = 0   # field already exists → respect it
for cid, c in data.items():
    if not isinstance(c, dict): continue
    if "inPipeline" in c:
        already_set += 1
    else:
        needs_default.append(cid)

print(f"  {already_set} already have inPipeline set (leaving alone)")
print(f"  {len(needs_default)} need defaulting to false")

if not needs_default:
    print("Nothing to do."); sys.exit(0)

# ── Write in batches ─────────────────────────────────────────────────────────
written = 0
for b in range(0, len(needs_default), BATCH):
    chunk = needs_default[b:b + BATCH]
    patch = {f"forecast_v1/customers/{cid}/inPipeline": False for cid in chunk}

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(patch, f); fname = f.name
    resp = curl_json("PATCH", f"{DB_URL}/.json?auth={token}", body_file=fname)
    os.unlink(fname)
    if '"error"' in resp:
        print(f"  ERROR batch {b // BATCH + 1}: {resp[:300]}"); sys.exit(1)

    written += len(chunk)
    total_batches = (len(needs_default) + BATCH - 1) // BATCH
    print(f"  Batch {b // BATCH + 1}/{total_batches}: wrote {len(chunk)} ({written}/{len(needs_default)})")

print(f"\n✓ Done. {written} customers set to inPipeline=false (pipelines now empty).")
