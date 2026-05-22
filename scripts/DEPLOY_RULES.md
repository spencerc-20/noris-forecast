# Deploying Realtime Database rules

The rules are version-controlled in `database.rules.json`. To push them live:

## Option A — Firebase Console (fastest, no install)

1. Open https://console.firebase.google.com/project/noris-forecast/database/noris-forecast-default-rtdb/rules
2. Paste the contents of `database.rules.json` (the whole file) into the editor.
3. Click **Publish**.

## Option B — Firebase CLI (good for CI / repeated deploys)

```bash
# One time
npm install -g firebase-tools
firebase login                    # opens browser; only needed once per machine

# Every deploy
firebase deploy --only database   # reads firebase.json → database.rules.json
```

The repo already contains `firebase.json` and `.firebaserc`, so `firebase deploy` picks up the right project (`noris-forecast`) and rules file automatically.

## Why neither this terminal session nor a service-account script can do it for you

The RTDB rules endpoint (`https://<db>.firebaseio.com/.settings/rules.json`) accepts
**only** OAuth2 access tokens with the `https://www.googleapis.com/auth/firebase`
scope. The user `idToken`s the app uses for data writes don't carry that scope, so
the in-app admin (Spencer) can't deploy rules through the REST API — only through
the CLI/console.
