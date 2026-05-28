#!/usr/bin/env python3
# scripts/addEileenAsRep.py — Eileen Likakis is a player-coach. She already
# manages the EILEEN region; this adds a separate REP account so she can also
# carry her own NY / NJ / Long Island territory book.
#
# Why two accounts: the role model is single-valued per user record, and the
# login picker groups by role. Two accounts keeps each surface clean:
#   - Reps section          → "Eileen"          (passwordless, lands on /dashboard)
#   - Regional Managers     → "Eileen Likakis"  (password, lands on /team)
# The /team rollup scopes by `region` field, so when she logs in as manager
# the new rep record auto-appears in her region rollup alongside Ben, Malcolm,
# etc. Her customers (inPipeline=true on the rep record) roll up too.
#
# Idempotent: re-runs are safe.

import json
import subprocess
import sys
import time

API_KEY      = "AIzaSyABa2mzIkuCfkASXy6kYPm945eiP3bSgdI"
DB_URL       = "https://noris-forecast-default-rtdb.firebaseio.com"
ADMIN_EMAIL  = "spencerc@norismedical.com"
ADMIN_PASS   = "Noris!2026"

MANAGER_EMAIL = "eileenl@norismedical.com"   # existing manager account — not touched
REP_NAME      = "Eileen"
REP_EMAIL     = "eileen@norismedical.com"    # new rep account
REGION        = "EILEEN"


def curl_json(method, url, body=None):
    args = ["curl", "-s", "-X", method, url, "-H", "Content-Type: application/json"]
    if body is not None:
        args += ["-d", body if isinstance(body, str) else json.dumps(body)]
    out = subprocess.run(args, capture_output=True, text=True).stdout
    try:    return json.loads(out)
    except: return {"_raw": out}


# 1. Authenticate as admin
auth = curl_json(
    "POST",
    f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
    {"email": ADMIN_EMAIL, "password": ADMIN_PASS, "returnSecureToken": True},
)
token = auth.get("idToken")
if not token:
    print(f"Admin auth failed: {auth}"); sys.exit(1)
print(f"Authenticated as {ADMIN_EMAIL}")

# 2. Look up the manager record (we link the new rep's managerId to her uid).
users = curl_json("GET", f"{DB_URL}/forecast_v1/users.json?auth={token}")
manager_uid = None
existing_rep_uid = None
for uid, u in (users or {}).items():
    if not isinstance(u, dict): continue
    em = u.get("email", "").lower()
    if em == MANAGER_EMAIL.lower():  manager_uid = uid
    if em == REP_EMAIL.lower():      existing_rep_uid = uid

if not manager_uid:
    print(f"Could not find manager record for {MANAGER_EMAIL}. Aborting.")
    sys.exit(1)
print(f"Manager uid: {manager_uid}")

# 3. Find-or-create the Firebase Auth account for the rep persona.
auth_check = curl_json(
    "POST",
    f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
    {"email": REP_EMAIL, "password": REP_EMAIL, "returnSecureToken": True},
)
if auth_check.get("idToken"):
    rep_uid = auth_check["localId"]
    print(f"Firebase Auth account for {REP_EMAIL} already exists (uid={rep_uid}).")
else:
    print(f"Creating Firebase Auth account for {REP_EMAIL}…")
    signup = curl_json(
        "POST",
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
        {"email": REP_EMAIL, "password": REP_EMAIL, "returnSecureToken": True},
    )
    if "idToken" not in signup:
        print(f"  ERROR: {signup}"); sys.exit(1)
    rep_uid = signup["localId"]
    print(f"  ✓ Created (uid={rep_uid})")

# 4. Tidy up a stale record under a different uid if one exists.
if existing_rep_uid and existing_rep_uid != rep_uid:
    print(f"Removing stale user record at uid={existing_rep_uid}…")
    curl_json("DELETE", f"{DB_URL}/forecast_v1/users/{existing_rep_uid}.json?auth={token}")

# 5. Write the canonical user record under the Auth uid.
user_record = {
    "name":        REP_NAME,
    "email":       REP_EMAIL,
    "role":        "rep",
    "region":      REGION,
    "managerId":   manager_uid,
    "disabled":    False,
    "createdAt":   int(time.time() * 1000),
    "lastLoginAt": None,
}
print(f"Writing user record at forecast_v1/users/{rep_uid}…")
resp = curl_json(
    "PUT",
    f"{DB_URL}/forecast_v1/users/{rep_uid}.json?auth={token}",
    user_record,
)
if "error" in resp:
    print(f"  ERROR: {resp['error']}"); sys.exit(1)
print("  ✓ Written")

# 6. Verify: print the EILEEN region's user list.
all_users = curl_json("GET", f"{DB_URL}/forecast_v1/users.json?auth={token}")
region_members = sorted(
    [
        (uid, u) for uid, u in all_users.items()
        if isinstance(u, dict) and u.get("region") == REGION
    ],
    key=lambda kv: (kv[1].get("role", ""), kv[1].get("name", "")),
)
print(f"\n✓ Done. Region '{REGION}' now has {len(region_members)} user(s):")
for uid, u in region_members:
    print(f"  {u.get('role',''):8s} {u.get('name',''):30s} {u.get('email','')}")
