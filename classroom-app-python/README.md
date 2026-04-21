# Classroom capture app

Standalone Python desktop app that runs on the classroom PC. Reads the webcam + mic, identifies enrolled students, classifies emotion / sleep state / gesture per face per interval, streams Arabic transcription to Firestore, and writes everything to Firebase + a local CSV backup.

## Status

**Scaffold only.** Module docstrings describe the API contract; function bodies raise `NotImplementedError`. Install Python 3.11 and `pip install -r requirements.txt`, then fill in the stubs. See `instructions/PROJECT_INSTRUCTIONS.md` Phase 2 for the per-module spec.

## Setup

1. Install **Python 3.11** (NOT 3.12 — `dlib` / `face_recognition` / TensorFlow are wobbly on 3.12).
2. `python -m venv venv`
3. Activate: `venv\Scripts\activate` (Windows) or `source venv/bin/activate`
4. `pip install -r requirements.txt`
   - **Windows dlib tip:** if `pip install dlib` fails (CMake + Visual C++ Build Tools required), install via conda first: `conda install -c conda-forge dlib`, then `pip install face_recognition`. Budget an evening for this on a fresh machine.
5. Copy `.env.example` to `.env` and fill in values (see `instructions/PROJECT_INSTRUCTIONS.md` §2.1 for each variable).
6. Run the Firebase Emulator Suite first (`cd ../firebase-emulator && firebase emulators:start --import=./seed --export-on-exit=./seed`).
7. `python capture_app.py` — picks a lecture, opens the webcam, starts logging.

Quit with `q` in the OpenCV window. The finalize sequence uploads the audio WAV, marks the transcript completed, and POSTs `/api/lectures/<id>/finalize` to the R backend which kicks off PDF report generation.

## Modules

| File | Role |
|---|---|
| `capture_app.py` | Main OpenCV loop. Startup, per-frame pipeline, draw labels, finalize. |
| `face_id.py` | `face_recognition` — detection + identification against enrolled encodings. |
| `emotion.py` | FER — 7-label emotion classifier + 4-class reducer. |
| `sleep_detector.py` | MediaPipe Face Mesh — EAR + head pose; per-face temporal smoothing. |
| `gesture_detector.py` | MediaPipe Hands — `hand_raised`, `toilet_request`, `thumbs_up/down`, `pointing`. Extensible registry. |
| `engagement.py` | Emotion + state + gesture -> 0.0–1.0 engagement score. Mirrors `backend-r-plumber/R/engagement.R`. |
| `firebase_writer.py` | `firebase-admin` — buffered Firestore writes, CSV append, Storage upload, transcript segment writes. |
| `audio_recorder.py` | `sounddevice` background-thread recorder. Writes `recordings/{lecture_id}.wav` on stop. |
| `stream_transcribe.py` | `faster-whisper` + `silero-vad`. VAD-chunked live Arabic transcription, one Firestore doc per segment. |
| `encode_face.py` | CLI shelled out to by R backend on admin face-photo upload. |
| `match_face.py` | CLI shelled out to by R backend on face-login attempt. |

## Distribution

For non-developers: `pyinstaller --onefile --collect-all=mediapipe capture_app.py` -> single `.exe`. Ship it with `.env` and (for prod) `serviceAccountKey.json` next to the binary. The `--collect-all=mediapipe` flag is mandatory — MediaPipe ships model files inside the package and PyInstaller otherwise misses them.
