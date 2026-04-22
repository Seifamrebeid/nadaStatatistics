# Classroom Emotion Detection System

Multi-subsystem project: R Plumber backend, Python classroom capture app, three React web apps (one per role), three React Native mobile apps (one per role), all backed by the Firebase Emulator Suite in dev.

See `instructions/PROJECT_INSTRUCTIONS.md` for the full spec and `instructions/FIREBASE_SCHEMA.md` for data shapes.

## Layout

```
classroom-app-python/   # OpenCV + face_recognition + FER + MediaPipe + Whisper capture app
backend-r-plumber/      # R Plumber REST API — auth, CRUD, analytics, report rendering
r-analysis/             # R analysis scripts + Shiny dashboard
web-student/            # React + Vite — student web app (read-only)
web-doctor/             # React + Vite — doctor web app (CRUD own lectures + analytics + messaging)
web-admin/              # React + Vite — admin web app (full system CRUD)
mobile-student/         # Expo React Native — student mobile app
mobile-doctor/          # Expo React Native — doctor mobile app
mobile-admin/           # Expo React Native — admin mobile app
firebase-emulator/      # Emulator config + security rules
data/                   # CSV observation backup (gitignored)
firebase/               # Prod service account key (gitignored; dev uses emulator)
reports-out/            # Temp dir for rendered PDFs before Storage upload (gitignored)
instructions/           # Project spec
```

Each role gets its **own** web app **and** its own mobile app (six frontend projects total). They all talk to the same R Plumber backend and the same Firebase project. See Phase 6 / Phase 7 in the instructions for the split rationale and the role-mismatch gate.

## Getting started (dev)

See the **Quick Start Runbook** at the top of [`instructions/PROJECT_INSTRUCTIONS.md`](./instructions/PROJECT_INSTRUCTIONS.md) for step-by-step prerequisites, venv setup, enrollment, capture app, and troubleshooting. Phase 2 build deltas vs spec are in §2.11 of the same file.

## Dev vs prod

Development runs entirely against the local emulator — no real Firebase project is hit. Production uses a real Firebase project; the switch is env-vars-only (no code changes) if the clients were built emulator-aware from day one.
