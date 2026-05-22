#!/usr/bin/env python3
# scripts/setAdminPassword.py — One-shot: change spencerc@norismedical.com's
# Firebase Auth password from the legacy email-as-password to "Noris!2026".
#
# Uses the Firebase REST identitytoolkit endpoint:
#   1. signInWithPassword to obtain an idToken with the CURRENT password
#   2. accounts:update with that idToken to set a NEW password
#
# Run once after deploying the new role-grouped login. The script is safe to
# re-run: if the current password is already "Noris!2026" it just no-ops.

import json
import subprocess
import sys

API_KEY      = "AIzaSyABa2mzIkuCfkASXy6kYPm945eiP3bSgdI"
ADMIN_EMAIL  = "spencerc@norismedical.com"
NEW_PASSWORD = "Noris!2026"
# Try the legacy "password = email" first; fall back to the new one if it's
# already been changed (idempotent re-runs).
CANDIDATE_OLD_PASSWORDS = [ADMIN_EMAIL, NEW_PASSWORD]


def curl_json(method, url, body):
    r = subprocess.run(
        ["curl", "-s", "-X", method, url,
         "-H", "Content-Type: application/json", "-d", body],
        capture_output=True, text=True,
    )
    return json.loads(r.stdout) if r.stdout else {}


def try_sign_in(email, password):
    return curl_json(
        "POST",
        f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
        json.dumps({"email": email, "password": password, "returnSecureToken": True}),
    )


# 1. Get an idToken using whichever password currently works.
token = None
used_password = None
for pw in CANDIDATE_OLD_PASSWORDS:
    res = try_sign_in(ADMIN_EMAIL, pw)
    if res.get("idToken"):
        token = res["idToken"]
        used_password = pw
        break

if not token:
    print("Could not sign in with any known password. Reset manually in Firebase console.")
    sys.exit(1)

if used_password == NEW_PASSWORD:
    print(f"✓ Admin password is already set to '{NEW_PASSWORD}'. Nothing to do.")
    sys.exit(0)

print(f"Signed in with legacy password. Updating to '{NEW_PASSWORD}'…")

# 2. Update the password.
update = curl_json(
    "POST",
    f"https://identitytoolkit.googleapis.com/v1/accounts:update?key={API_KEY}",
    json.dumps({"idToken": token, "password": NEW_PASSWORD, "returnSecureToken": True}),
)

if "error" in update:
    print(f"FAILED: {json.dumps(update['error'], indent=2)}")
    sys.exit(1)

# 3. Confirm by signing in once with the new password.
verify = try_sign_in(ADMIN_EMAIL, NEW_PASSWORD)
if verify.get("idToken"):
    print(f"✓ Done. Admin password for {ADMIN_EMAIL} is now '{NEW_PASSWORD}'.")
else:
    print(f"WARNING: update succeeded but verify failed: {verify}")
    sys.exit(1)
