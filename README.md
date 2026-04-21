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

1. Install prerequisites: R 4.3+, Python 3.11 (NOT 3.12), Node 20+, Java 11+, Firebase CLI (`npm i -g firebase-tools`), Expo CLI.
2. Start the Firebase Emulator Suite: `cd firebase-emulator && firebase emulators:start --import=./seed --export-on-exit=./seed`
3. Bootstrap the first admin — see `firebase-emulator/README.md`.
4. Each subsystem has its own setup notes in the phase sections of `instructions/PROJECT_INSTRUCTIONS.md`.

## Dev vs prod

Development runs entirely against the local emulator — no real Firebase project is hit. Production uses a real Firebase project; the switch is env-vars-only (no code changes) if the clients were built emulator-aware from day one.
