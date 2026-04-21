# Firebase Emulator Suite

Local emulators for Auth, Firestore, and Storage. Everything in dev runs against these — no real Firebase project is hit until you flip env vars for prod (Phase 10).

## Ports

| Service     | Port |
|-------------|------|
| Auth        | 9099 |
| Firestore   | 8080 |
| Storage     | 9199 |
| Emulator UI | 4000 |

## Project ID

`.firebaserc` is set to `emotion-detection-dev` as a placeholder. **When you create the real Firebase project, replace this value in:**
- `.firebaserc`
- `classroom-app-python/.env` (`FIREBASE_PROJECT_ID`)
- `backend-r-plumber/.Renviron` (`FIREBASE_PROJECT_ID`)
- `web-react/src/firebase.js` (`firebaseConfig.projectId`)
- `mobile-react-native/firebaseConfig.js` (`firebaseConfig.projectId`)

The emulator accepts any project id, so the placeholder works for dev; the value only matters when you cut over to a real project.

## Running

```bash
cd firebase-emulator
firebase emulators:start --import=./seed --export-on-exit=./seed
```

- `--import` / `--export-on-exit` persists data between runs. The `seed/` directory is gitignored — emulator state is a developer-local thing.
- Open the Emulator UI at http://localhost:4000 to inspect Auth users, Firestore docs, and Storage files manually.

## First-time setup — bootstrap the first admin

Do this once, then `--export-on-exit` keeps the admin between restarts.

1. Start the emulator (command above).
2. Open http://localhost:4000.
3. **Authentication → Add user** → enter admin email + password → save → copy the generated UID.
4. **Firestore → Start collection → `admins`** → add a document:
   - id (auto or chosen, e.g. `admin_001`)
   - `admin_id` (string) = same as the doc id
   - `name` (string)
   - `email` (string, same as the Auth user)
   - `created_at` (timestamp, server time)
5. **Firestore → Start collection → `users`** → add a document with id = the Auth UID you copied, and fields:
   - `uid` (string) = same as the doc id
   - `role` (string) = `admin`
   - `linked_id` (string) = `admin_001` (whatever you used in step 4)

Everyone else (doctors, students) is created through the R Plumber backend by an admin.

## Files

- `firebase.json` — port config + rules paths
- `.firebaserc` — project ID
- `firestore.rules` — Firestore security rules (writes locked down hard; service account bypasses)
- `storage.rules` — Storage security rules (enrollment photos writable by admin, readable by any signed-in user)
- `seed/` — local-only emulator state snapshot (gitignored)
