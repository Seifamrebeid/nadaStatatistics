# Classroom Emotion Detection System — Full Project Instructions

**Stack:** **R (backend API + analysis + Shiny)** · Python (standalone classroom capture app — camera, face recognition, emotion) · React (Web) · React Native (Mobile) · **Firebase Emulator Suite** for dev (Auth + Firestore + Storage, all local) / Firebase cloud for prod · CSV (Backup)

**Dev vs prod:** Development runs entirely against the **Firebase Emulator Suite** — no real Firebase project is hit during local work. Storage, Auth, and Firestore all run on localhost. For the college-project demo, you can ship on emulators the whole way. For a real deployment, flip env vars to point at a real Firebase project; no code changes required if the Firestore/Auth/Storage wiring is built emulator-aware from day one.

**Architecture at a glance:**
- A **Python desktop app** runs on the classroom PC during each lecture. It opens the webcam, detects all faces, **identifies which student each face belongs to** (face recognition against enrolled photos), runs emotion analysis on each face, and writes one row per face per interval to Firebase Firestore + the CSV backup.
- An **R Plumber backend** serves the web/mobile clients. It handles auth, role resolution, **CRUD for students / doctors / lectures**, and analytics. **It does not do any detection** — detection lives entirely in the Python desktop app.
- The **React web app** and **React Native mobile app** are management + analytics dashboards. Doctor and Admin roles use them for CRUD and viewing. Students get read-only access to their own engagement history. **Neither frontend captures video.**
- Firebase holds the data; CSV is the backup.

**Language policy:** R is the default for the server side. Python is used only where it must be — in practice, only inside the classroom capture app, because OpenCV, `face_recognition`, and the emotion model have no mature R equivalents.

**Exception to "R owns persistence":** the Python classroom app writes directly to Firebase + CSV using `firebase-admin`. Routing detection data through R over HTTP would add complexity for no gain on a trusted on-prem classroom PC. R is **read-only** for the `emotions` collection.

**Rule of thumb:** if it touches a camera, a pixel, or a pretrained neural net → **Python**. Everything else → **R**.

| Responsibility | Language | Reason |
|---|---|---|
| Webcam capture + drawing (OpenCV) | **Python** | `opencv-python` mature; R bindings are weak |
| Face detection + identification (`face_recognition`) | **Python** | dlib-based, Python-only |
| Emotion classification (FER) | **Python** | Pretrained CNN, Python-only |
| Head-pose + eye-closure (sleep detection) via MediaPipe Face Mesh | **Python** | Pretrained landmark model, Python-only |
| Hand-gesture detection (raise hand, toilet, etc.) via MediaPipe Hands | **Python** | Pretrained landmark model + heuristic classifier, Python-only |
| Classroom-side Firebase + CSV writes (`firebase-admin`) | **Python** | Lives with the capture loop |
| HTTP backend / REST API (Plumber) | **R** | Policy |
| Firebase ID-token verification (JWT) | **R** (`jose`) | Both work |
| Firestore reads (REST) | **R** (`httr`) | Both work |
| CRUD logic (students / doctors / lectures) | **R** | Policy |
| Engagement scoring / emotion→score mapping | **R** | Business logic lives with analytics |
| Statistics, clustering (k-means), regression | **R** | R's core strength |
| Dashboard / visualizations (Shiny + ggplot2) | **R** | Shiny wins |
| FCM push notifications | **R** (`httr`) | Both work |

**Roles:** The system has **three user roles** — **Student**, **Doctor** (instructor / professor), and **Admin**. Both the **website (React)** and the **mobile app (React Native)** must support all three roles with **full feature parity** — everything that exists on the web must also exist on mobile, and vice versa. Each role sees a different home screen and has different permissions, enforced by the **R Plumber backend** and Firebase security rules.

**Role permissions (high level):**
- **Student** — read-only: view own enrolled lectures, view own engagement history, edit own profile. Students do **not** capture video from their own devices — the classroom camera does that. May sign in with **email+password OR face recognition** (same enrollment photo used by the classroom app).
- **Doctor** — create/manage own lectures, enroll students into lectures, view per-lecture engagement analytics for students in their lectures, and **compose and send email notifications** to students in their own lectures (via Brevo). **No live-detection screen** — the capture runs in the Python classroom app. **No push notifications** — doctors monitor classrooms via the live dashboard, and push emails to students when they want to intervene. May sign in with **email+password OR face recognition** (doctors have their own enrollment photo, uploaded by an admin).
- **Admin** — **full CRUD on doctors**, **full CRUD on students** (including uploading each student's and doctor's enrollment face photo so the classroom app can recognize them and so they can use face sign-in), view system-wide analytics, manage lectures across all doctors, configure global settings. **Admin signs in with email+password only** — face sign-in is intentionally disabled for admins because it's weaker than a password (photo-spoofable) and admins are the highest-privilege role.

Check off each item as you finish it. Do **not** skip phases — each one depends on the previous.

---

## 🚀 Quick Start Runbook (what's built today)

Operational guide for running the system as it stands. Phase 2 is complete — Python capture app + Firebase Emulator Suite. Phase 3 (R Plumber backend) and the frontends (Phases 6–7) are not built yet.

### 1. Prerequisites (one-time install per machine)

| Tool | Version | Purpose |
|---|---|---|
| Python | **3.11** (NOT 3.12) | Capture app, enrollment utility |
| Node.js | 20+ | Firebase CLI |
| Java | 11+ | Firestore + Storage emulators |
| Firebase CLI | any | `npm install -g firebase-tools` |
| Git | any | |

Verify:
```powershell
py -3.11 --version        # Python 3.11.x
node --version            # v20+
java --version            # 11+
firebase --version        # any
```

Windows PATH gotcha: if `python` in a fresh PowerShell hits the Microsoft Store alias, disable it at **Settings → Apps → Advanced app settings → App execution aliases → turn off `python.exe` and `python3.exe`**, or use `py -3.11`.

### 2. First-time project setup

Once per clone.

```powershell
cd classroom-app-python

# Create venv
py -3.11 -m venv venv
.\venv\Scripts\Activate.ps1

# Upgrade pip
python -m pip install --upgrade pip

# Install deps — dlib + face_recognition first (separately) because
# face_recognition hard-requires `dlib` and we use the prebuilt `dlib-bin`
# fork to skip the Windows Visual-C++ build headache.
pip install dlib-bin
pip install --no-deps face_recognition==1.3.0 face_recognition_models Click Pillow
pip install -r requirements.txt

# Downgrade moviepy (fer 22.5.1 needs v1)
pip install "moviepy==1.0.3"

# Create .env from the template
copy .env.example .env
```

First run of `capture_app` / `test_video` triggers model downloads on first use:
- MediaPipe face mesh / hands (~10 MB, bundled)
- FER weights (small)
- YOLOv8n (~6 MB, from GitHub)
- silero-vad JIT (~2 MB, from pytorch hub)
- Whisper model (75 MB for `tiny`, 480 MB for `small`)

Everything caches to `C:\Users\<you>\.cache\` — subsequent runs are fast.

If PowerShell execution policy blocks `Activate.ps1`:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### 3. Every-time startup

**3a. Start the Firebase Emulator Suite** (separate PowerShell window, leave running):
```powershell
cd firebase-emulator
firebase emulators:start --import=./seed --export-on-exit=./seed
```
Wait for the "All emulators ready!" banner. UI at http://127.0.0.1:4000.

**3b. Enroll yourself** (second PowerShell, venv active):
```powershell
cd classroom-app-python
.\venv\Scripts\Activate.ps1
python enroll_student.py "C:\path\to\selfie.jpg" 231014746 "Your Name" lec_test_001
```
Arguments: **image_path · student_id · name · lecture_id**. First run creates both the student doc AND a minimal `lec_test_001` lecture (`status=scheduled`).

**3c. Run the capture app:**
```powershell
python capture_app.py
```
Pick `1`. OpenCV opens, Whisper loads in background. Quit with `q`.

Observations land in Firestore `emotions` + `data/emotions.csv`. On quit, the app uploads `recordings/{lecture_id}.wav` and POSTs `/finalize` (the latter fails until Phase 3 — non-fatal).

### 4. Standalone visual test (no Firebase)

```powershell
python test_video.py
```

Single-face pipeline for tuning. Live debug line every 0.5 s with EAR / smoothed EAR / streak / pitch / gesture / phone. Rock-on gesture = `toilet_request`. EMA-smoothed face box. YOLOv8 phone overlay.

Tune in `.env` and restart:
```
EAR_CLOSED_THRESHOLD=0.25
EAR_CLOSED_FRAMES=8
HEAD_DOWN_PITCH_DEG=-20
HEAD_DOWN_FRAMES=10
GESTURE_HOLD_FRAMES=5
PROCESS_EVERY_N_FRAMES=30
```

### 5. Troubleshooting

| Symptom | Fix |
|---|---|
| `ModuleNotFoundError: No module named 'firebase_admin'` | Not in the venv. `.\venv\Scripts\Activate.ps1`. Prompt should show `(venv)`. |
| `FIREBASE_PROJECT_ID is not set` | No `.env`. `copy .env.example .env`. |
| Hangs on HTTP requests to huggingface.co at startup | First-time Whisper download. `WHISPER_MODEL_SIZE=tiny` in `.env` → 75 MB instead of 480 MB. Async loading (post-2026-04-22) opens the webcam immediately regardless. |
| `Could not open camera at index 0` | Try `CAMERA_INDEX=1` in `.env`. |
| All faces labeled `unknown` | Student not enrolled. Run `enroll_student.py` first. |
| `dlib` compile errors during pip install | You installed `dlib` not `dlib-bin`. Redo Section 2. |
| `ModuleNotFoundError: No module named 'moviepy.editor'` | `pip install "moviepy==1.0.3"`. |
| Sleep detection intermittent | Raise `EAR_CLOSED_THRESHOLD` to `0.28`. Watch `EAR=…/smooth=…` in `test_video.py` debug line. |
| Toilet gesture triggered by peace sign | Bug fixed — gesture now uses bend-angle curl detection. If you still see it, you're on an older build. |
| Finalize POST fails | Expected until Phase 3. Non-fatal. |

### 6. What runs where (quick map)

```
┌─────────────────────────────┐     ┌──────────────────────┐
│  PowerShell #1 (emulator)   │◄────┤ http://127.0.0.1:4000│  Emulator UI
│  firebase emulators:start   │     │  (browser)           │  Firestore + Auth + Storage
└──────────────┬──────────────┘     └──────────────────────┘
               │ Firestore @ 8080, Auth @ 9099, Storage @ 9199
               ▼
┌─────────────────────────────┐
│ PowerShell #2 (venv)        │
│  python enroll_student.py   │  Admin-like enrollment (stopgap until R backend)
│  python capture_app.py      │  Main classroom app
│  python test_video.py       │  Standalone visual test (no Firebase)
└─────────────────────────────┘
```

---

## 📁 Phase 0 — Project Structure & Planning

**Status: ✅ complete (2026-04-21).**

- [x] Create the root project folder (used `nadaStatatistics/` as the existing workspace root instead of `emotion-detection-system/` — no functional difference).
- [x] Inside it, create this folder layout:

```
emotion-detection-system/
├── classroom-app-python/   # Python DESKTOP APP — webcam, face recognition, emotion, writes to Firebase + CSV
│   ├── capture_app.py      # main entry point (OpenCV loop)
│   ├── face_id.py          # face_recognition wrapper (detection + identification)
│   ├── emotion.py          # FER wrapper
│   ├── firebase_writer.py  # firebase-admin writes
│   └── requirements.txt
├── backend-r-plumber/      # R Plumber API — CRUD + auth + analytics (NO detection)
│   ├── plumber.R           # route definitions
│   ├── R/                  # helpers (auth, firestore, models)
│   └── tests/              # testthat tests
├── r-analysis/             # R analysis scripts + Shiny dashboard
├── web-react/              # React web frontend (CRUD + analytics, no camera)
├── mobile-react-native/    # React Native app (CRUD + analytics, no camera)
├── firebase-emulator/      # Firebase Emulator Suite config (firebase.json, rules, seed data)
│   ├── firebase.json       # emulator port config
│   ├── firestore.rules     # Firestore security rules
│   ├── storage.rules       # Storage security rules
│   └── seed/               # exported data for emulator --import
├── data/                   # CSV backups
│   └── emotions.csv
├── firebase/               # Firebase service account JSON — ONLY used when hitting real Firebase (prod)
└── README.md
```

- [x] Initialize git: `git init` and create `.gitignore` (ignore `node_modules/`, `venv/`, `*.csv`, `firebase/*.json`, `.env`, `firebase-emulator/seed/`)
- [x] Install these tools globally on your machine:
  - [x] **R 4.5.3** installed. RStudio not installed (optional; needed when we get to Phases 3–5).
  - [x] Python 3.11.9 (venv at `classroom-app-python/venv/`)
  - [x] Node.js 24.14
  - [x] Java 26
  - [x] **Firebase CLI 15.9.1**
  - [x] Git
  - [ ] VS Code — user has their own editor; optional
  - [ ] Expo CLI — deferred to Phase 7

---

## 🔥 Phase 1 — Firebase Emulator Suite Setup (do this FIRST, everything depends on it)

**Status: ✅ complete (2026-04-21), except a couple of deferred-on-purpose items (real Firebase project, first admin bootstrap).**

**All development runs against the local Emulator Suite.** Storage, Auth, and Firestore are all on localhost. You do **not** need a paid Firebase plan (the real Storage tier requires billing enabled; the emulator does not) and you do **not** need internet access to develop.

You only need a real Firebase project for its **project ID** (the emulator expects one in config) and for production deployment later. A free Spark-plan project is enough — you will never actually write data to it during development.

### 1.1 Create the Firebase project shell (for the project ID)
- [ ] Go to https://console.firebase.google.com and create a new project named `emotion-detection` — **deferred**. `.firebaserc` uses placeholder `emotion-detection-dev`; swap when real project is created.
- [ ] Copy the **project ID** — deferred with the above.
- [ ] (Optional, deferred to Phase 10) Enable Firestore / Auth / Storage in the real project.

### 1.2 Install and configure the Emulator Suite
- [x] `cd firebase-emulator`
- [ ] Run `firebase login` — **skipped**, not needed for emulator-only dev.
- [ ] Run `firebase init emulators` — **skipped**; wrote `firebase.json` / `.firebaserc` / rules files directly (the interactive wizard isn't required).
- [x] Also init Firestore + Storage **rules** (wrote `firestore.rules` and `storage.rules` directly)
- [x] Confirm `firebase.json` roughly looks like:
  ```json
  {
    "firestore":   { "rules": "firestore.rules" },
    "storage":     { "rules": "storage.rules" },
    "emulators": {
      "auth":      { "port": 9099 },
      "firestore": { "port": 8080 },
      "storage":   { "port": 9199 },
      "ui":        { "enabled": true, "port": 4000 },
      "singleProjectMode": true
    }
  }
  ```
- [x] Add `.firebaserc` with your project id (placeholder `emotion-detection-dev`):
  ```json
  { "projects": { "default": "emotion-detection-dev" } }
  ```

### 1.3 Run the emulator
- [x] Start: `firebase emulators:start --import=./seed --export-on-exit=./seed`
  - `seed/` is in `.gitignore`.
- [x] Open the **Emulator UI** at http://localhost:4000.

### 1.4 Define schema + bootstrap first admin via the Emulator UI
- [~] Create these Firestore collections — **schema is documented in `instructions/FIREBASE_SCHEMA.md`**, but actual collections are created lazily by the capture app + `enroll_student.py` (first write creates the collection). Rules are in place for all of them.
  - [x] `students` — written by `enroll_student.py`
  - [ ] `doctors` — Phase 3 (admin CRUD)
  - [ ] `admins` — Phase 3 (admin CRUD)
  - [x] `lectures` — written by `enroll_student.py` / `capture_app.py`
  - [x] `emotions` — written by `firebase_writer.flush_buffer` on the heavy path
  - [ ] `emotions` — fields: `student_id`, `lecture_id`, `timestamp`, `emotion` (FER label), `confidence`, `state` (`"awake"` \| `"sleeping"`), `sleep_reason` (`null` \| `"head_down"` \| `"eyes_closed"` \| `"both"`), `gesture` (`"none"` \| `"hand_raised"` \| `"toilet_request"` \| `"thumbs_up"` \| `"thumbs_down"` \| `"pointing"` \| ...), `engagement_score`. **Written by the Python classroom app, never by clients.** The collection keeps its name `emotions` for continuity even though it now records emotion + state + gesture per observation.
  - [ ] `users` — Phase 3 (created alongside doctors/students/admins by the R backend)
  - [ ] `notifications` — Phase 3
  - [x] `transcripts` — parent doc created by `firebase_writer.create_transcript_doc` when streaming starts
  - [x] `transcripts/{id}/segments` — written live by `StreamTranscriber._publish`
- [x] Storage paths in use:
  - [ ] `students/{student_id}/face.jpg` — not uploaded by `enroll_student.py` (stopgap only saves the encoding); Phase 6 admin UI will upload the raw image too
  - [ ] `doctors/{doctor_id}/face.jpg` — Phase 3 admin CRUD
  - [x] `lectures/{lecture_id}/audio.wav` — uploaded by `firebase_writer.upload_audio` on capture-app exit
  - [ ] `reports/lectures/{lecture_id}.pdf` — Phase 3 (R renders)
- [ ] **Bootstrap the first admin via the Emulator UI:** — **deferred** until Phase 3 (R backend uses the admin). For capture-app testing, the admin isn't needed; `enroll_student.py` is the stopgap.
- [x] Write `firestore.rules` — lockdown complete; service account bypasses; role-based reads via `users.linked_id`.
- [x] Write `storage.rules` — face photos admin-only writable + anyone-authenticated readable; service account bypasses.
- [x] **For dev — no service account key needed.** `_EmulatorCredential` wrapper in `firebase_writer.init_firebase()` uses `AnonymousCredentials` when `FIRESTORE_EMULATOR_HOST` is set.
- [ ] Register a Web app in the real Firebase project — deferred to Phase 10 / when frontends are built.

---

## 🐍 Phase 2 — Python Classroom Capture App

**Status: ✅ complete (2026-04-22). All modules implemented; capture app + test script running against the emulator. Per-phase deviations documented in §2.11 below.**

| § | Area | Status |
|---|---|---|
| 2.1 | Setup (venv, requirements, .env) | ✅ done |
| 2.2 | `face_id.py` (detect + identify) | ✅ done |
| 2.3 | `emotion.py` (FER wrapper) | ✅ done; uses `face_rectangles=` to skip FER's Haar cascade |
| 2.4 | `sleep_detector.py` (EAR + head pose) | ✅ done; EMA smoothing + streak counter added |
| 2.5 | `gesture_detector.py` (MediaPipe Hands) | ✅ done; toilet → rock-on; bend-angle curl detection |
| 2.6 | `engagement.py` (scoring + reducer) | ✅ done; smoke-tested |
| 2.7 | `firebase_writer.py` (firestore + CSV + Storage) | ✅ done; `_EmulatorCredential` wrapper for emulator mode |
| 2.7a | `audio_recorder.py` (sounddevice) | ✅ done |
| 2.7b | `stream_transcribe.py` (faster-whisper + silero-vad) | ✅ done; loads model in background so webcam opens immediately |
| 2.8 | `capture_app.py` main loop | ✅ done; multi-face `FaceTrack` with IoU matching + every-frame sleep/gesture |
| 2.9 | Distribution (PyInstaller) | ⏳ deferred until a stable build is needed |
| 2.10 | `encode_face.py` / `match_face.py` CLIs | ✅ done; shelled out to by Phase 3 R backend when it exists |
| +    | `phone_detector.py` (YOLOv8 cell-phone) | ✅ added — not in spec; see §2.11 |
| +    | `enroll_student.py` | ✅ added — stopgap until Phase 3; see §2.11 |
| +    | `test_video.py` | ✅ added — standalone Firebase-free pipeline tester |

Python is the **classroom-side capture application**. It runs on the classroom PC that has the camera. It is **not** a server and not a microservice — it's a standalone desktop program the doctor (or IT staff) launches before a lecture starts.

**Responsibilities:**
1. Prompt for which lecture is being recorded (pulled from Firestore).
2. Load the enrolled students' face encodings for that lecture.
3. Open the webcam with OpenCV.
4. On each processed frame, for each detected face:
   a. **Identify the student** (face_recognition encoding match).
   b. **Classify emotion** (FER on the face crop).
   c. **Detect sleep state** via MediaPipe Face Mesh — head-pose pitch (chin tucked down → looking down) plus eye-aspect-ratio (eyes closed for ≥N consecutive frames).
   d. **Detect hand gestures** via MediaPipe Hands — hand-raised, toilet-request (ASL T-handshape), thumbs-up/down, pointing. Extensible registry so more gestures can be added later.
5. **Compute engagement score** from emotion + state + gesture (sleeping overrides emotion → 0; hand_raised adds a small boost).
6. Write one `emotions` row per identified face per interval with emotion + state + sleep_reason + gesture + engagement_score → Firestore + CSV.
7. Draw labeled boxes on the live video feed showing name + emotion + `[sleeping]` tag + `✋ hand_raised` etc., so the doctor can sanity-check.
8. On quit, mark the lecture `status: "finished"`.

### 2.1 Setup
- [ ] `cd classroom-app-python`
- [ ] Create virtual env: `python -m venv venv`
- [ ] Activate it: `venv\Scripts\activate` (Windows) or `source venv/bin/activate` (Mac/Linux)
- [ ] Create `requirements.txt` with:
  ```
  opencv-python==4.10.0.84
  face_recognition==1.3.0
  dlib==19.24.2              # face_recognition's native dependency
  fer==22.5.1                # emotion classifier
  tensorflow==2.15.0         # required by FER
  mediapipe==0.10.14         # face mesh (head pose + EAR) + hands (gestures)
  sounddevice==0.4.6         # audio capture during the lecture
  scipy==1.13.1              # wav write (scipy.io.wavfile) + signal
  faster-whisper==1.0.3      # local Whisper transcription (CPU-friendly)
  silero-vad==5.1            # voice activity detection for streaming chunking
  torch==2.3.1               # silero-vad dependency (CPU build)
  torchaudio==2.3.1          # silero-vad dependency
  numpy==1.26.4
  firebase-admin==6.5.0
  requests==2.32.3           # calling the R Plumber /finalize endpoint
  python-dotenv==1.0.1
  ```
- [ ] Install: `pip install -r requirements.txt`
  - **Windows tip:** if `dlib` fails to build, install it via conda first (`conda install -c conda-forge dlib`) or grab a prebuilt wheel matching your Python version. Budget an hour for this on the first try.
- [ ] Create `.env` with:
  ```
  # Firebase project
  FIREBASE_PROJECT_ID=emotion-detection-abc12

  # Emulator mode — leave these set during development
  FIRESTORE_EMULATOR_HOST=localhost:8080
  FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
  FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199

  # Real Firebase (prod) — leave the path empty to stay in emulator mode
  FIREBASE_SERVICE_ACCOUNT_JSON=

  # Capture config
  CSV_PATH=../data/emotions.csv
  CAMERA_INDEX=0
  PROCESS_EVERY_N_FRAMES=30
  SAVE_INTERVAL_SECONDS=3
  FACE_MATCH_TOLERANCE=0.6

  # Sleep-detection thresholds
  EAR_CLOSED_THRESHOLD=0.20        # eye-aspect-ratio below this = eyes closed
  EAR_CLOSED_FRAMES=15             # N consecutive frames before calling it "sleeping"
  HEAD_DOWN_PITCH_DEG=-20          # pitch below this (chin tucked down) = looking down
  HEAD_DOWN_FRAMES=15              # N consecutive frames before calling it "looking down"

  # Gesture-detection thresholds
  GESTURE_HOLD_FRAMES=8            # a gesture must be stable for N frames before being reported

  # Audio + transcription
  AUDIO_SAMPLE_RATE=16000          # 16 kHz mono is what Whisper expects — no need to go higher
  AUDIO_DEVICE_INDEX=              # blank = default mic; integer = specific device
  WHISPER_MODEL_SIZE=small         # `small` is the dev/prod default for this project — fast enough for live streaming on CPU and accurate enough for the lecture setting. Bump to `medium` or `large-v3` only if Arabic accuracy is unacceptable in your environment.
  WHISPER_COMPUTE_TYPE=int8        # int8 on CPU; switch to float16 on GPU
  WHISPER_LANGUAGE=ar              # force Arabic; leave blank for auto-detect
  WHISPER_INITIAL_PROMPT="هذه محاضرة باللغة العربية باللهجة المصرية. كلمات المحاضرة: الاحتمال، المتوسط، الانحراف المعياري، الفرضية الصفرية، القيمة الاحتمالية."

  # Streaming transcription
  STREAM_MAX_CHUNK_SEC=28           # Whisper's native window is 30s; stay under that
  STREAM_MIN_CHUNK_SEC=2            # don't bother transcribing < 2s of speech
  STREAM_VAD_THRESHOLD=0.45         # silero-vad probability threshold
  STREAM_CONTEXT_TOKENS=224         # trailing text fed as initial_prompt to next chunk

  # Plumber backend (used for the /finalize call at end of lecture)
  PLUMBER_URL=http://localhost:8000
  ```
  When the `*_EMULATOR_HOST` env vars are set, `firebase-admin` auto-connects to the emulator; no real credentials are needed. For prod, clear those vars and set `FIREBASE_SERVICE_ACCOUNT_JSON` to the real key path.

### 2.2 Face identification module (`face_id.py`)
- [ ] `load_enrolled_encodings(lecture_id)` — fetches the lecture's `enrolled_student_ids` from Firestore, then loads each student's `face_encoding` array into a `{student_id: np.array(128)}` dict.
- [ ] `detect_and_identify(frame, enrolled)` — runs `face_recognition.face_locations(frame)`, then `face_recognition.face_encodings(frame, locations)`, then compares each encoding against the enrolled dict using `face_recognition.compare_faces` (or `face_distance` for best match). Returns a list of `{box, student_id_or_None}`.
- [ ] **Unknown faces** (no match within tolerance) — log as `student_id="unknown"` so the doctor can see that a face wasn't recognized. Don't crash.

### 2.3 Emotion module (`emotion.py`)
- [ ] Wrap the FER `Detector` class in a single function `detect_emotion(face_crop)` that returns `{emotion, confidence}`.
- [ ] Load the detector once at startup (not per frame) — it's a CNN, don't re-instantiate.

### 2.4 Sleep detection (`sleep_detector.py`)
Uses **MediaPipe Face Mesh** (478 3D face landmarks per face). Two independent signals:

- [ ] **Eyes closed** (`eyes_closed(landmarks) -> bool`): compute the **Eye Aspect Ratio (EAR)** per eye from MediaPipe's standard eye landmark indices (left eye: 33, 160, 158, 133, 153, 144; right eye: 263, 387, 385, 362, 380, 373). EAR = (||p2−p6|| + ||p3−p5||) / (2·||p1−p4||). Average both eyes. Return `True` when EAR < `EAR_CLOSED_THRESHOLD` for ≥ `EAR_CLOSED_FRAMES` consecutive frames (temporal smoothing — otherwise blinks trigger it).
- [ ] **Head looking down** (`head_down(landmarks, image_size) -> bool`): estimate head pose by running `cv2.solvePnP` with the 3D canonical-face coordinates of 6 reference landmarks (nose tip, chin, left/right eye corners, left/right mouth corners) against the 2D MediaPipe landmark positions. Convert the rotation vector to Euler angles; return `True` when **pitch** < `HEAD_DOWN_PITCH_DEG` for ≥ `HEAD_DOWN_FRAMES` consecutive frames. (Pitch convention here: negative = chin tucked toward chest.)
- [ ] **Classifier** (`classify_sleep(face_landmarks, history) -> (state, sleep_reason)`): combines the two signals per tracked face. Returns:
  - `("sleeping", "both")` if both eyes closed AND head down
  - `("sleeping", "eyes_closed")` if only eyes closed
  - `("sleeping", "head_down")` if only head down
  - `("awake", None)` otherwise
- [ ] **Per-face frame history**: keep a small ring buffer of the last ~30 frames of EAR + pitch per `student_id` so thresholds and consecutive-frame counts are meaningful across the processing interval.

### 2.5 Gesture detection (`gesture_detector.py`)
Uses **MediaPipe Hands** (21 landmarks per hand, up to 2 hands per frame). Built-in gestures + extensible registry:

- [ ] Initialize `mp.solutions.hands.Hands(model_complexity=0, max_num_hands=4)` (up to 4 hands for multi-student frames; tune for your classroom size).
- [ ] For each hand, run the gesture registry in order and return the first match. Each gesture is a function `(hand_landmarks, face_ref) -> bool`:
  - [ ] **`hand_raised`** — wrist landmark (#0) y-coord is above the student's nose y-coord (image coords: smaller y = higher). `face_ref` is the MediaPipe-face reference point for "this student's nose".
  - [ ] **`toilet_request`** — ASL **T handshape**: all four fingers curled (tip distance to wrist less than MCP distance to wrist), thumb tip positioned between the index and middle MCP joints. Stable over multiple frames.
  - [ ] **`thumbs_up`** — thumb tip clearly above thumb MCP, other four fingers curled.
  - [ ] **`thumbs_down`** — thumb tip clearly below thumb MCP, other four fingers curled.
  - [ ] **`pointing`** — index finger extended (tip-to-wrist distance large), other three fingers curled.
  - [ ] **`none`** — fallthrough default.
- [ ] **Temporal stability:** only report a gesture once it has held for ≥ `GESTURE_HOLD_FRAMES` consecutive frames. Prevents false positives from hands moving through transient poses.
- [ ] **Assign gestures to students**: pair each detected hand with the nearest face (euclidean distance between hand wrist and face center) so each gesture is attributed to a specific `student_id`.
- [ ] **Extensibility**: the registry is a `list[tuple[str, Callable]]`. Adding a new gesture = appending one entry. Document this in a code comment — the project will want more gestures later.

### 2.6 Engagement scoring (`engagement.py`)
- [ ] Mirror the R-side mapping (keep them in sync — it's the project's business rule). The score now considers emotion, sleep state, and gesture:
  ```python
  EMOTION_TO_ENGAGEMENT = {
      "happy": 0.9, "surprise": 0.8, "neutral": 0.6,
      "sad": 0.3, "angry": 0.2, "fear": 0.2, "disgust": 0.1,
  }
  HAND_RAISED_BONUS = 0.2  # engaged = asking a question

  def engagement_score(emotion, state, gesture, attention=1):
      # Sleeping dominates — a sleeping student is not engaged regardless of facial expression
      if state == "sleeping":
          return 0.0
      base = EMOTION_TO_ENGAGEMENT.get(emotion.lower(), 0.0)
      if gesture == "hand_raised":
          base = min(1.0, base + HAND_RAISED_BONUS)
      return base * attention
  ```
- [ ] Also implement the 4-class reducer (`happy`, `neutral`, `bored`, `confused`) that maps FER's 7 labels to the project's target classes. `sleeping` is a **separate dimension** from these four, recorded in the `state` field — don't collapse it into the emotion.

### 2.7 Firebase writer (`firebase_writer.py`)
- [ ] `init_firebase()` — initializes `firebase-admin` once. Logic:
  - If `FIRESTORE_EMULATOR_HOST` is set, initialize with `credentials.AnonymousCredentials()` and `projectId=FIREBASE_PROJECT_ID` — no real key needed; the SDK auto-connects to the emulator.
  - Otherwise, load the service account JSON at `FIREBASE_SERVICE_ACCOUNT_JSON` — prod mode.
- [ ] `save_observation(student_id, lecture_id, emotion, confidence, state, sleep_reason, gesture, engagement_score)` — writes one doc to the `emotions` collection **and** appends the same row to `../data/emotions.csv`. Batch if possible: buffer rows for `SAVE_INTERVAL_SECONDS` and flush as a `WriteBatch`.
- [ ] `set_lecture_status(lecture_id, status)` — updates the lecture doc's `status` field.
- [ ] `upload_audio(lecture_id, wav_path) -> url` — uploads a local `.wav` file to `lectures/{lecture_id}/audio.wav` in Firebase Storage and returns the URL.
- [ ] `save_transcript(lecture_id, language, segments)` — writes one doc to `transcripts` with `lecture_id`, `language`, and the segments array. Also patches the parent lecture doc with `transcript_id`.
- [ ] **CSV columns** (keep in sync with the Firestore fields): `student_id, lecture_id, timestamp, emotion, confidence, state, sleep_reason, gesture, engagement_score`.

### 2.7a Audio recorder (`audio_recorder.py`)
Captures microphone audio in a background thread while the OpenCV loop runs. The final WAV is used as Whisper input.
- [ ] Use `sounddevice.InputStream(samplerate=AUDIO_SAMPLE_RATE, channels=1, dtype='int16', device=AUDIO_DEVICE_INDEX)` in a background thread.
- [ ] Push every callback chunk into a thread-safe queue; a second thread drains the queue into a `numpy.int16` buffer.
- [ ] On stop: flush buffer, write `scipy.io.wavfile.write(path, AUDIO_SAMPLE_RATE, buffer)` to `./recordings/{lecture_id}.wav`. Keep the file local until `finalize` uploads it.
- [ ] Expose `AudioRecorder.start(lecture_id)` / `.stop() -> wav_path`. The main capture loop owns the lifecycle; this module does not touch Firebase.

### 2.7b Streaming transcription (`stream_transcribe.py`)
Transcription runs **during the lecture, in parallel with the capture loop**, so students can see live captions. It is a separate OS process (or a sibling thread pool) to keep OpenCV + FER + MediaPipe from sharing cycles with Whisper.

**Architecture — producer/consumer pipeline:**

```
sounddevice.InputStream (callback)
        ↓ (small PCM frames, ~32 ms each)
silero-vad accumulator
        ↓ (emits a complete speech segment when silence is detected, or when the buffer hits STREAM_MAX_CHUNK_SEC)
faster-whisper transcriber  (one instance, single-threaded, small + int8)
        ↓ ({start, end, text} per finalized segment, plus trailing tokens for context)
Firestore writer            (adds a doc to transcripts/{id}/segments)
```

- [ ] Load the model **once** at startup:
  ```python
  from faster_whisper import WhisperModel
  model = WhisperModel(
      WHISPER_MODEL_SIZE,           # "small" by default
      device="cpu",
      compute_type=WHISPER_COMPUTE_TYPE,  # "int8" on CPU
      cpu_threads=max(1, os.cpu_count() - 2),  # leave room for capture loop
      num_workers=1,
  )
  ```
- [ ] **Chunk on VAD boundaries, not fixed time windows.** Use `silero-vad` (PyTorch JIT model, CPU-friendly). Accumulate audio until the VAD detects ≥500 ms of trailing silence OR the buffer reaches `STREAM_MAX_CHUNK_SEC`. This eliminates mid-word cuts and dramatically reduces "chunk context weakness".
- [ ] **Feed the previous chunk's tail back in as `initial_prompt`.** Keep a rolling buffer of the last `STREAM_CONTEXT_TOKENS` (~224 tokens) of transcribed text; pass it as `initial_prompt` on the next `model.transcribe()` call. This gives Whisper the context it normally uses via `condition_on_previous_text`, but across independently-chunked calls.
- [ ] **Per-call transcription config (Arabic-optimized):**
  ```python
  segments, info = model.transcribe(
      audio_np_float32,              # VAD-trimmed segment, 16 kHz mono
      language=WHISPER_LANGUAGE or None,
      task="transcribe",
      beam_size=5,
      best_of=5,
      patience=2.0,
      temperature=(0.0, 0.2, 0.4, 0.6, 0.8, 1.0),  # fallback ladder
      compression_ratio_threshold=2.4,
      log_prob_threshold=-1.0,
      no_speech_threshold=0.55,
      condition_on_previous_text=True,
      initial_prompt=rolling_context + " " + WHISPER_INITIAL_PROMPT,
      word_timestamps=True,
      vad_filter=False,              # we already VAD'd upstream
      hallucination_silence_threshold=2.0,
  )
  ```
- [ ] **Write each segment to Firestore immediately:** `firestore.collection("transcripts/{id}/segments").add({start, end, text, created_at, chunk_index})`. Don't batch — students should see captions within a second or two of the words being spoken.
- [ ] Also patch `transcripts/{id}` with updated `last_updated_at` + `segment_count` after each write.
- [ ] **Light audio preprocessing only:**
  - [ ] High-pass filter at 80 Hz (`scipy.signal.butter` order 2) to remove room rumble + HVAC
  - [ ] Peak-normalize each VAD segment to -3 dBFS
  - [ ] **Do not** apply aggressive spectral noise reduction, noise gates, or RNNoise — they eat Arabic voiceless consonants (ح، ص، ه) and ruin dialect accuracy
- [ ] **On lecture exit:** flush any in-flight audio, set `transcripts/{id}.completed = true`, stop the stream transcriber cleanly. The final `wav` (from `audio_recorder.py`) is still uploaded for the archival record, but the segments are already all in Firestore.
- [ ] Skip silently on model download failure (log a warning, do not block the finalize step); the lecture continues recording and writes the final WAV — a batch transcription can be requested later.

**Why `small` on CPU:** the `small` model runs comfortably faster than real-time on a modern CPU with `faster-whisper` + `int8`, which is what streaming needs. It is less accurate than `medium` / `large-v3` — especially on dialectal Arabic — but the Arabic-specific configuration here (rolling-context prompt, domain + dialect seed, VAD chunking, temperature fallback, word timestamps) recovers most of the accuracy gap. If live-stream quality is unacceptable in your environment, raise `WHISPER_MODEL_SIZE` to `medium` (about 2× slower, ~15–25% WER drop) or `large-v3` (3–4× slower, ~25–40% WER drop) without changing any other code — only the env var flips.

### 2.8 Main capture loop (`capture_app.py`)
- [ ] At startup:
  - [ ] Authenticate Firebase
  - [ ] List lectures with `status in ("scheduled", "recording")` and prompt the user to pick one (use `inquirer` or a plain `input()` with a numbered list)
  - [ ] Set the chosen lecture's status to `recording`
  - [ ] Load enrolled student encodings
  - [ ] Initialize MediaPipe Face Mesh and MediaPipe Hands once (they load model weights on first call — don't re-init per frame)
  - [ ] Initialize FER detector once
  - [ ] **Start `AudioRecorder`** in a background thread so audio is captured in parallel with video
  - [ ] **Start `StreamTranscriber`** (from `stream_transcribe.py`) — it shares the audio stream with the recorder and begins writing segments to Firestore live as the doctor speaks. Students connected to the LiveTranscript page will see captions update within a couple of seconds.
- [ ] Main loop:
  - [ ] Read frame from webcam (`cv2.VideoCapture`)
  - [ ] Run MediaPipe Face Mesh on the full frame → face landmarks per face
  - [ ] Run MediaPipe Hands on the full frame → hand landmarks
  - [ ] Every `PROCESS_EVERY_N_FRAMES`th frame (heavy path), for each detected face:
    - [ ] `detect_and_identify` → student_id (or `"unknown"`)
    - [ ] `detect_emotion(face_crop)` → emotion + confidence
    - [ ] `classify_sleep(face_landmarks, history[student_id])` → state + sleep_reason
    - [ ] Match nearest hand to this face → `classify_gesture(hand_landmarks)` → gesture
    - [ ] `engagement_score(emotion, state, gesture)` → score
    - [ ] Buffer a row
  - [ ] On non-heavy frames, carry forward the last known state/emotion/gesture per tracked face (nearest-center tracker like the existing prototype) so the drawn labels don't flicker.
  - [ ] Every `SAVE_INTERVAL_SECONDS`: flush buffered rows to Firebase + CSV
  - [ ] Draw labeled boxes showing `{name} | {emotion} | [sleeping: head_down]` and a second line with any active `gesture` icon/text. Use a different color for sleeping (red) vs awake (green), and another accent for hand_raised (blue).
  - [ ] `cv2.imshow("Classroom Capture", frame)`
  - [ ] `cv2.waitKey(1) == ord('q')` → exit
- [ ] **On exit — the finalize sequence** (run in this order; each step is best-effort, log errors but don't crash):
  - [ ] Flush any buffered observation rows
  - [ ] Release the webcam, close MediaPipe solutions
  - [ ] Stop the stream transcriber cleanly — flush any in-flight audio into a final segment and mark `transcripts/{lecture_id}.completed = true`
  - [ ] Stop the audio recorder, get the final `wav_path`
  - [ ] `upload_audio(lecture_id, wav_path)` → saves `audio_url` on the lecture doc
  - [ ] (Optional) If the streaming transcript looks rough, run a one-pass offline transcription of the full WAV with a larger model (`medium` or `large-v3`) + the same Arabic config, overwrite the segments, and set `language` correctly. Usually not needed — the streaming transcript is already the full transcript.
  - [ ] `requests.post(f"{PLUMBER_URL}/api/lectures/{lecture_id}/finalize", headers={"X-Finalize-Secret": FINALIZE_SHARED_SECRET})` — the R backend then marks status=finished and kicks off PDF report generation
  - [ ] Print a summary: "Captured N observations across M students; audio: Xs; transcript: Y segments (already in Firestore, students saw them live); report will be ready at /api/lectures/{id}/report in a moment."
- [ ] **Test checkpoint:** enroll 2 students (admin uploads their photos via the web UI → Phase 6), run `python capture_app.py`, pick a lecture, sit both people in front of the camera. Verify:
  - [ ] Each face is labeled with the correct name
  - [ ] Closing eyes for ~3 seconds flips the label to `[sleeping: eyes_closed]` and sets `engagement_score = 0` in the next written row
  - [ ] Looking down at your desk flips to `[sleeping: head_down]`
  - [ ] Raising a hand above your head adds `✋ hand_raised` and boosts the engagement score
  - [ ] Making the T-handshape adds `🚽 toilet_request`
  - [ ] `emotions` rows appear in Firestore + `data/emotions.csv` with the new fields populated

### 2.9 Distribution
- [ ] For handing it to a non-developer, bundle with PyInstaller: `pyinstaller --onefile capture_app.py`. This produces a single `.exe` (Windows) or binary. The `.env` and `serviceAccountKey.json` must sit next to the executable.
- [ ] MediaPipe ships its model files inside the package; PyInstaller needs `--collect-all=mediapipe` to include them. Without this flag the bundled exe will crash on first use.

### 2.10 Face helpers for the R backend (`encode_face.py`, `match_face.py`)
The R Plumber backend needs to (a) compute a 128-d encoding from an uploaded enrollment photo, and (b) match a login photo against a list of candidate encodings. Both use `face_recognition`, which is Python-only, so the R backend shells out to these small CLI scripts via `system2()`. They live **in the same `classroom-app-python/` folder** so they share the virtual env + `face_recognition` install — no duplication.

- [ ] Create `encode_face.py` — CLI usage: `python encode_face.py <image_path>`
  - [ ] Reads the image
  - [ ] Runs `face_recognition.face_locations` + `face_recognition.face_encodings`
  - [ ] **Requires exactly one face** in the photo — fails with JSON `{"error": "no_face"}` or `{"error": "multiple_faces"}` otherwise
  - [ ] Prints JSON to stdout: `{"encoding": [128 floats]}` on success
  - [ ] Exits 0 on success, non-zero on error
- [ ] Create `match_face.py` — CLI usage: `python match_face.py <image_path> <candidates_json_path>`
  - [ ] Candidates file format: `[{"user_id": "stu_042", "encoding": [...128 floats...]}, ...]`
  - [ ] Encodes the uploaded photo; fails cleanly if no face or multiple faces
  - [ ] Computes `face_recognition.face_distance` against every candidate
  - [ ] Picks the minimum distance; if below `FACE_MATCH_TOLERANCE` (default 0.6), returns `{"user_id": "<id>", "distance": <float>}`; otherwise returns `{"error": "no_match", "best_distance": <float>}`
  - [ ] Exits 0 on match, non-zero on no-match or error
- [ ] Both scripts should be **small, side-effect-free, and fast** — they're called once per enrollment and once per face-login attempt. No Firebase writes from these scripts; R handles persistence.

### 2.11 Phase 2 implementation notes (what actually got built vs. this spec)

Phase 2 is **complete** as of 2026-04-22. A handful of deliberate deviations and additions during implementation — documented here so future phases can rely on the actual shape of the code.

**Dependency swaps**
- `dlib==19.24.2` → `dlib-bin>=19.24.6`. Prebuilt wheel; skips the Visual-C++ Build Tools headache on Windows. Same `dlib` module at runtime.
- `face_recognition==1.3.0` installed with `--no-deps` + its runtime deps (`face_recognition_models`, `Click`, `Pillow`) installed separately, because pip otherwise re-resolves `dlib==19.24.2` from source.
- `moviepy==1.0.3` pinned. `fer==22.5.1` imports `moviepy.editor`, removed in moviepy v2.
- `ultralytics>=8.4` added for YOLOv8n cell-phone detection (see "Feature additions" below).

**Feature additions (not in the original spec)**
- `phone_detector.py` — YOLOv8 nano cell-phone detection on the heavy path. Per-track `on_phone` flag; renders `!! ON PHONE !!` warning in the label stack. Hands whose bbox overlaps a phone box are excluded from gesture classification (so the phone-holding hand can't simultaneously "hand_raise").
- `enroll_student.py` — stopgap CLI to create a `students/{id}` doc with the face_encoding and optionally create / update a lecture. Needed because the R backend (Phase 3) that normally owns `POST /api/students/<id>/face` doesn't exist yet. Auto-creates a minimal lecture if the target `lecture_id` doesn't exist.
- `test_video.py` — standalone Firebase-free pipeline runner for tuning + debugging. Runs sleep + gesture every frame, prints live EAR / smoothed EAR / streak / pitch / gesture diagnostic.

**Algorithm changes**
- **Toilet gesture** changed from ASL T-handshape to **index + pinkie extended** (rock-on / ILY). The T requires the thumb tucked precisely between the index and middle MCPs — unreliable in practice and awkward for non-signers. Rock-on is easier to hold and disambiguates cleanly from peace / pointing.
- **Finger curl detection** rewritten to use the **MCP→PIP→TIP bend angle** (rotation-invariant). The old "tip closer to wrist than MCP" heuristic was fooled by 2D projection of hands pointing away from the camera, causing peace signs to read as fully curled → false `toilet_request`.
- **`SleepHistory`** rewritten to EMA-smooth EAR + pitch (α=0.35) before thresholding, and track a consecutive-frame *streak* counter that only resets when the smoothed value rises above threshold. The old "all last N frames below threshold" rule broke on single-frame landmark jitter, causing intermittent detections.
- **FER emotion** now called with `face_rectangles=[(x, y, w, h)]` + the full BGR frame — FER's internal Haar cascade fails on tight crops and would return the `{"neutral", 0.0}` fallthrough forever.
- **Multi-face tracker** (`FaceTrack` class in `capture_app.py`) — per-track state (EMA-smoothed box, student_id, sleep + gesture history, last emotion, on-phone flag). MediaPipe mesh faces are matched to existing tracks by IoU every frame; face_recognition attaches `student_id` on the heavy path. Replaces the previous per-`student_id` dict which only worked when identification ran every frame.
- **Sleep + gesture classification moved to every-frame cadence** in `capture_app.py` (were heavy-path-only). Reaction time improves from ~1 Hz to ~30 Hz. Face mesh + hands run every frame anyway, so the added cost is cheap Python math.
- **EMA box smoothing** on the MediaPipe-derived bounding box (α=0.45). Eliminates the ~1-Hz snapping from the old face_recognition-only box.
- **Observations are only saved for identified students** (`student_id != "unknown"`). The old code flooded the `emotions` collection with `"unknown"` rows during enrollment onboarding.
- **Async Whisper load**: `StreamTranscriber.start()` launches a background thread that loads the model + enters `_run()`. The OpenCV window opens immediately; `feed()` drops audio until the model is ready. Pre-fix, the ~15-minute first-run download blocked the main thread.
- **TF/Keras deprecation chatter silenced** at the top of both entry scripts (`TF_CPP_MIN_LOG_LEVEL=3`, `logging.getLogger("tensorflow").setLevel(ERROR)`, plus `warnings.filterwarnings` for `DeprecationWarning` / `FutureWarning`). Must run before `import tensorflow` / `import fer`.
- **Deprecation-safe Firestore `.where`** — uses `filter=FieldFilter(...)` kwarg instead of positional args.

**Default thresholds in `.env.example` (tuned for every-frame cadence, ~30 fps)**
- `EAR_CLOSED_THRESHOLD=0.25` (was 0.20 — too strict for most face shapes)
- `EAR_CLOSED_FRAMES=15` at 30 fps ≈ 0.5 sec
- `HEAD_DOWN_FRAMES=15`, `GESTURE_HOLD_FRAMES=8`
- `WHISPER_MODEL_SIZE` remains `small` in `.env.example`; `tiny` is the fastest-first-run option when demoing.

**Known limitations / gaps**
- `POST /api/lectures/<id>/finalize` fails with ConnectionError — R Plumber backend is Phase 3. Non-fatal.
- `students/{id}/face.jpg` Storage upload is not performed by `enroll_student.py` (only the encoding + metadata doc). When the admin UI exists in Phase 6, it will upload the raw image too.
- Face sign-in endpoint (`POST /api/auth/face-login`) doesn't exist yet — Phase 3.
- The 4-class reducer in `engagement.py` uses a documented but heuristic mapping (e.g. `surprise → confused`). Change here must be mirrored in `backend-r-plumber/R/engagement.R` per the Phase 9 parity test.

Operational runbook for running the current system: see `HOW_TO_RUN.md` at the repo root.

---

## ⚡ Phase 3 — R Plumber Backend (the main API)

**Status: ⏳ not started.** R 4.5.3 is installed; RStudio is not. The capture app's `POST /finalize` call fails with ConnectionError — this is expected until Phase 3 lands; non-fatal.

The backend that both the React web app and the React Native app talk to is written in **R using [Plumber](https://www.rplumber.io/)**. It handles auth, role resolution, CRUD for students/doctors/lectures, and analytics. **It does not do any detection** — the Python classroom app handles capture and writes `emotions` rows directly to Firestore. R only *reads* emotions for analytics.

### 3.1 Setup
- [ ] `cd backend-r-plumber`
- [ ] Install R packages (one-time):
  ```r
  install.packages(c(
    "plumber",       # HTTP framework
    "jsonlite",      # JSON
    "httr",          # HTTP client (calls Firebase REST API + Brevo)
    "uuid",          # id generation
    "dplyr",         # data manipulation
    "readr",         # CSV I/O
    "lubridate",     # timestamps
    "openssl",       # JWT verification for Firebase tokens
    "jose",          # JWT parsing/verification
    "logger",        # structured logging
    "rmarkdown",     # lecture report rendering
    "knitr",         # Rmd engine
    "writexl",       # xlsx export
    "ggplot2",       # plots embedded in the report
    "scales",        # chart formatting
    "future",        # async report generation (don't block the request thread)
    "promises"       # async plumber handlers
  ))
  ```
- [ ] Install `tinytex` so R can render PDFs without a system LaTeX install:
  ```r
  install.packages("tinytex")
  tinytex::install_tinytex()   # ~300 MB, one-time
  ```
- [ ] Create `plumber.R` (route file) and `R/` (helpers folder)
- [ ] Create `.Renviron` with:
  ```
  FIREBASE_PROJECT_ID=emotion-detection-abc12

  # Emulator mode — leave these set during development
  FIRESTORE_EMULATOR_HOST=localhost:8080
  FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
  FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199

  # Real Firebase (prod) — leave empty to stay in emulator mode
  FIREBASE_SERVICE_ACCOUNT_JSON=

  # Brevo (transactional email — used for doctor → student notifications)
  BREVO_API_KEY=xkeysib-...
  BREVO_SENDER_EMAIL=noreply@your-college-domain.edu
  BREVO_SENDER_NAME=Classroom Emotion Detection

  # Shared secret the Python classroom app uses on /finalize (not exposed to clients)
  FINALIZE_SHARED_SECRET=choose-a-long-random-string-here

  CSV_PATH=../data/emotions.csv
  REPORT_OUTPUT_DIR=../reports-out   # temp dir for rendered PDFs before Storage upload
  PLUMBER_PORT=8000
  ```
  Sign up at https://www.brevo.com, get an API key from **SMTP & API → API Keys**. The free tier allows 300 emails/day which is plenty for a college project.

### 3.2 Auth & role resolution (build this FIRST — every other endpoint depends on it)
- [ ] Create `R/auth.R`:
  - [ ] `verify_firebase_token(id_token)` — two code paths based on env:
    - **Emulator mode** (`FIREBASE_AUTH_EMULATOR_HOST` is set): emulator ID tokens are unsigned — decode the JWT body without signature verification (`jose::jwt_split` + base64 decode) and trust the claims. This is fine for dev.
    - **Prod mode**: fetch Google public keys (cache, refresh on expiry), verify the JWT signature + claims (iss, aud, exp) using `jose::jwt_decode_sig`, return the decoded claims or throw.
  - [ ] `get_current_user(req)` — Plumber filter that reads the `Authorization: Bearer <token>` header, calls `verify_firebase_token`, looks up the `users` Firestore doc by uid to get `role` and `linked_id`, and attaches a `user` object to `req` as `{uid, role, linked_id, email}`.
  - [ ] Role guards: `require_admin(req)`, `require_doctor(req)`, `require_student(req)`, `require_admin_or_doctor(req)` — helper functions that return an HTTP 403 via `plumber::api_error` if the role doesn't match.
- [ ] Register `get_current_user` as a Plumber **filter** (`#* @filter auth`) so every route below automatically gets `req$user` populated.

### 3.3 Firestore client (R-side)
- [ ] Create `R/firestore.R` — thin wrapper around the Firestore REST API using `httr`. Implement:
  - [ ] `fs_base_url()` — returns `http://<FIRESTORE_EMULATOR_HOST>/v1/projects/<project>/databases/(default)/documents` if the emulator host is set, otherwise `https://firestore.googleapis.com/v1/...`
  - [ ] `fs_auth_header()` — in emulator mode returns `Authorization: Bearer owner` (the magic dev token the emulator accepts); in prod, loads the service account JSON and mints an OAuth2 token, cached until ~5 min before expiry
  - [ ] `fs_get(path)` — fetch a document
  - [ ] `fs_list(collection, filters = NULL)` — list/query documents
  - [ ] `fs_create(collection, data)` — create with server-generated id
  - [ ] `fs_update(path, data)` — patch
  - [ ] `fs_delete(path)` — delete (use this only for hard deletes; role CRUD uses soft-delete via `fs_update`)

### 3.4 Build these endpoints

All routes live in `plumber.R` using `#* @get`, `#* @post`, etc. annotations. The `auth` filter runs first; each handler then calls the appropriate role guard.

**Analytics (read-only for `emotions` — the Python classroom app is the writer)**
- [ ] `GET /api/emotions` — returns emotions from Firestore (supports `?lecture_id=` and `?student_id=` filters). Each row includes `emotion`, `state`, `sleep_reason`, `gesture`, `engagement_score`. **Scoped by role**: students only see their own rows, doctors only see rows from their lectures, admins see everything.
- [ ] `GET /api/emotions/csv` — returns the full CSV file. Admin-only.
- [ ] `GET /api/analytics/engagement` — aggregated engagement per lecture. Admins see all; doctors see only their own lectures. Implemented in R using `dplyr`.
- [ ] `GET /api/analytics/sleep` — per-lecture % of rows where `state == "sleeping"`, broken down by `sleep_reason`. Useful for flagging lectures where many students doze off.
- [ ] `GET /api/analytics/gestures` — time-series of gesture events per lecture (`?lecture_id=` required), grouped by `gesture`. Useful for spotting bursts of `hand_raised` (high engagement moment) or `toilet_request` (needs immediate doctor attention).
- [ ] `GET /api/analytics/student/<id>/comparison` — the student's own engagement vs the anonymized class average. Returns `{self_mean, class_mean, percentile, per_lecture: [{lecture_id, self, class_mean}]}`. Scoped: students see only their own; doctors see students in their lectures; admins see any. **Never include other students' individual scores in the response.**
- [ ] `GET /api/analytics/heatmap` — data shaped for the engagement heatmap on the dashboard. Returns `{cells: [{lecture_id, date, doctor_id, engagement_mean, sleep_rate}]}`. Front end colors a calendar/grid from this. Admins: all lectures; doctors: own lectures; students: enrolled lectures.

**Data exports**
- [ ] `GET /api/exports/emotions.csv` (and `.xlsx`) — returns the observation rows as a direct file download with proper `Content-Type` + `Content-Disposition: attachment`. Accepts the same role scoping as `/api/emotions`. Use `writexl::write_xlsx` for the xlsx variant; pipe through `plumber`'s `res$body` as raw bytes with the right MIME type.
- [ ] `GET /api/exports/engagement.csv` (and `.xlsx`) — aggregated engagement per lecture. Same role scoping as `/api/analytics/engagement`.
- [ ] `GET /api/exports/attendance.csv` (and `.xlsx`) — one row per student-lecture with observation count, first-seen timestamp, last-seen timestamp. Derived from `emotions` in R via `dplyr::group_by(student_id, lecture_id)`.

**Lectures**
- [ ] `POST /api/lectures` — create a lecture. Doctors and admins only (doctor is auto-set as owner; admin can set any `doctor_id`).
- [ ] `GET /api/lectures` — list lectures. Scoped by role (students: enrolled only; doctors: owned only; admins: all).
- [ ] `PUT /api/lectures/<id>` — update lecture. Owner doctor or admin only.
- [ ] `DELETE /api/lectures/<id>` — delete lecture. Owner doctor or admin only.
- [ ] `POST /api/lectures/<id>/finalize` — **called by the Python classroom app at lecture end**. Accepts a header `X-Finalize-Secret: <FINALIZE_SHARED_SECRET>` instead of a user Firebase token. Sets `status = "finished"`, `finalized_at = now()`, then kicks off PDF report generation asynchronously via `future::future({ render_lecture_report(id) })`. Returns `{status: "finalized", report: "pending"}`.
- [ ] `POST /api/lectures/<id>/generate-report` — **manual re-trigger** of the report for a doctor/admin (useful if the auto-generation failed or the report is outdated). Role: owner doctor or admin.
- [ ] `GET /api/lectures/<id>/report` — returns a JSON `{url: ..., generated_at: ...}` pointing at the PDF in Firebase Storage. Scoped: owner doctor, enrolled student, or admin.
- [ ] `GET /api/lectures/<id>/transcript` — returns `{language, segments: [...]}`. Same role scoping as the report.

**Students — admin CRUD**
- [ ] `POST /api/students` — create a student (also creates Firebase Auth user via the Admin SDK REST endpoint + `users` entry). **Admin only.**
- [ ] `GET /api/students` — list students. Admin sees all; doctor sees students enrolled in their lectures; student sees only self.
- [ ] `GET /api/students/<id>` — fetch one student. Same role scoping.
- [ ] `PUT /api/students/<id>` — update student. **Admin only** (students use `PUT /api/me` for their own profile).
- [ ] `DELETE /api/students/<id>` — soft-delete (set `active: false`, do NOT wipe `emotions` rows). **Admin only.**
- [ ] `POST /api/students/<id>/face` — **upload a student's enrollment face photo** (multipart image). The handler: (1) uploads the raw image to Firebase Storage at `students/<id>/face.jpg`, (2) calls `classroom-app-python/encode_face.py` via `system2()` to get the 128-dim encoding, (3) saves `face_photo_url` + `face_encoding` on the student doc. **Admin only.** Without this step, the Python classroom app cannot recognize the student **and** the student cannot use face sign-in.

**Doctors — admin CRUD**
- [ ] `POST /api/doctors` — create a doctor (also creates Firebase Auth user + `users` entry). **Admin only.**
- [ ] `GET /api/doctors` — list doctors. **Admin only** for the full list; doctors/students only see names of doctors teaching their enrolled lectures.
- [ ] `GET /api/doctors/<id>` — fetch one doctor. **Admin only.**
- [ ] `PUT /api/doctors/<id>` — update doctor. **Admin only** (doctors use `PUT /api/me`).
- [ ] `DELETE /api/doctors/<id>` — soft-delete (set `active: false`; decide whether to reassign their lectures to another doctor or mark them archived — document the choice in code). **Admin only.**
- [ ] `POST /api/doctors/<id>/face` — **upload a doctor's enrollment face photo** (mirrors the student face upload). Same three-step handler: Storage upload → `encode_face.py` → save `face_photo_url` + `face_encoding` on the doctor doc. **Admin only.** Required for the doctor to use face sign-in.

**Face sign-in (student + doctor only — admin intentionally excluded)**
- [ ] `POST /api/auth/face-login` — accepts a multipart image + a `role` hint (`"student"` or `"doctor"`). **No auth required** (this IS the authentication endpoint). Flow:
  1. Reject if `role == "admin"` (403).
  2. Save the uploaded photo to a temp file.
  3. Query Firestore for all `active: true` records in the requested role's collection with a non-empty `face_encoding`. Build a candidates JSON file.
  4. Call `match_face.py <temp_photo> <candidates>` via `system2()`.
  5. If no match: return 401 with `{"error": "no_match"}`.
  6. If matched to a `linked_id`, look up the matching `users` doc to get the Firebase Auth `uid`.
  7. **Mint a Firebase custom token** for that uid using the Admin SDK's custom-token endpoint (via `httr` POST to `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken` is the frontend's job; R mints by signing a JWT with the service account). In emulator mode, the custom-token endpoint is `http://localhost:9099/identitytoolkit.googleapis.com/v1/...` with the magic emulator signing.
  8. Return `{"custom_token": "<jwt>", "role": "student|doctor"}`.
- [ ] The frontend then calls `signInWithCustomToken(auth, custom_token)` — Firebase Auth returns a normal ID token, and all subsequent calls flow through the same auth filter as email-password logins. **From Plumber's perspective there is no second code path** — face-login just produces a valid Firebase session.
- [ ] Rate-limit the endpoint (even for a college project) — without it, someone holding a stack of photos can brute-force through your enrolled users. In-memory token bucket keyed by IP is enough.
- [ ] **Optional liveness check** (recommended but not required for the college demo): the endpoint accepts **two** frames a half-second apart. `match_face.py` gets the first frame; a separate tiny check confirms the EAR or head-pose changed between frames (meaning a real human blinked or moved, not a held-up photo). Document it as a stretch goal.

**Notifications (doctor → students via Brevo email)**
- [ ] `POST /api/notifications` — **doctor-only**. Request body: `{lecture_id, subject, body, student_ids?}`.
  - If `student_ids` is omitted, the recipients default to all `enrolled_student_ids` on the lecture.
  - Doctor must own the lecture (match via `users.linked_id` == `lectures.doctor_id`); admin-submitted requests are rejected (admins audit, they don't send).
  - Handler flow: (1) resolve student emails from Firestore, (2) POST to Brevo `https://api.brevo.com/v3/smtp/email` via `httr` with header `api-key: <BREVO_API_KEY>`; payload shape:
    ```json
    {
      "sender": {"email": "<BREVO_SENDER_EMAIL>", "name": "<BREVO_SENDER_NAME>"},
      "to": [{"email": "stu1@example.edu", "name": "Stu One"}, ...],
      "subject": "<subject>",
      "htmlContent": "<body converted to simple HTML>"
    }
    ```
    (3) record the send in the `notifications` audit collection with `status: "sent"` + Brevo's `messageId`; on API failure record `status: "failed"` + the error text. Return the new notification doc.
- [ ] `GET /api/notifications` — list sent notifications. **Doctor** sees only their own; **admin** sees everything; students cannot call this.
- [ ] Create `R/brevo.R` — one function `send_email(to, subject, html_body) -> list(status, message_id_or_error)`. Keep the Brevo call in a single helper so all business logic in the endpoint is plain R.

**Current user / profile**
- [ ] `GET /api/me` — returns the calling user's role + profile
- [ ] `PUT /api/me` — update own profile (name, etc. — not role, not email)

**Admin dashboard**
- [ ] `GET /api/admin/stats` — total students, total doctors, total lectures, total emotions recorded, avg engagement system-wide. **Admin only.**

**Misc**
- [ ] `GET /health` — simple health check returning `{status: 'ok'}`

### 3.4a Lecture report template (`reports/lecture_report.Rmd`)
The `generate-report` endpoint calls `rmarkdown::render("reports/lecture_report.Rmd", output_format = "pdf_document", params = list(lecture_id = <id>))`. The template should produce a self-contained PDF that the doctor can share.

- [ ] Parameterized header: `params: { lecture_id: "" }`
- [ ] Load helpers at the top: `source("../R/firestore.R")`, `source("../R/engagement.R")`
- [ ] Sections:
  - [ ] **Cover**: lecture title, doctor name, date, duration, enrolled count
  - [ ] **Attendance**: table of student name + observation count + first-seen / last-seen (derived from `emotions`)
  - [ ] **Engagement over time**: `ggplot2` line chart (x = timestamp, y = mean engagement_score per 30-second bucket)
  - [ ] **Emotion distribution**: bar chart of emotion counts
  - [ ] **Sleep rate**: stacked bar broken down by `sleep_reason`
  - [ ] **Gesture log**: table of (timestamp, student, gesture) for non-`none` gestures
  - [ ] **Transcript excerpt** (if available): first paragraph of the Whisper transcript plus the 3 lowest-engagement segments with their text — "this is what was being said when the class lost attention"
- [ ] After render, upload the PDF to `reports/lectures/{lecture_id}.pdf` in Firebase Storage and save the URL on the lecture doc as `report_pdf_url`.
- [ ] Run this inside `future::future({ ... })` so the HTTP request returns immediately; the PDF appears a few seconds later.

### 3.5 Engagement scoring (R — used for analytics)
The Python classroom app computes engagement at write time, but R also needs the same mapping to recompute/aggregate in the Shiny dashboard and the analytics endpoints. **Keep the two in sync.**
- [ ] Create `R/engagement.R` with the **same rules as the Python side** (emotion + state + gesture → score):
  ```r
  EMOTION_TO_ENGAGEMENT <- c(
    happy = 0.9, surprise = 0.8, neutral = 0.6,
    sad = 0.3, angry = 0.2, fear = 0.2, disgust = 0.1
  )
  HAND_RAISED_BONUS <- 0.2

  engagement_score <- function(emotion, state = "awake", gesture = "none", attention = 1) {
    if (!is.null(state) && tolower(state) == "sleeping") return(0.0)
    base <- EMOTION_TO_ENGAGEMENT[tolower(emotion)]
    if (is.na(base)) base <- 0
    if (!is.null(gesture) && tolower(gesture) == "hand_raised") {
      base <- min(1.0, base + HAND_RAISED_BONUS)
    }
    unname(base * attention)
  }
  ```
- [ ] Also add a 4-class mapper (`happy`, `neutral`, `bored`, `confused`) that reduces FER's 7 labels to the project's target classes. `sleeping` stays in the `state` column — never collapsed into the emotion.
- [ ] Add a `testthat` test that compares R output with the Python output for a fixed set of inputs (emotion × state × gesture combinations). **If they diverge, engagement numbers in the dashboard won't match what the capture app wrote.**

### 3.6 Middleware & config
- [ ] Enable CORS for `http://localhost:5173` (React) and `http://localhost:19006` (Expo) — use `plumber::forward()` hooks or the `plumber` CORS helper.
- [ ] Add structured request logging via `logger`
- [ ] Entry point: `run_api.R`
  ```r
  library(plumber)
  pr("plumber.R") |> pr_run(port = as.integer(Sys.getenv("PLUMBER_PORT", "8000")))
  ```
- [ ] **Test checkpoint:** `Rscript run_api.R`. Open `http://localhost:8000/__docs__/` — Plumber's built-in Swagger UI should show every endpoint. Test each one with a valid Firebase ID token in the `Authorization` header. (No Python process needs to be running — the R backend does not talk to Python.)

---

## 📊 Phase 4 — R Statistical Analysis

**Status: ⏳ not started.**

### 4.1 Setup
- [ ] `cd r-analysis`
- [ ] Open RStudio, set working directory to this folder
- [ ] Install packages:
  ```r
  install.packages(c("dplyr", "ggplot2", "shiny", "shinydashboard", 
                     "httr", "jsonlite", "lubridate", "tidyr", 
                     "cluster", "factoextra", "DT", "plotly"))
  ```

### 4.2 Data loader script (`load_data.R`)
Because the backend is also R, the analysis scripts can load data **two ways** — pick whichever fits:
- [ ] `load_from_api()` — `httr::GET("http://localhost:8000/api/emotions/csv")` for a quick HTTP pull (useful when Shiny is deployed separately from the backend)
- [ ] `load_from_csv()` — reads `../data/emotions.csv` directly (fastest; use for offline analysis)
- [ ] `load_from_firestore()` — calls the same `R/firestore.R` helpers the backend uses (via `source("../backend-r-plumber/R/firestore.R")`) so you don't duplicate Firestore code. Preferred for Shiny when deployed on the same host as the backend.

### 4.3 Analysis scripts (one per required analysis)
- [ ] `01_emotion_frequency.R` — frequency distribution per emotion using `dplyr::count()` + `ggplot2::geom_bar()`
- [ ] `02_emotion_by_lecture.R` — emotion variation across lectures using faceted bar charts
- [ ] `03_engagement_score.R` — calculate mean engagement score per lecture and per student
- [ ] `04_time_trends.R` — engagement over time using line plots (x = timestamp, y = engagement)
- [ ] `05_cluster_lecturers.R` — k-means clustering of lecturers by average engagement metrics (use `kmeans()` and visualize with `factoextra::fviz_cluster()`)
- [ ] `06_cluster_student_subject.R` — cluster student-subject pairs by engagement pattern
- [ ] **Test checkpoint:** Each script runs without errors and produces a plot saved to `r-analysis/plots/`

---

## 📈 Phase 5 — Shiny Dashboard

**Status: ⏳ not started.**

- [ ] Create `app.R` inside `r-analysis/shiny/`
- [ ] Use `shinydashboard` layout with these tabs:
  - [ ] **Overview** — total students, total lectures, avg engagement score (KPI cards)
  - [ ] **Emotion Distribution** — bar chart (plot from 01)
  - [ ] **Per-Lecture Analysis** — dropdown to pick lecture, shows emotion breakdown
  - [ ] **Engagement Trends** — line chart over time
  - [ ] **Lecturer Clustering** — cluster plot (from 05)
  - [ ] **Student-Subject Clustering** — cluster plot (from 06)
  - [ ] **Raw Data** — filterable `DT::datatable`
- [ ] Add a **refresh button** that re-fetches data from the Plumber backend (or re-reads the CSV if running standalone)
- [ ] Add `reactiveTimer(5000)` on the Overview tab for real-time updates (optional)
- [ ] **Test checkpoint:** Run `shiny::runApp()` and confirm all 7 tabs load and show data

---

## ⚛️ Phase 6 — React Web Frontend

**Status: ⏳ not started.**

### 6.1 Setup
- [ ] `cd web-react`
- [ ] `npm create vite@latest . -- --template react` (use Vite, not Create React App)
- [ ] Install deps:
  ```bash
  npm install firebase axios react-router-dom recharts tailwindcss 
  npm install -D @types/react
  ```
- [ ] Set up Tailwind: follow https://tailwindcss.com/docs/guides/vite
- [ ] Create `src/firebase.js` with your Firebase config (from Phase 1) **and emulator connectors gated by `import.meta.env.DEV`**:
  ```js
  import { initializeApp } from "firebase/app";
  import { getAuth, connectAuthEmulator } from "firebase/auth";
  import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
  import { getStorage, connectStorageEmulator } from "firebase/storage";

  const app = initializeApp({ /* firebaseConfig from Phase 1 */ });
  export const auth = getAuth(app);
  export const db = getFirestore(app);
  export const storage = getStorage(app);

  if (import.meta.env.DEV) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
  }
  ```
- [ ] In `.env.development` set `VITE_API_URL=http://localhost:8000` (R Plumber); in `.env.production` point it at the deployed backend.

### 6.2 Folder structure inside `src/`
- [ ] `components/` — reusable UI (Navbar, Sidebar, EmotionCard, StatCard, RoleGuard, CrudTable)
- [ ] `pages/`
  - [ ] `common/` — Login, NotFound, Profile
  - [ ] `student/` — StudentDashboard, StudentLectures, StudentLiveLecture, StudentHistory (read-only only)
  - [ ] `doctor/` — DoctorDashboard, DoctorLectures (CRUD of own), DoctorAnalytics, LiveClassroom, DoctorMessages
  - [ ] `admin/` — AdminDashboard, AdminDoctors (CRUD), AdminStudents (CRUD + face upload), AdminLectures (all), AdminAnalytics, AdminSettings
- [ ] `services/` — `api.js` (axios wrapper — automatically attaches Firebase ID token) and `firebase.js` (auth helpers)
- [ ] `hooks/` — `useAuth`, `useRole`, `useEmotions`, `useLectures`
- [ ] `context/` — `AuthContext.jsx` (holds `{user, role, linkedProfile}`)
- [ ] `routes/` — `AppRoutes.jsx` that reads `role` from context and mounts the correct route tree per role. Use a `<RoleGuard allow={["admin"]}>` wrapper around admin-only routes.

### 6.3 Build these pages

**Login (shared)** — two modes, toggleable on one page
- [ ] **Email + password** (all roles) + **Google sign-in** (optional)
- [ ] **Face sign-in** (student + doctor only; hide for admin login)
  - [ ] Role picker: "I'm a student / I'm a doctor" before the capture (needed so the backend scopes the match)
  - [ ] Webcam preview via `navigator.mediaDevices.getUserMedia`, a "Capture" button, then a canvas snapshot
  - [ ] POST the snapshot + role to `/api/auth/face-login`
  - [ ] On success, call `signInWithCustomToken(auth, custom_token)` from Firebase JS SDK → redirect to role home
  - [ ] On failure, show "We couldn't recognize you — try again or use email/password"
  - [ ] Subtle text under the capture button: "Make sure you're in good light and facing the camera"
- [ ] After sign-in (either mode), fetch `GET /api/me`, store the role, redirect to the correct role home

**Student pages** (read-only — students never capture video from the browser)
- [ ] **StudentDashboard** — list of enrolled lectures + personal avg engagement snapshot, plus a **"You vs. class average"** comparison card fed by `/api/analytics/student/<self>/comparison`. Shows *only* the student's own number and the anonymized class mean — never individual peers. Show a badge "🔴 Live now" on lectures whose `status == "recording"`.
- [ ] **StudentLectures** — read-only list of enrolled lectures + schedule; each row links to the lecture's report PDF (`/api/lectures/<id>/report`) and transcript, if available. For a lecture that's currently recording, the row links to **StudentLiveLecture** instead.
- [ ] **StudentLiveLecture** — opens while a lecture is `status == "recording"`. Subscribes to the `transcripts/{id}/segments` subcollection via Firebase JS SDK `onSnapshot` (ordered by `chunk_index`) and renders a rolling caption panel that auto-scrolls to the newest line. RTL-aware for Arabic. Auto-closes when the transcript doc's `completed` flips to `true`; replaces itself with a "View full transcript + download PDF" summary that points at the finished artifacts. **This is the live-captions experience for students sitting in class (or watching remotely).**
- [ ] **StudentHistory** — own engagement history chart (Recharts) across all attended lectures, with a dashed overlay line showing the anonymized class average per lecture

**Doctor pages** (CRUD for own lectures + analytics + messaging — **no live-detection screen**; the Python classroom app handles capture)
- [ ] **DoctorDashboard** — KPI cards: today's lectures, avg engagement across own lectures, which lectures are currently `recording`, live count of raised hands / pending toilet requests in any active lecture
- [ ] **DoctorLectures** — CRUD form/table for **own** lectures (create, edit, delete, enroll students from a dropdown, view `status`)
- [ ] **DoctorAnalytics** — per-lecture engagement analytics (own lectures only); embed/link to Shiny dashboard filtered to the doctor. Charts:
  - [ ] Engagement over time (line chart)
  - [ ] Sleep rate — % of frames where any student was `sleeping`, broken down by `sleep_reason` (stacked bar)
  - [ ] Gesture timeline — markers for `hand_raised`, `toilet_request`, etc., over the lecture duration
  - [ ] **Engagement heatmap** — calendar grid of all own lectures colored by mean engagement (greener = more engaged). Use `@nivo/calendar` or a plain CSS grid fed by `/api/analytics/heatmap`.
  - [ ] **Export** button group: CSV / Excel download of the currently-filtered observations + aggregated engagement (hits `/api/exports/*`). Also a **"Download lecture report (PDF)"** button per lecture row that pulls from `/api/lectures/<id>/report`.
  - [ ] **Transcript panel** — expandable below the engagement chart; shows the Whisper transcript segments with timestamps. Clicking a segment scrolls the engagement chart to that timestamp so the doctor can see what was being said when attention dropped.
- [ ] **LiveClassroom** — read-only real-time panel for a currently-recording lecture: which students are awake/sleeping right now, whose hand is currently up, any active toilet_request. Polls `/api/emotions?lecture_id=X` every few seconds. **Also includes the live transcript panel** (same `onSnapshot` subscription the students use) so the doctor can verify what's being captioned as they speak. This is a **view**, not a capture screen — the camera is still on the classroom PC.
- [ ] **DoctorMessages** — compose + send emails to students in the doctor's own lectures.
  - [ ] Pick a lecture → recipients default to all enrolled students; allow narrowing to a subset via checkboxes
  - [ ] Subject + body text fields
  - [ ] Send → POSTs to `/api/notifications` → shows success/failure toast
  - [ ] "Sent history" tab below the compose form — lists prior notifications from `GET /api/notifications`, with subject, recipient count, timestamp, and status

**Admin pages**
- [ ] **AdminDashboard** — system-wide KPI cards from `GET /api/admin/stats` (add system-wide sleep rate and top gestures observed)
- [ ] **AdminDoctors** — **full CRUD on doctors**. Table with search, create modal, edit modal, delete confirm. Each row shows name, email, department, # of lectures, active/inactive. **Plus a face-photo upload field** on create/edit that POSTs to `/api/doctors/<id>/face`. Without an enrollment photo, the doctor cannot use face sign-in.
- [ ] **AdminStudents** — **full CRUD on students**. Same table pattern, **plus a face-photo upload field** on create/edit that POSTs to `/api/students/<id>/face` and shows whether enrollment succeeded (face detected in photo). Without an enrollment photo, the classroom app cannot recognize the student **and** the student cannot use face sign-in.
- [ ] **AdminLectures** — read/edit/delete **any** lecture (not just own); can reassign a lecture from one doctor to another
- [ ] **AdminAnalytics** — system-wide Recharts + link to the full Shiny dashboard (include sleep rate + gesture frequency views). Adds the **engagement heatmap** (all lectures across all doctors) and **Export** buttons mirroring the Doctor page but across the full dataset.
- [ ] **AdminSettings** — global settings (engagement alert threshold, sleep alert threshold, toilet-request push-notification toggle, CSV backup path, etc.) + API URL switch

**Shared**
- [ ] **Profile** — view/edit own profile (name only; email and role are read-only)

### 6.4 Firebase & role enforcement
- [ ] Use Firebase Auth on the client
- [ ] Keep **all** Firestore writes on the backend (R Plumber) — the frontend only READS via the API and never writes to Firestore directly. This keeps role checks server-side.
- [ ] The axios interceptor must attach the current user's Firebase ID token to every request
- [ ] Even though `<RoleGuard>` hides UI, **never rely on the frontend for security** — the backend re-checks role on every request
- [ ] **Test checkpoint:** log in as each role (admin, doctor, student) and confirm each sees only their own pages and only their own data. Log in as admin, create a new doctor, log out, log in as that doctor, confirm the new account works.

---

## 📱 Phase 7 — React Native Mobile App

**Status: ⏳ not started.**

### 7.1 Setup
- [ ] `cd mobile-react-native`
- [ ] `npx create-expo-app . --template blank`
- [ ] Install deps:
  ```bash
  npx expo install firebase expo-image-picker expo-camera
  npm install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs axios
  npx expo install react-native-screens react-native-safe-area-context
  ```
  The mobile app does **not** capture video for emotion detection — that's the classroom PC's job. `expo-camera` is used **only on the LoginScreen** for the face sign-in flow (live preview + snapshot). `expo-image-picker` is for admins to upload student/doctor enrollment photos.
- [ ] Create `firebaseConfig.js` with the same config from Phase 1 **plus emulator connectors**. Because a physical phone cannot reach your dev machine via `localhost`, use the machine's **LAN IP** (e.g. `192.168.1.15`) in the connect calls. The Android emulator's special IP for the host is `10.0.2.2`.
  ```js
  import { initializeApp } from "firebase/app";
  import { getAuth, connectAuthEmulator } from "firebase/auth";
  import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
  import { getStorage, connectStorageEmulator } from "firebase/storage";

  const HOST = __DEV__ ? "192.168.1.15" : null; // put your dev machine's LAN IP here
  const app = initializeApp({ /* firebaseConfig */ });
  export const auth = getAuth(app);
  export const db = getFirestore(app);
  export const storage = getStorage(app);

  if (__DEV__) {
    connectAuthEmulator(auth, `http://${HOST}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, HOST, 8080);
    connectStorageEmulator(storage, HOST, 9199);
  }
  ```
- [ ] Also set `API_URL=http://192.168.1.15:8000` (or your LAN IP) in an Expo env / `app.config.js` so the axios client can reach the R Plumber backend from the phone.

**Feature-parity rule:** every page on the React web app must have a matching screen on mobile, and every mobile screen must have a matching page on web. If you add a feature to one platform, add it to the other in the same PR.

### 7.2 Screens (inside `src/screens/`)

**Shared**
- [ ] **LoginScreen** — two modes:
  - [ ] **Email + password** (all roles)
  - [ ] **Face sign-in** (student + doctor only; hide the button when the user picks "I'm an admin"): role picker → `expo-camera` live preview → capture → POST to `/api/auth/face-login` → on match, `signInWithCustomToken(auth, token)` from the Firebase JS SDK
  - [ ] After login (either mode), hits `GET /api/me` and routes to the correct role navigator
- [ ] **ProfileScreen** — view/edit own profile, logout

**Student screens** (parity with `pages/student/` on web — read-only only)
- [ ] **StudentHomeScreen** — enrolled lectures, personal engagement summary, **"you vs class average" comparison card**, "🔴 Live now" badge on any recording lecture
- [ ] **StudentLecturesScreen** — list of enrolled lectures; tapping a recording lecture opens **StudentLiveLectureScreen**; tapping a finished one shows download links for the PDF report + transcript
- [ ] **StudentLiveLectureScreen** — subscribes via Firebase JS SDK `onSnapshot` to the `transcripts/{id}/segments` subcollection, renders an RTL-aware auto-scrolling caption panel, auto-closes when `completed` flips to `true`
- [ ] **StudentHistoryScreen** — personal engagement history chart with anonymized class-average overlay

**Doctor screens** (parity with `pages/doctor/` on web — CRUD + analytics + messaging, no camera)
- [ ] **DoctorHomeScreen** — today's lectures, avg engagement, which of own lectures are currently `recording`, live count of raised hands / pending toilet requests
- [ ] **DoctorLecturesScreen** — CRUD for own lectures
- [ ] **DoctorAnalyticsScreen** — per-lecture analytics including sleep rate + gesture timeline, engagement heatmap, transcript panel, and Export / Download-PDF buttons (use the native share sheet to save or open the PDF on mobile)
- [ ] **LiveClassroomScreen** — real-time per-student status (awake/sleeping, current gesture). Read-only.
- [ ] **DoctorMessagesScreen** — compose + send emails to students in own lectures, with a "Sent history" list from `/api/notifications`

**Admin screens** (parity with `pages/admin/` on web)
- [ ] **AdminHomeScreen** — system-wide KPIs
- [ ] **AdminDoctorsScreen** — **full CRUD on doctors** (list, create, edit, delete, upload face enrollment photo via `expo-image-picker`)
- [ ] **AdminStudentsScreen** — **full CRUD on students** (list, create, edit, delete, upload face enrollment photo via `expo-image-picker`)
- [ ] **AdminLecturesScreen** — manage all lectures
- [ ] **AdminAnalyticsScreen** — system-wide analytics including the engagement heatmap across all doctors, plus Export buttons
- [ ] **AdminSettingsScreen** — global settings

### 7.3 Navigation
- [ ] Build a **role-based root navigator** that swaps the entire tab bar based on the logged-in role:
  - [ ] **Student tabs:** Home · Lectures · Live · History · Profile — "Live" opens whichever of their enrolled lectures is currently `recording`, or an empty state if none is live
  - [ ] **Doctor tabs:** Home · Lectures · Live · Analytics · Messages · Profile
  - [ ] **Admin tabs:** Home · Doctors · Students · Lectures · Profile
- [ ] Stack navigator inside each tab for detail/edit screens (e.g., AdminDoctors → EditDoctor)

### 7.4 Doctor → student email notifications (via Brevo)
No push notifications. No FCM. Doctors initiate messages from the web or mobile app; the R Plumber backend sends them via Brevo; students receive them as ordinary email in their inbox.
- [ ] Build `DoctorMessagesScreen` (see 7.2) — a plain form: pick lecture, pick recipients (default = all enrolled), subject, body, Send.
- [ ] Send → axios POST to `/api/notifications` (the backend handles Brevo).
- [ ] Show a success toast with the Brevo `messageId`, or an error toast with the returned error text.
- [ ] Include a "Sent history" list on the same screen (paginated `GET /api/notifications`).
- [ ] **Test checkpoint:** Run the app, log in as doctor, compose an email to yourself (add your own email to an enrolled student), Send, check your inbox. The message should arrive within a few seconds. Also confirm a new doc appears in Firestore `notifications`.

---

## 🔌 Phase 8 — Full Integration (Connect Everything)

**Status: ⏳ not started.** Depends on Phases 3, 6, 7.

Data flow confirmation — make sure this whole chain works end-to-end:

- [ ] **Admin (web or mobile)** → uploads student face photo → **R Plumber `POST /api/students/<id>/face`** → computes encoding → saves to Firestore `students.face_encoding`. Same flow for doctor enrollment via `POST /api/doctors/<id>/face`.
- [ ] **Student or Doctor** → opens LoginScreen, picks "Sign in with face" → captures photo → **R Plumber `POST /api/auth/face-login`** → matches via `match_face.py` → mints Firebase custom token → frontend calls `signInWithCustomToken` → normal authenticated session
- [ ] **Doctor (web or mobile)** → creates lecture, enrolls students → **R Plumber `POST /api/lectures`** → Firestore
- [ ] **Python classroom app** (run on classroom PC) → picks the lecture → loads enrolled encodings from Firestore → opens webcam **and starts audio recording + streaming transcription** → for each processed frame: detects faces → identifies students → classifies emotions → writes `emotions` rows **directly** to Firestore + CSV (via `firebase-admin`) → **every few seconds** writes a new segment doc to `transcripts/{lecture_id}/segments` as the doctor speaks
- [ ] **Students (web or mobile)** during the lecture → subscribe to `transcripts/{lecture_id}/segments` via Firebase JS SDK `onSnapshot` → see live captions with ~1–3 s latency from the doctor's speech
- [ ] **Python classroom app** (on quit) → marks the transcript `completed: true` → uploads `audio.wav` to Storage → POSTs `/api/lectures/<id>/finalize` to R Plumber
- [ ] **R Plumber `/finalize`** → sets `status=finished` → schedules `render_lecture_report(id)` via `future` → renders the `.Rmd` → uploads `reports/lectures/<id>.pdf` to Storage → writes `report_pdf_url` on the lecture doc
- [ ] **R Shiny** → pulls `emotions` via Firestore helpers or the CSV → renders dashboards
- [ ] **React web / React Native dashboard (Doctor & Admin)** → polls **R Plumber `/api/analytics/engagement`** for aggregated views
- [ ] **Student web / mobile** → polls **R Plumber `/api/emotions?student_id=self`** for personal history
- [ ] **Doctor (web or mobile)** → composes a message on DoctorMessages → **R Plumber `POST /api/notifications`** → Brevo `POST /v3/smtp/email` → **student's inbox**; the send is recorded in the `notifications` Firestore collection for audit

Do one full dry-run of this flow with a dummy 5-minute "lecture" and a real face in front of the webcam.

**Role-parity dry-run (required):** exercise all three roles on **both** web and mobile, plus the Python classroom app.
- [ ] Admin (web + mobile): create a doctor **with a face photo**, create 2 students **including a clean face photo for each**, edit one, soft-delete the other
- [ ] **Face sign-in (web + mobile):** log out, pick "Sign in with face" as `Doctor`, face the camera → should auto-log in as that doctor. Repeat as one of the students.
- [ ] **Face sign-in rejection:** try face sign-in as `Admin` — the button should not be offered (or the backend should 403).
- [ ] Doctor (web + mobile): log in as the doctor the admin just created, create a lecture, enroll the 2 students
- [ ] Python classroom app: launch it, pick that lecture, confirm both students are recognized by name on the live feed
- [ ] **Sleep + gesture dry-run** (this round specifically — sit in front of the camera as one of the enrolled students):
  - [ ] Close your eyes for ~3 seconds — label should flip to `[sleeping: eyes_closed]` and engagement in the next row should be `0`
  - [ ] Look down at your desk for ~3 seconds — label should flip to `[sleeping: head_down]`
  - [ ] Raise a hand above your head — label should show `✋ hand_raised` and engagement score should be boosted
  - [ ] Make the ASL T-handshape — label should show `🚽 toilet_request` and (if notifications are wired up) the doctor's phone should ping
  - [ ] Give a thumbs-up / thumbs-down — verify those gestures get logged
- [ ] Let it record for ~1 minute, quit with `q`
- [ ] Student (web + mobile): log in as one of the students, open History, confirm the engagement rows from the recording appear with correct `state` / `gesture` values
- [ ] Doctor (web + mobile): open Analytics for that lecture, confirm engagement chart + sleep rate chart + gesture timeline all render
- [ ] Doctor (web + mobile): open Messages, compose an email to the enrolled students, Send. Confirm the email arrives in the student inbox(es) within seconds **and** a new doc appears in the Firestore `notifications` collection. Try the same on a student login — the Messages screen should not be reachable. Try on an admin login — sending should also be blocked (admins audit, they don't send).
- [ ] **Live transcript (while the lecture is running):** open StudentLiveLecture (or StudentLiveLectureScreen on mobile) as an enrolled student **while the Python app is still recording**. Speak in Arabic at the classroom mic; captions should appear on the student's screen within ~1–3 seconds per segment. Confirm new segments keep appearing in the `transcripts/{id}/segments` subcollection (watchable in the Emulator UI).
- [ ] Finalize chain: after the Python classroom app quits, wait ~1–2 min and confirm:
  - [ ] Lecture status is `finished` and `audio_url` is populated
  - [ ] The `transcripts/{id}` doc has `completed: true` and segment count matches what appeared live
  - [ ] `report_pdf_url` is populated and opening it shows a PDF with the attendance table, engagement chart, and transcript excerpt
- [ ] Doctor (web + mobile): open Analytics for that lecture. Verify the engagement heatmap cell for this lecture is colored, the transcript panel shows the segments, and clicking Export CSV / Export Excel downloads a file that opens correctly.
- [ ] Student (web + mobile): open StudentDashboard. Verify the "You vs class average" card renders, and that StudentLectures lists the finished lecture with working links to the report PDF + transcript.
- [ ] Confirm every page on web has a matching screen on mobile and vice versa — if anything is missing on one platform, add it before moving on

---

## 🧪 Phase 9 — Testing

**Status: ⏳ not started.** Only inline smoke tests so far (engagement, sleep_detector, gesture_detector). Proper `pytest` suite pending.

- [ ] **Python classroom app:** write `pytest` tests for `face_id.py` (feed in two test images, assert the right student_id is returned), `emotion.py`, and `engagement.py`. The OpenCV loop itself is hard to unit-test — smoke-test it manually.
- [ ] **R Plumber backend:** use `testthat` + `plumber::pr_run` in a background process (or the `httptest2` package) to hit every endpoint. Test each role guard explicitly (admin can, doctor cannot, student cannot — and vice versa). Include tests for:
  - [ ] `POST /api/students/<id>/face` and `POST /api/doctors/<id>/face` — submit a fixture image, confirm a `face_encoding` array is saved
  - [ ] `POST /api/auth/face-login` with a matching photo — confirm a non-empty `custom_token` comes back
  - [ ] `POST /api/auth/face-login` with a photo of someone NOT enrolled — confirm 401 with `no_match`
  - [ ] `POST /api/auth/face-login` with `role: "admin"` — confirm 403
  - [ ] `POST /api/notifications` as doctor with a lecture they own — confirm 200 and an email lands (use a Brevo sandbox address for the test)
  - [ ] `POST /api/notifications` as a student — confirm 403
  - [ ] `POST /api/notifications` as admin — confirm 403 (only doctors send)
  - [ ] `POST /api/notifications` as doctor for a lecture owned by a **different** doctor — confirm 403
  - [ ] `POST /api/lectures/<id>/finalize` **with** the correct `X-Finalize-Secret` — confirm 200 and status flips to `finished`
  - [ ] `POST /api/lectures/<id>/finalize` **without** the secret — confirm 401
  - [ ] `GET /api/lectures/<id>/report` for an owner doctor — confirm the returned URL is reachable and returns a PDF
  - [ ] `GET /api/lectures/<id>/report` for an unenrolled student — confirm 403
  - [ ] `GET /api/analytics/student/<id>/comparison` **as that student** — confirm the response contains self_mean + class_mean and does NOT contain any individual peer ids or scores
  - [ ] `GET /api/exports/emotions.xlsx` — confirm the response has `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and opens in Excel
- [ ] **R analysis:** use `testthat` for analysis/engagement-scoring functions
- [ ] **React:** use Vitest + React Testing Library for components
- [ ] **React Native:** use Jest (ships with Expo) for screens
- [ ] Run a **load test:** simulate 30 students × 10 lectures of data → confirm dashboard still loads fast
- [ ] **Privacy/security check:** confirm `serviceAccountKey.json` is in `.gitignore`, confirm Firestore security rules are set (not wide open in prod)

---

## 🚀 Phase 10 — Deployment (flip from Emulator to real Firebase)

**Status: ⏳ not started.**

**The switch from dev to prod is env-vars-only if the clients were built emulator-aware.** No code changes.

- [ ] **Flip off emulator mode:**
  - [ ] In `classroom-app-python/.env` — clear `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_STORAGE_EMULATOR_HOST`, and set `FIREBASE_SERVICE_ACCOUNT_JSON` to the real key path
  - [ ] In `backend-r-plumber/.Renviron` — same three unsets + one set
  - [ ] In `web-react/.env.production` — nothing to unset; the `import.meta.env.DEV` check in `firebase.js` already skips the emulator connectors in a prod build
  - [ ] In `mobile-react-native` — same; `__DEV__` is `false` in EAS production builds
- [ ] **Enable real Firebase services** in the console: Firestore (Production mode), Auth (Email/password + Google), Storage
- [ ] **Deploy Firestore + Storage rules** from `firebase-emulator/` to the real project: `firebase deploy --only firestore:rules,storage`
- [ ] **Generate the production service account key** (Project Settings → Service Accounts → Generate) and place at `firebase/serviceAccountKey.json`. Do NOT commit.
- [ ] **Re-bootstrap the first admin** in the real project (create Auth user, add `admins` doc, add `users` doc) — emulator data does not migrate.
- [ ] **R Plumber backend** → deploy to Railway or Render via a custom Dockerfile (base image `rocker/r-ver:4.3`, install system libs for `openssl`/`curl`, copy sources, `EXPOSE 8000`, run `Rscript run_api.R`). Shared hosting like shinyapps.io does **not** host Plumber — use Docker on any PaaS.
- [ ] **Python classroom app** → **not** a hosted service. Distribute it as a desktop executable: `pyinstaller --onefile capture_app.py`. Hand the resulting `.exe` plus `serviceAccountKey.json` + `.env` to whoever runs it on the classroom PC. For multiple classrooms, each machine gets its own copy.
- [ ] **React web** → deploy to Vercel or Netlify
- [ ] **Shiny dashboard** → deploy to shinyapps.io (free for 5 apps). Point its data loader at the deployed Plumber URL.
- [ ] **React Native app** → build with EAS: `eas build --platform android` for an APK you can install
- [ ] Update all frontend `.env` files with the deployed Plumber backend URL

---

## 📝 Phase 11 — Documentation & Submission

**Status: 🟡 partially done.** `README.md` + Quick Start Runbook (top of this file) + Phase 2 build notes (§2.11) are written. Architecture diagram + screenshots + demo video pending.

- [~] Write the main `README.md` with: overview, architecture diagram, setup instructions, screenshots — README points into this file; expand with screenshots when frontends exist.
- [ ] Create an **architecture diagram** showing the data flow (use draw.io or Excalidraw)
- [ ] Record a **demo video** (5 min) showing: live detection → Firebase writing → R dashboard → mobile app
- [ ] Write the **project report** covering: objectives, methodology, results, statistical findings, conclusion
- [ ] Export all R plots to a `plots/` folder for the report

---

## ⚠️ Key Gotchas to Watch Out For

- **The emulator must be running** before you start the R backend, the Python capture app, or the web/mobile clients. Forgetting this gives cryptic `Connection refused` errors. Start it first; leave it running in a dedicated terminal.
- **Emulator data vanishes on shutdown by default.** Always launch with `--import=./seed --export-on-exit=./seed` to keep your seeded admin + test lectures between runs.
- **Emulator Auth IDs ≠ prod Auth IDs.** When you migrate to prod, you must re-create every user. Don't assume UIDs survive the switch.
- **Mobile + emulator requires a LAN IP, not `localhost`.** Your phone can't reach `localhost` on the dev machine. Use the machine's LAN IP (or `10.0.2.2` for the Android emulator) in the `connect*Emulator` calls.
- **`dlib` / `face_recognition` install on Windows is the #1 setup headache.** Plain `pip install dlib` often fails because it builds from source and needs CMake + Visual C++ Build Tools. Easiest fix: install via `conda install -c conda-forge dlib` first, then `pip install face_recognition`. Budget a full evening for this on a fresh machine.
- **FER / TensorFlow also downloads model weights on first run.** First call will be slow — don't assume the capture loop is broken.
- **MediaPipe ships its own bundled models** and will extract them on first run. Slower first launch, then fast. If you bundle the capture app with PyInstaller, pass `--collect-all=mediapipe` or the exe will crash looking for model files.
- **Sleep-detection flicker:** without temporal smoothing, every blink registers as "sleeping" and every glance at notes registers as "looking down". Always require ≥ `EAR_CLOSED_FRAMES` / `HEAD_DOWN_FRAMES` consecutive frames before flipping state. If you tune the thresholds in class, log the raw EAR + pitch to the console so you can see real numbers.
- **Gesture false positives:** hands move through transient poses all the time. Always require ≥ `GESTURE_HOLD_FRAMES` consecutive detections before reporting a gesture. `toilet_request` especially needs tight thresholds because the ASL T-handshape is close to a clenched fist.
- **Hand-to-student attribution:** MediaPipe Hands doesn't know which face a hand belongs to — your code has to pair them by spatial proximity. In a crowded classroom with students sitting close together, this can swap. Tune `max_num_hands` conservatively.
- **Sleep + gesture + emotion are independent dimensions.** A sleeping student can still have a neutral facial expression. Don't try to combine them into one label — keep `emotion`, `state`, and `gesture` as separate fields on the row.
- **Face sign-in is weaker than a password.** Without a liveness check, someone with a printed photo or a phone screen of the target can log in. For a college project this is acceptable (document it in the report), but **never offer face sign-in to admins** — the admin role has too much power to compromise via photo spoofing.
- **Ambiguous face matches.** In classes with identical twins or siblings, the match distance between two candidates can be very close. Log the top-2 distances on every login attempt; if they're within ~0.05 of each other, reject the login (`{"error": "ambiguous"}`) and fall back to password.
- **Face sign-in needs decent lighting.** The login photo must be taken in lighting similar to the enrollment photo. A student enrolled in bright daylight who tries to log in under dim evening light will often fail. Tell users this explicitly in the UI.
- **`encode_face.py` / `match_face.py` depend on `face_recognition`.** The R backend and the classroom PC share one Python install so the `dlib` headache only happens once per machine. If you host R Plumber on a PaaS without Python available, you'll need a separate container for the Python helpers and R will call them over HTTP instead of `system2()`.
- **Brevo API key handling.** Put the key in `.Renviron`, never in code, never in git. In Brevo's dashboard, create a **named API key** for this project so you can revoke it independently of other apps. Test with the free tier (300 emails/day) — more than enough for a college demo.
- **Brevo email deliverability.** Emails from an unverified sender domain often land in spam. For a demo, verify the sender email in Brevo (they'll send a verification link). For a real deployment, set up SPF + DKIM records — document this but don't block the demo on it.
- **Don't wire automated notifications.** There is intentionally no "auto-email the doctor when a student sleeps / asks for bathroom" path anymore. All sends are doctor-initiated from the Messages UI. If a stakeholder asks for auto-sends later, build a separate endpoint + approval flow — do not quietly start emailing students on every gesture.
- **Whisper models are large.** `base` ~145 MB, **`small` ~480 MB (the project default)**, `medium` ~1.5 GB, `large-v3` ~3 GB. First transcription downloads the model — budget time + disk. `small` is the chosen balance of speed (needed for live captions on CPU) and accuracy (good enough for lecture use with the Arabic-tuned config in 2.7b). If accuracy is the bottleneck in your setting, upgrade via the `WHISPER_MODEL_SIZE` env var — no code changes required.
- **Streaming transcription writes a Firestore doc per segment** — for a 1-hour lecture, expect a few hundred writes. In the emulator this is free; in prod this uses your Firestore write quota. If cost becomes an issue, batch every 3–5 segments into one doc with an inner array — but latency-per-caption goes up accordingly. For a college demo, per-segment writes are the right default.
- **Arabic text is RTL.** The live-caption UI must use `dir="rtl"` (or `I18nManager.forceRTL(true)` on React Native) when `language == "ar"`. Otherwise punctuation + mixed-LTR tokens (numbers, variable names) render in the wrong order.
- **Aggressive audio denoising hurts Arabic.** Spectral gates, RNNoise, and similar "clean up the mic" steps eat the voiceless consonants (ح، ص، ه) that Whisper leans on. Only apply a gentle high-pass + peak normalize.
- **Silero-VAD has a JIT model (~2 MB)** it downloads on first use. Fine on a classroom PC; just confirm it's accessible.
- **Audio permissions on the classroom PC.** Windows / macOS both require microphone permission for the capture app. If `sounddevice.InputStream` hangs or returns silence, check the OS privacy setting first.
- **tinytex install is ~300 MB** and can fail on restricted networks. If it fails, the `generate-report` endpoint should downgrade to an HTML report (`output_format = "html_document"`) rather than 500 — the doctor still gets something.
- **`future` + plumber — report generation is async for a reason.** Rendering a PDF can take 5–15 seconds. Without `future`, the `/finalize` request holds the Plumber thread for that long; under any load, everything else stalls.
- **The `/finalize` endpoint uses a shared secret, not a user token.** The Python classroom app is a headless service, not a human. Rotate `FINALIZE_SHARED_SECRET` if it leaks — don't point the Python app at it with a human doctor's token, because the token expires every hour and the capture app can run for 90+ minutes.
- **Heatmap data scales linearly with lectures × days.** Fine for a semester; if you ever accumulate years of data, add a `?since=` filter so the endpoint isn't returning everything.
- **Student self-comparison must never leak peer data.** The endpoint returns class-level aggregates only. Add a unit test that asserts the response JSON contains no other `student_id`s.
- Firebase Firestore has a **free tier limit** of 50K reads/day — only matters in prod; emulator is unlimited. Still, batch your R queries so your prod switchover doesn't blow through the quota on day one.
- CORS errors between React and the R Plumber backend are the #1 time-waster — configure it properly from day one.
- **R Plumber is single-threaded by default.** If you ever add heavy endpoints, use `future` + `promises`. CRUD is cheap so you may not need this for a college project.
- **Firebase ID token verification in R** isn't a one-liner — you must fetch Google's rotating public keys, cache them, verify the JWT signature (`jose::jwt_decode_sig`), and check the `iss`/`aud`/`exp` claims yourself. Budget a day for this and write tests.
- The R backend and the R Shiny app both need the Firestore helpers — put them in one place (`backend-r-plumber/R/firestore.R`) and `source()` from Shiny to avoid drift.
- **Python and R both have an engagement-score function** (not just a table — the logic now branches on `state` and `gesture`). Keep them in sync. The automated parity test in Phase 9 is the safety net — run it in CI if you have one.
- **A student with no enrollment photo is invisible to the classroom app.** The admin UI must surface this clearly (a red "not enrolled" badge next to any student without `face_encoding`).
- **Lighting and camera angle matter.** If the enrollment photo was taken in bright light and the classroom is dim, recognition will miss. Document this for whoever is taking the photos.
- Expo Go on iOS has stricter camera permissions than Android — test both if you use `expo-image-picker` for face uploads.
- R's `httr` vs `httr2` — this project uses `httr` (as per project spec), don't mix them.
- Always write to CSV **and** Firebase in parallel (from the Python classroom app) — if Firebase is down, CSV is your backup (and the project requires both).
- **Role checks live on the backend.** The frontend hiding a button is UX, not security. Every admin-only endpoint must re-verify `role == "admin"` server-side before touching Firestore.
- **Don't let admins demote themselves.** Block deleting the last active admin, and block an admin from changing their own role — otherwise you can lock yourself out.
- **Soft-delete, don't hard-delete.** Deleting a doctor or student should flip `active: false`, not wipe the row — their historical `emotions` data must stay intact for analytics.
- **Web/mobile drift is the biggest risk** once you have three roles × two platforms. Keep a single shared API contract (the R Plumber endpoints) and add any new feature to both platforms in the same task, not "later."

---

## 📅 Suggested Timeline (if working alone)

| Week | Phase |
|------|-------|
| 1 | Phase 0, 1, 2 (setup + Python classroom capture app with face recognition) |
| 2 | Phase 3 (R Plumber backend — auth, role guards, CRUD, Firestore client, face-upload endpoint) |
| 3 | Phase 4, 5 (R analysis + Shiny) |
| 4 | Phase 6 (React web) |
| 5 | Phase 7 (React Native) |
| 6 | Phase 8, 9 (integration + testing) |
| 7 | Phase 10, 11 (deploy + docs) |

Good luck! 🚀
