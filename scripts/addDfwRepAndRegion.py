#!/usr/bin/env python3
# scripts/addDfwRepAndRegion.py — Add the DFW region + a placeholder rep named "DFW".
#
# What this does (idempotently):
#   1. Re-region Kaylie Goodin from her current region → "DFW" (no-op if already DFW).
#   2. Create a Firebase Auth account for dfw@norismedical.com (password=email, the
#      passwordless-login pattern used for every rep). Skips if the account exists.
#   3. Write a user record at forecast_v1/users/{auth_uid} with role=rep, region=DFW.
#
# Run: python3 scripts/addDfwRepAndRegion.py
#
# After this runs the DFW region appears naturally everywhere the app reads
# regions from the user list (login picker, admin region grid, /team scope).

import json
import os
import subprocess
import sys
import tempfile

API_KEY      = "AIzaSyABa2mzIkuCfkASXy6kYPm945eiP3bSgdI"
DB_URL       = "https://noris-forecast-default-rtdb.firebaseio.com"
ADMIN_EMAIL  = "spencerc@norismedical.com"
ADMIN_PASS   = "Noris!2026"

REGION_LABEL = "DFW"
DFW_REP_NAME  = "DFW"
DFW_REP_EMAIL = "dfw@norismedical.com"


def curl_json(method, url, body=None, body_file=None, extra=None):
    args = ["curl", "-s", "-X", method, url, "-H", "Content-Type: application/json"]
    if extra: args += extra
    if body_file: args += ["-d", f"@{body_file}"]
    elif body is not None: args += ["-d", body if isinstance(body, str) else json.dumps(body)]
    out = subprocess.run(args, capture_output=True, text=True).stdout
    try:    return json.loads(out)
    except: return {"_raw": out}


# ── 1. Auth as Spencer (admin) ───────────────────────────────────────────────
auth = curl_json(
    "POST",
    f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
    {"email": ADMIN_EMAIL, "password": ADMIN_PASS, "returnSecureToken": True},
)
token = auth.get("idToken")
if not token:
    print(f"Auth failed: {auth}"); sys.exit(1)
print(f"Authenticated as {ADMIN_EMAIL}")

# ── 2. Fetch user list — find Kaylie + check whether DFW rep already exists ──
users = curl_json("GET", f"{DB_URL}/forecast_v1/users.json?auth={token}")
if "_raw" in users or users is None:
    print(f"Failed to read users: {users}"); sys.exit(1)

kaylie_uid = None
existing_dfw_uid = None
for uid, u in users.items():
    if not isinstance(u, dict): continue
    if u.get("email", "").lower() == "kaylieg@norismedical.com":
        kaylie_uid = uid
    if u.get("email", "").lower() == DFW_REP_EMAIL.lower():
        existing_dfw_uid = uid

if not kaylie_uid:
    print("Could not find Kaylie's user record. Aborting.")
    sys.exit(1)

# ── 3. Re-region Kaylie to DFW (idempotent — no-op if already DFW) ───────────
current_region = users[kaylie_uid].get("region")
if current_region == REGION_LABEL:
    print(f"Kaylie already in region '{REGION_LABEL}'.")
else:
    print(f"Updating Kaylie's region: '{current_region}' → '{REGION_LABEL}'…")
    resp = curl_json(
        "PATCH",
        f"{DB_URL}/forecast_v1/users/{kaylie_uid}.json?auth={token}",
        {"region": REGION_LABEL},
    )
    if "error" in resp:
        print(f"  ERROR: {resp['error']}"); sys.exit(1)
    print("  ✓ Updated")

# ── 4. Ensure Firebase Auth account exists for dfw@norismedical.com ──────────
# Try signing in with password=email first (existence check). If that fails,
# create the account via accounts:signUp.
existing_auth = curl_json(
    "POST",
    f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
    {"email": DFW_REP_EMAIL, "password": DFW_REP_EMAIL, "returnSecureToken": True},
)
if existing_auth.get("idToken"):
    dfw_uid = existing_auth["localId"]
    print(f"Firebase Auth account for {DFW_REP_EMAIL} already exists (uid={dfw_uid}).")
else:
    print(f"Creating Firebase Auth account for {DFW_REP_EMAIL}…")
    signup = curl_json(
        "POST",
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
        {"email": DFW_REP_EMAIL, "password": DFW_REP_EMAIL, "returnSecureToken": True},
    )
    if "idToken" not in signup:
        print(f"  ERROR: {signup}"); sys.exit(1)
    dfw_uid = signup["localId"]
    print(f"  ✓ Created (uid={dfw_uid})")

# Sanity: if a previous user record exists under a different uid (shouldn't,
# but the email match check uses the user record not the auth account),
# delete the stale one so we don't have two DFW reps in the picker.
if existing_dfw_uid and existing_dfw_uid != dfw_uid:
    print(f"Removing stale user record at uid={existing_dfw_uid} (different from Auth uid)…")
    resp = curl_json("DELETE", f"{DB_URL}/forecast_v1/users/{existing_dfw_uid}.json?auth={token}")
    if "error" in resp: print(f"  WARN: {resp['error']}")

# ── 5. Write the user record under the Auth uid ──────────────────────────────
user_record = {
    "name":     DFW_REP_NAME,
    "email":    DFW_REP_EMAIL,
    "role":     "rep",
    "region":   REGION_LABEL,
    "managerId": kaylie_uid,
    "disabled": False,
    "createdAt": int(__import__("time").time() * 1000),
    "lastLoginAt": None,
}
print(f"Writing user record at forecast_v1/users/{dfw_uid}…")
resp = curl_json(
    "PUT",
    f"{DB_URL}/forecast_v1/users/{dfw_uid}.json?auth={token}",
    user_record,
)
if "error" in resp:
    print(f"  ERROR: {resp['error']}"); sys.exit(1)
print("  ✓ Written")

# ── 6. Verify by reading back the DFW user list ──────────────────────────────
all_users = curl_json("GET", f"{DB_URL}/forecast_v1/users.json?auth={token}")
dfw_members = [
    (uid, u) for uid, u in all_users.items()
    if isinstance(u, dict) and u.get("region") == REGION_LABEL
]
print(f"\n✓ Done. Region '{REGION_LABEL}' now has {len(dfw_members)} user(s):")
for uid, u in dfw_members:
    print(f"  {u.get('role',''):8s} {u.get('name',''):30s} {u.get('email','')}")
