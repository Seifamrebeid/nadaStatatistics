# Classroom Emotion Detection System

Multi-subsystem project: R Plumber backend, Python classroom capture app, React web, React Native mobile, all backed by the Firebase Emulator Suite in dev.

See `instructions/PROJECT_INSTRUCTIONS.md` for the full spec and `instructions/FIREBASE_SCHEMA.md` for data shapes.

## Layout

```
classroom-app-python/   # OpenCV + face_recognition + FER + MediaPipe + Whisper capture app
backend-r-plumber/      # R Plumber REST API — auth, CRUD, analytics, report rendering
r-analysis/             # R analysis scripts + Shiny dashboard
web-react/              # React + Vite web frontend
mobile-react-native/    # Expo React Native mobile app
firebase-emulator/      # Emulator config + security rules
data/                   # CSV observation backup (gitignored)
firebase/               # Prod service account key (gitignored; dev uses emulator)
reports-out/            # Temp dir for rendered PDFs before Storage upload (gitignored)
instructions/           # Project spec
```

## Getting started (dev)

See the **Quick Start Runbook** at the top of [`instructions/PROJECT_INSTRUCTIONS.md`](./instructions/PROJECT_INSTRUCTIONS.md) for step-by-step prerequisites, venv setup, enrollment, capture app, and troubleshooting. Phase 2 build deltas vs spec are in §2.11 of the same file.

## Dev vs prod

Development runs entirely against the local emulator — no real Firebase project is hit. Production uses a real Firebase project; the switch is env-vars-only (no code changes) if the clients were built emulator-aware from day one.
