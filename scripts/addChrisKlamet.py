#!/usr/bin/env python3
# scripts/addChrisKlamet.py — Add Chris Klamet as Regional Manager for EAST.
#
# What this does (idempotently):
#   1. Creates a Firebase Auth account for klametc@norismedical.com.
#      Password = "klametc@norismedical.com" (the email-as-password pattern
#      every other manager uses — see lib/firebase/auth.ts).
#   2. Writes the user record at forecast_v1/users/{auth_uid} with
#      role=manager, region=EAST.
#
# After this runs, Chris appears in the "Regional Managers" section of the
# login screen automatically (the picker reads the live user list), and
# /team rolls up Tara Shoulders + Ivan Monsalve under him (the rollup
# scopes by `region` field, not by managerId).

import json
import subprocess
import sys
import time

API_KEY      = "AIzaSyABa2mzIkuCfkASXy6kYPm945eiP3bSgdI"
DB_URL       = "https://noris-forecast-default-rtdb.firebaseio.com"
ADMIN_EMAIL  = "spencerc@norismedical.com"
ADMIN_PASS   = "Noris!2026"

NEW_NAME   = "Chris Klamet"
NEW_EMAIL  = "klametc@norismedical.com"
NEW_REGION = "EAST"


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

# 2. Check whether the user record already exists (idempotent — don't
#    duplicate if we re-run).
users = curl_json("GET", f"{DB_URL}/forecast_v1/users.json?auth={token}")
existing_uid = None
for uid, u in (users or {}).items():
    if isinstance(u, dict) and u.get("email", "").lower() == NEW_EMAIL.lower():
        existing_uid = uid
        break

# 3. Find-or-create the Firebase Auth account. Try signInWithPassword first
#    as a cheap existence check; signUp creates it if missing.
auth_check = curl_json(
    "POST",
    f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
    {"email": NEW_EMAIL, "password": NEW_EMAIL, "returnSecureToken": True},
)
if auth_check.get("idToken"):
    new_uid = auth_check["localId"]
    print(f"Firebase Auth account for {NEW_EMAIL} already exists (uid={new_uid}).")
else:
    print(f"Creating Firebase Auth account for {NEW_EMAIL}…")
    signup = curl_json(
        "POST",
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
        {"email": NEW_EMAIL, "password": NEW_EMAIL, "returnSecureToken": True},
    )
    if "idToken" not in signup:
        print(f"  ERROR: {signup}"); sys.exit(1)
    new_uid = signup["localId"]
    print(f"  ✓ Created (uid={new_uid})")

# 4. If a user record exists under a different uid (shouldn't, but guard),
#    delete the stale one so the picker doesn't show two Chrises.
if existing_uid and existing_uid != new_uid:
    print(f"Removing stale user record at uid={existing_uid}…")
    curl_json("DELETE", f"{DB_URL}/forecast_v1/users/{existing_uid}.json?auth={token}")

# 5. Write the canonical user record under the Auth uid.
user_record = {
    "name":        NEW_NAME,
    "email":       NEW_EMAIL,
    "role":        "manager",
    "region":      NEW_REGION,
    "managerId":   None,           # managers themselves don't have a manager
    "disabled":    False,
    "createdAt":   int(time.time() * 1000),
    "lastLoginAt": None,
}
print(f"Writing user record at forecast_v1/users/{new_uid}…")
resp = curl_json(
    "PUT",
    f"{DB_URL}/forecast_v1/users/{new_uid}.json?auth={token}",
    user_record,
)
if "error" in resp:
    print(f"  ERROR: {resp['error']}"); sys.exit(1)
print("  ✓ Written")

# 6. Verify by listing the EAST region.
all_users = curl_json("GET", f"{DB_URL}/forecast_v1/users.json?auth={token}")
east_members = sorted(
    [
        (uid, u) for uid, u in all_users.items()
        if isinstance(u, dict) and u.get("region") == NEW_REGION
    ],
    key=lambda kv: (kv[1].get("role", ""), kv[1].get("name", "")),
)
print(f"\n✓ Done. Region '{NEW_REGION}' now has {len(east_members)} user(s):")
for uid, u in east_members:
    print(f"  {u.get('role',''):8s} {u.get('name',''):30s} {u.get('email','')}")
