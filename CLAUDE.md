# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

A classroom emotion-detection system. A Python desktop app on a classroom PC captures video, identifies students by face, scores engagement (emotions, eye closure, gestures, phone use), and transcribes lectures live. All dashboards and reports are served through role-aware web/mobile portals backed by an R Plumber API.

## Service Map

| Service | Dir | How to run | Default port |
|---|---|---|---|
| Firebase Emulator | `firebase-emulator/` | `npm run emu:start` (from root) | Auth 9099, Firestore 8080, Storage 9199, UI 4000 |
| R Plumber API | `backend-r-plumber/` | `Rscript run_api.R` | 8000 |
| Python capture app | `classroom-app-python/` | `python capture_app_ui.py` (GUI) or `python capture_app.py` (headless) | — |
| web-admin | `web-admin/` | `npm run dev` | 5175 |
| web-doctor | `web-doctor/` | `npm run dev` | 5174 |
| web-student | `web-student/` | `npm run dev` | 5173 |
| web-parent | `web-parent/` | `npm run dev` | 5176 |
| mobile-admin | `mobile-admin/` | `npx expo start` | 19006 |
| mobile-doctor | `mobile-doctor/` | `npx expo start` | 19007 |
| mobile-student | `mobile-student/` | `npx expo start` | 19008 |
| R analysis / Shiny | `r-analysis/` | `Rscript shiny/app.R` | — |

### Emulator shortcuts (root package.json)
```
npm run emu:start          # restore last backup then start emulators
npm run emu:start:fresh    # start with empty Firestore
npm run emu:backup         # dump Firestore + Auth to backups/
npm run emu:restore        # restore last dump
npm run cloud:upload       # upload backups to Firebase cloud
```

## Architecture

### Write paths
- **Python → firebase-admin (direct)**: real-time emotions and transcripts written directly to Firestore
- **R Plumber**: used only by the Shiny dashboard (`r-analysis/`) and by Python (`/finalize` endpoint at end of lecture). Web/mobile apps do NOT call R.
- **Web portals + mobile apps → Firestore SDK directly**: all CRUD, queries, and analytics computed client-side from the `emotions` collection

Permission enforcement for web/mobile: client-side role gate (AuthContext reads `users/{uid}`) → Firestore security rules.

### Authentication & Role Resolution
All clients share the same Firebase Auth project (`fridgechef-jt50c`). After sign-in, `AuthContext.jsx` reads `users/{uid}` directly from Firestore to get `{role, linked_id}`. Each web portal hard-codes its expected `APP_ROLE` (in `src/appRole.js`); a mismatch bounces the user. No R backend call is involved in this flow.

### Web Portals
Four independent Vite + React projects. They do not share node_modules or components. Key pattern in each:
- `src/firebase.js` — Firebase SDK init (real `fridgechef-jt50c` credentials, no emulator)
- `src/services/api.js` — stub (`export default {}`), kept only so old imports don't break; no longer used
- `src/context/AuthContext.jsx` — `onAuthStateChanged` → reads `users/{uid}` from Firestore directly for role
- `src/components/Layout.jsx` — shell with nav
- `src/pages/` — route components, all data via Firestore SDK (`getDocs`, `addDoc`, `updateDoc`, `onSnapshot`)

`web-parent` adds `src/context/ChildContext.jsx` which reads `parents/{linked_id}` → `linked_student_ids` → loads each child's student doc.

### R Backend (`backend-r-plumber/`)
- `plumber.R` — all ~1500-line route file
- `R/firestore.R` — httr-based Firestore REST client
- `R/auth.R` — JWT decode + role-guard helpers
- `R/engagement.R` — emotion → score mapping
- `R/brevo.R` — transactional email
- `R/reports.R` — PDF generation → Storage upload

### Python Capture App (`classroom-app-python/`)
Per-frame pipeline: face detection → face_recognition (dlib 128-d) → FER emotions → MediaPipe eye/gesture analysis → YOLOv8 phone detection → engagement score → Firestore batch write. Audio runs in a parallel thread: sounddevice → silero-VAD → faster-whisper → `transcripts/{lectureId}/segments`.

### Firebase Schema (abbreviated)
Top-level collections: `users`, `admins`, `doctors`, `students`, `parents`, `subjects`, `classes`, `weeks`, `lectures`, `emotions`, `transcripts`, `notifications`. Full shapes are in `instructions/FIREBASE_SCHEMA.md`.

## Environment Setup

### R Backend
Copy `backend-r-plumber/.Renviron.example` → `.Renviron` (emulator defaults already set). Run:
```r
renv::restore()   # install R dependencies
Rscript run_api.R
```

### Python App
```
cd classroom-app-python
cp .env.example .env        # emulator defaults already set
pip install -r requirements.txt
python capture_app_ui.py    # GUI wizard
```

### Web Apps
Each portal has `.env.development` pointing to `http://127.0.0.1:8000` and the emulator project ID. No setup needed beyond `npm install && npm run dev`.

## One-shot Scripts (`scripts/`)
All are ES modules, run from the repo root with `node scripts/<name>.mjs`. Common ones:
- `seed-curriculum.mjs` — seed subjects/classes/weeks
- `seed-grades.mjs` — seed grade records
- `enroll-all-students.mjs` — bulk-enroll students into classes
- `start-emulators.mjs` — used by `npm run emu:start`

## Key Constraints
- Service-account writes (Python + R) bypass Firestore security rules; client writes are subject to them.
- CORS allowlist is hardcoded in `backend-r-plumber/R/cors.R` — add new origins there when adding new portals.
- Prod cutover is environment-variable-only; no code changes needed. Remove `FIRESTORE_EMULATOR_HOST` etc. from `.Renviron` and `.env` to point at real Firebase.
- `web-parent` is the newest subsystem — it touches backend routes, CORS config, Firestore rules, and the admin UI for linking parents to children.
