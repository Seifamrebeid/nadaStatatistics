# Classroom Emotion Detection System — Full Documentation

> **Scope.** This is the consolidated reference for the whole project: what it does, how it's wired together, every subsystem, every collection, every API route, the dev workflow, the prod-cutover path, and operational runbooks. For deep, phase-by-phase build history see [`instructions/PROJECT_INSTRUCTIONS.md`](../instructions/PROJECT_INSTRUCTIONS.md). For pure data-shape reference see [`instructions/FIREBASE_SCHEMA.md`](../instructions/FIREBASE_SCHEMA.md).

---

## 1. Purpose

A classroom-side capture system that watches a lecture in real time, identifies each student by face, scores their engagement (emotion + sleep + gesture + phone-use signals), and surfaces the data through role-aware dashboards (web + mobile) for students, doctors (instructors), parents, and admins.

The Python desktop app is the only thing that touches a camera. Everything else is data plumbing and visualisation.

---

## 2. High-level architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        Classroom PC (on-prem)                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  classroom-app-python  (Python 3.11)                               │  │
│  │   • OpenCV camera capture                                          │  │
│  │   • face_recognition  (dlib 128-d embeddings)                      │  │
│  │   • FER  emotion classifier                                        │  │
│  │   • MediaPipe Face Mesh  (head pose, eye closure)                  │  │
│  │   • MediaPipe Hands      (raise-hand, gestures)                    │  │
│  │   • YOLOv8n              (phone detection)                         │  │
│  │   • Whisper              (live transcript)                         │  │
│  │   • firebase-admin       (writes emotions / transcripts / status)  │  │
│  └──────────────┬───────────────────────────────────────────┬─────────┘  │
└─────────────────┼───────────────────────────────────────────┼────────────┘
                  │ direct Firestore / Storage writes         │
                  ▼                                           ▼
        ┌────────────────────────┐                  ┌──────────────────────┐
        │   Firebase Suite       │                  │  CSV backup          │
        │   • Auth               │                  │  data/emotions.csv   │
        │   • Firestore          │                  └──────────────────────┘
        │   • Storage            │
        │   (emulator in dev,    │
        │    real cloud in prod) │
        └──────┬─────────┬───────┘
               │         │
               │         │ R reads / writes via REST + service-account JWT
               │         ▼
               │   ┌────────────────────────────┐
               │   │  backend-r-plumber  (R)    │
               │   │  • /api/me, role gating    │
               │   │  • CRUD: students,         │
               │   │    doctors, admins,        │
               │   │    parents, subjects,      │
               │   │    classes, weeks,         │
               │   │    lectures                │
               │   │  • Analytics endpoints     │
               │   │  • Brevo email             │
               │   │  • Report rendering        │
               │   │    (PDF -> Storage)        │
               │   └──────┬─────────────────────┘
               │          │ HTTPS  (Bearer = Firebase ID token)
   ┌───────────┴──────────┼──────────┬──────────┬──────────┐
   ▼                      ▼          ▼          ▼          ▼
web-admin           web-doctor   web-student web-parent  mobile-* (Expo)
(React)             (React)      (React)     (React)     student/doctor/admin
```

**Two write paths into Firebase**:

| Path                       | Who                               | What                                                                                                          |
| -------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Direct (firebase-admin)    | Python capture app                | `emotions`, `transcripts`, `lecture.status` updates, transcript segments. Fast, no HTTP hop.                  |
| Through R                  | All web/mobile clients            | Everything else (CRUD, analytics, reports). R re-enforces role permissions before forwarding to Firestore.    |

**Read paths**: clients can read directly from Firestore via security rules (e.g. live transcript subcollection on `web-student`'s live-lecture page); analytics/aggregate reads always go through R because they need cross-collection joins.

---

## 3. Repository layout

```
nadaStatatistics/
├── classroom-app-python/      # Python desktop capture app  (the only camera-touching code)
├── backend-r-plumber/         # R Plumber REST API (the read/write hub for clients)
├── r-analysis/                # R analysis scripts + Shiny dashboard (offline insight)
├── web-admin/                 # React + Vite — admin portal
├── web-doctor/                # React + Vite — doctor portal
├── web-student/               # React + Vite — student portal
├── web-parent/                # React + Vite — parent portal  (newest)
├── mobile-student/            # Expo React Native — student
├── mobile-doctor/             # Expo React Native — doctor
├── mobile-admin/              # Expo React Native — admin
├── firebase-emulator/         # firebase.json + security rules + seed/  (gitignored data)
├── scripts/                   # node + powershell + bash one-shot ops
├── instructions/              # Original spec (PROJECT_INSTRUCTIONS.md, FIREBASE_SCHEMA.md)
├── docs/                      # this file
├── data/                      # CSV backup (gitignored)
├── reports-out/               # rendered PDFs before Storage upload (gitignored)
├── firebase/                  # prod service-account JSON (gitignored)
└── README.md                  # one-page tl;dr
```

Each frontend is a fully independent project (own `package.json`, own port, own `appRole.js`). The `appRole.js` constant in each app is what makes the AuthContext role-mismatch gate reject users from the wrong portal.

---

## 4. Roles & access model

| Role     | App                            | Can do                                                                                                                                                       |
| -------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Admin    | `web-admin`, `mobile-admin`    | Full CRUD on doctors, students, parents, subjects, classes, weeks, lectures. Upload face encodings. View system-wide analytics. Email/password only.         |
| Doctor   | `web-doctor`, `mobile-doctor`  | Manage own subjects/classes/weeks. View per-week + per-student analytics. Send Brevo emails to students in own classes. Live classroom dashboard.            |
| Student  | `web-student`, `mobile-student`| View own enrolled lectures, own engagement history, own transcripts, own profile. Read-only otherwise. May sign in via face recognition.                     |
| Parent   | `web-parent`                   | Read-only view of linked children's enrolled subjects, weeks, lectures, and engagement history. Account is created by an admin.                              |

**Permission enforcement is layered**:

1. **Client** — each app's AuthContext checks `users.role` against its own `APP_ROLE` and signs out on mismatch (UX guard).
2. **R Plumber** — every route calls `require_auth` / `require_admin` / `require_admin_or_doctor` / `require_parent` and per-resource `.X_visible_to(user)` filters. **This is the real gate.**
3. **Firestore rules** — belt-and-braces deny direct Firestore writes from clients. Service-account writes from R bypass rules; clients only get narrow, row-level read access.

### Visibility rules (R helpers, by collection)

| Collection  | Admin  | Doctor                                  | Student                            | Parent                                                   |
| ----------- | ------ | --------------------------------------- | ---------------------------------- | -------------------------------------------------------- |
| students    | all    | all active                              | self only                          | only `linked_student_ids`                                |
| doctors     | all    | self only                               | doctors of enrolled lectures       | none                                                     |
| subjects    | all    | own (`doctor_id == self`)               | none directly                      | none directly                                            |
| classes     | all    | classes of own subjects                 | own enrolled                       | classes of any linked kid (direct **or** via lecture)    |
| weeks       | all    | weeks of visible classes                | weeks of visible classes           | weeks of visible classes                                 |
| lectures    | all    | own (`doctor_id == self`)               | own enrolled                       | direct enrollment **or** via the lecture's class         |
| emotions    | all    | own lectures                            | self in own lectures               | linked kids in lectures the parent can see               |
| parents     | all    | none                                    | none                               | self only                                                |

Parents see classes/lectures **transitively** (via the kid's lecture-week-class chain), because in this dataset students are most reliably enrolled at the class level — lectures sometimes have empty enrollment arrays.

---

## 5. Data model

The full table-by-table schema is in [`instructions/FIREBASE_SCHEMA.md`](../instructions/FIREBASE_SCHEMA.md). Quick recap of the collections that exist today:

| Collection      | Doc id       | Owner of writes                  | Purpose                                                                                       |
| --------------- | ------------ | -------------------------------- | --------------------------------------------------------------------------------------------- |
| `users`         | Firebase UID | R (admin CRUD)                   | role lookup `{uid, role, linked_id, email}`                                                   |
| `admins`        | `adm_*`      | R (admin)                        | admin profiles                                                                                |
| `doctors`       | `doc_*`      | R (admin)                        | doctor profiles + face encoding                                                               |
| `students`      | `stu_*`      | R (admin)                        | student profiles + face encoding (128-d float array from `face_recognition`)                  |
| `parents`       | `par_*`      | R (admin)                        | parent accounts; `linked_student_ids: array<string>`                                          |
| `subjects`      | `sub_*`      | R (admin)                        | course definitions, assigned to a doctor                                                      |
| `classes`       | `cls_*`      | R (admin/doctor)                 | a section of a subject, has `enrolled_student_ids`                                            |
| `weeks`         | `wk_*`       | R (admin/doctor)                 | one row per week per class (1..16)                                                            |
| `lectures`      | `lec_*`      | R + Python                       | a recorded session for a given week. Status: `scheduled`, `recording`, `finished`             |
| `emotions`      | auto         | **Python only**                  | one row per identified face per `SAVE_INTERVAL_SECONDS`                                       |
| `transcripts`   | auto         | **Python only**                  | parent doc per lecture; live captions stream into `transcripts/{id}/segments` subcollection   |
| `notifications` | auto         | R                                | Brevo email + (future) FCM push log                                                           |

Parent doc shape:

```json
{
  "parent_id": "par_3a4dfbbfcc",
  "name": "Amr",
  "email": "amr.parent@example.com",
  "relationship": "father",
  "linked_student_ids": ["stu_7c24b5de1b"],
  "active": true,
  "created_by": "<admin uid>",
  "created_at": "2026-05-07T..."
}
```

A parent's `users` doc has `role: "parent"`, `linked_id: par_*`.

---

## 6. Subsystem reference

### 6.1 Python capture app (`classroom-app-python/`)

**Entry points**:
- `capture_app_ui.py` — modern customtkinter wizard (Doctor → Subject → Class → Week → Lecture → Confirm → Live screen). The recommended way to record.
- `capture_app.py` — headless `run_capture(lecture_id, lecture_doc, on_frame, on_log, stop_event)` function used by the UI; also exposes a CLI with `cv2.imshow` for legacy debugging.
- `enroll_student.py` / `bulk_enroll.py` — compute and store face encodings.

**Detection pipeline (per processed frame)**:

1. `face_recognition` finds + encodes faces.
2. Match each encoding to enrolled `students.face_encoding` (tolerance 0.6) → student id.
3. `FER` emotion model → label + probabilities.
4. `MediaPipe Face Mesh` → eye-closure (EAR), head pitch.
5. `MediaPipe Hands` → gesture (raise hand, etc.).
6. `YOLOv8n` → bounding boxes filtered to `phone`.
7. `engagement.py` → score per face from the above.
8. Every `SAVE_INTERVAL_SECONDS` (default 3s), all face-tracks flush a row into `emotions/`.
9. `audio_recorder.py` + `stream_transcribe.py` (Whisper) push transcript segments under `transcripts/{lecture}/segments/{ts}` for live captions.

**Important env keys** (see `.env`):
```
FIREBASE_PROJECT_ID
FIRESTORE_EMULATOR_HOST=localhost:8080
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199
CAMERA_INDEX=0
SAVE_INTERVAL_SECONDS=3
FACE_MATCH_TOLERANCE=0.6
PROCESS_EVERY_N_FRAMES=30
```

### 6.2 R Plumber backend (`backend-r-plumber/`)

**Entry**: `Rscript run_api.R` → port 8000.

**Source layout**:

```
plumber.R           # all routes (~1500 lines)
run_api.R           # boots plumber
R/
  config.R          # is_emulator(), env loader
  auth.R            # JWT decode + role guards (require_admin, require_parent, ...)
  cors.R            # filter + allowlisted origins (5173..5176, 19006..19008)
  firestore.R       # httr REST client, fs_get/fs_create_at/fs_update/fs_collection_df
  firebase_auth.R   # create_auth_user, mint_custom_token (emulator alg=none)
  helpers.R         # new_id(), now_iso(), drop_empty(), %||%
  engagement.R      # emotion -> engagement score mapping
  brevo.R           # transactional email
  reports.R         # PDF rendering -> Storage upload
  face_ops.R        # face_recognition shell-out for face-login route
```

**Auth model**:

- Emulator JWTs are unsigned (`alg=none`). `auth.R::decode_emulator_jwt` accepts them.
- Prod JWT verification (`jose::jwt_decode_sig` against Google's rotating public keys) is **stubbed** until cutover.
- Every authenticated request reads `users/<uid>` to populate `req$user = {uid, role, linked_id, email}`.

**Routes (current, by subsystem)**:

| Method+Path                                            | Auth                | Notes                                                       |
| ------------------------------------------------------ | ------------------- | ----------------------------------------------------------- |
| `GET /health`                                          | none                | mode + project                                              |
| `GET /api/me`                                          | auth                | returns role + linked_id                                    |
| `GET/POST /api/admins`                                 | admin               | CRUD                                                        |
| `GET/PUT/DELETE /api/admins/<id>`                      | admin               |                                                             |
| `GET/POST /api/doctors`                                | auth (read narrow)  | doctors only see self; students see lecture instructors     |
| `GET/PUT/DELETE /api/doctors/<id>`                     | admin               |                                                             |
| `POST /api/doctors/<id>/face`                          | admin               | upload enrollment photo, computes encoding                  |
| `GET/POST /api/students`                               | auth                | parent sees only linked kids                                |
| `GET/PUT/DELETE /api/students/<id>`                    | auth, .can_view     | parent allowed if linked                                    |
| `POST /api/students/<id>/face`                         | admin               |                                                             |
| `GET/POST /api/parents`                                | auth                | parent self-only; admin all                                 |
| `GET/PUT/DELETE /api/parents/<id>`                     | admin or self-read  |                                                             |
| `GET/POST /api/subjects`                               | auth                |                                                             |
| `GET/PUT/DELETE /api/subjects/<id>`                    | admin               |                                                             |
| `GET/POST /api/classes`                                | auth                | parent transitive visibility                                |
| `GET/PUT/DELETE /api/classes/<id>`                     | auth, narrowed      |                                                             |
| `GET/POST /api/weeks`                                  | auth                |                                                             |
| `GET/PUT/DELETE /api/weeks/<id>`                       | admin/doctor        |                                                             |
| `GET/POST /api/lectures`                               | auth                | parent transitive visibility                                |
| `GET/PUT/DELETE /api/lectures/<id>`                    | auth                |                                                             |
| `POST /api/lectures/<id>/finalize`                     | service             | requires `X-Finalize-Secret`; flips status, renders report  |
| `GET /api/emotions`                                    | auth                | filtered by role                                            |
| `GET /api/analytics/engagement`                        | auth                | per-lecture mean                                            |
| `GET /api/analytics/sleep`                             | auth                | sleep-rate breakdown                                        |
| `GET /api/analytics/gestures`                          | auth                | gesture counts                                              |
| `GET /api/analytics/heatmap`                           | auth                | engagement+sleep cells (lecture × date)                     |
| `GET /api/analytics/student/<id>/comparison`           | auth, .can_view     | per-lecture self vs class mean. **Used by parent app.**     |
| `GET /api/exports/emotions.csv\|xlsx`                  | auth                | scoped exports                                              |
| `GET /api/exports/engagement.csv\|xlsx`                | auth                |                                                             |
| `GET /api/exports/attendance.csv\|xlsx`                | auth                |                                                             |
| `POST /api/auth/face-login`                            | none                | photo → identify enrolled student/doctor → custom token     |
| `POST /api/notifications/email`                        | doctor/admin        | send Brevo email                                            |

### 6.3 R analysis (`r-analysis/`)

Offline scripts (`01_*.R` … `06_*.R`) for emotion frequency, per-lecture aggregates, engagement scoring, time trends, and clustering. The `shiny/` subdirectory hosts a dashboard for ad-hoc exploration. These run against the same Firestore (emulator or prod) via the same `httr` client.

### 6.4 React web apps

| App           | Port | `appRole.js` | Routes                                                                                         |
| ------------- | ---- | ------------ | ---------------------------------------------------------------------------------------------- |
| `web-student` | 5173 | `student`    | `/`, `/lectures`, `/history`, `/profile`                                                       |
| `web-doctor`  | 5174 | `doctor`     | `/`, `/subjects`, `/classes`, `/weeks`, `/lectures`, `/analytics`, `/notifications`, `/live`   |
| `web-admin`   | 5175 | `admin`      | `/`, `/admins`, `/doctors`, `/students`, `/parents`, `/subjects`, `/classes`, `/weeks`, `/lectures`, `/analytics`, `/settings`, `/profile` |
| `web-parent`  | 5176 | `parent`     | `/`, `/children`, `/subjects`, `/weeks`, `/lectures`, `/history`, `/profile`                   |

Shared React-side conventions:

- `services/api.js` — axios instance that injects the current Firebase ID token.
- `firebase.js` — initialises Firebase, enables emulator endpoints when `import.meta.env.DEV`.
- `context/AuthContext.jsx` — listens to `onAuthStateChanged`, hits `/api/me`, gates by `APP_ROLE`.
- `components/Layout.jsx`, `CrudTable.jsx`, `Modal.jsx`, `StatCard.jsx`, `Spinner.jsx` — copy-pasted across apps; intentionally not a shared package (keeps each app shippable on its own).

**`web-parent` adds**:
- `context/ChildContext.jsx` — loads `/api/students` (only the parent's linked kids), keeps the active child in localStorage, drives a child-picker in the layout header.
- Per-child pages (`ChildSubjects`, `ChildWeeks`, `ChildLectures`, `ChildHistory`) all derive enrollment via the lecture→week→class chain, since lecture-level enrollment is sometimes empty.

### 6.5 Mobile apps

Each Expo project mirrors its web counterpart pair-wise (see "feature-parity rule" in PROJECT_INSTRUCTIONS.md). They use the same `/api/...` endpoints. There is currently **no** `mobile-parent` — parents are web-only.

### 6.6 Firebase emulator (`firebase-emulator/`)

| Service     | Port |
| ----------- | ---- |
| Auth        | 9099 |
| Firestore   | 8080 |
| Storage     | 9199 |
| Emulator UI | 4000 |

`firestore.rules` enforces:

- `users/{uid}` — read self or admin
- `students/{id}` — admin all, student self, doctor read, parent if linked
- `parents/{id}` — admin all, parent self
- `lectures/{id}` — admin, owner doctor, enrolled student, parent of enrolled kid
- `emotions/{id}` — admin, self student, parent of self student, doctor owning the lecture
- `transcripts/{id}` + `segments/{id}` — admin, owner doctor, enrolled student
- everything else default-deny

The Python capture app + R backend bypass rules via service-account credentials; clients are tightly bound by them.

---

## 7. Dev workflow

### 7.1 Prereqs (one-time)

| Tool         | Version              | Why                                |
| ------------ | -------------------- | ---------------------------------- |
| Python       | 3.11 (NOT 3.12+)     | dlib + face_recognition wheels     |
| R            | 4.5.x                | Plumber, Shiny                     |
| Node.js      | 20+                  | web apps, Firebase CLI             |
| Java         | 11+                  | Firestore + Storage emulators      |
| Firebase CLI | latest               | `npm i -g firebase-tools`          |

### 7.2 Five-terminal local stack

| # | What                       | Command                                                                                          |
| - | -------------------------- | ------------------------------------------------------------------------------------------------ |
| 1 | Firebase emulator          | `./scripts/start-emulators.ps1`                                                                  |
| 2 | R Plumber                  | `cd backend-r-plumber; & "C:\Program Files\R\R-4.5.3\bin\Rscript.exe" run_api.R`                 |
| 3 | Web app you're working on  | `cd web-admin; npm run dev` (or `web-doctor`, `web-student`, `web-parent`)                       |
| 4 | Capture app (when needed)  | `cd classroom-app-python; .\venv\Scripts\Activate.ps1; python capture_app_ui.py`                 |
| 5 | Optional: a second web app |                                                                                                  |

### 7.3 First-time data bootstrap

```powershell
# (a) Start emulator (terminal 1)
./scripts/start-emulators.ps1

# (b) Seed curriculum + enroll all students
node scripts/seed-curriculum.mjs

# (c) Bootstrap your admin via the emulator UI (http://localhost:4000)
#     Add an Auth user with email/password, then add a `users/<uid>` doc
#     with role=admin, linked_id=adm_001.  See firebase-emulator/README.md.

# (d) Optional: seed historical emotions / lectures
node scripts/seed-lectures.mjs
node scripts/seed-emotions.mjs
```

`seed-curriculum.mjs` ends by calling `enroll-all-students.mjs` so every class **and every lecture** gets every student in `enrolled_student_ids`. Run `node scripts/enroll-all-students.mjs` on its own anytime that mapping drifts.

### 7.4 Backups & restores

| Script                                | Action                                                          |
| ------------------------------------- | --------------------------------------------------------------- |
| `node scripts/backup-firestore.mjs`   | Dumps every collection (incl. parents) → `firebase-emulator/backup/firestore-backup.json` |
| `node scripts/restore-firestore.mjs`  | Re-creates docs from that JSON (skips ones that already exist) |
| `node scripts/backup-auth.mjs`        | Dumps Auth users                                                |
| `node scripts/restore-auth.mjs`       | Restores Auth users                                             |

Or use the emulator's own `--import` / `--export-on-exit` flags (the `start-emulators.ps1` helper does this automatically against `./seed`).

### 7.5 Common scripts

| Script                                 | Use                                                             |
| -------------------------------------- | --------------------------------------------------------------- |
| `enroll-all-students.mjs`              | Re-enrolls all active students into all classes + lectures      |
| `cleanup-emotion-dev.mjs`              | Wipes `emotions` for a clean re-test                            |
| `dedupe-firestore.mjs`                 | Removes duplicate seed rows                                     |
| `merge-projects.mjs`                   | Migrates docs between two projects                              |
| `setup-data.mjs`                       | One-shot reset: kill, restore from `seed-fresh/`, re-enroll     |

---

## 8. The Parent feature (newest)

A self-contained subsystem added on top of the role/auth model. Quick map:

| Layer       | Files                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Backend     | `backend-r-plumber/plumber.R` (`/api/parents` CRUD, `.parents_visible_to`, `.parent_linked_student_ids`, `.can_view_student`, transitive class/week/lecture visibility for parents) |
| Auth helper | `backend-r-plumber/R/auth.R` (`require_parent`)                                                                                        |
| CORS        | `backend-r-plumber/R/cors.R` (added `localhost:5176`)                                                                                  |
| Rules       | `firebase-emulator/firestore.rules` (`isParent()`, `parentKids()`, parent-of read paths)                                               |
| Admin UI    | `web-admin/src/pages/AdminParents.jsx` + nav entry in `Layout.jsx` + route in `App.jsx`. Plus an "Add parent" quick action per row in `AdminStudents.jsx`. |
| Parent app  | `web-parent/` (full Vite project; routes & pages listed in §6.4)                                                                       |

Workflow:

1. **Admin** opens `web-admin → Parents → + New parent`, enters name + email + (optional) password + relationship, multi-selects the children, submits. Backend creates a Firebase Auth user, a `parents/par_*` doc, and a `users/<uid>` doc with role=`parent`. If no password was supplied, the response includes a `temporary_password` that the admin shares.
2. **Parent** opens `http://localhost:5176`, signs in with that email + password, lands on a dashboard summarising every linked child's engagement vs class mean.
3. **Parent picks a child** in the layout header dropdown → Subjects, Weeks, Lectures, History pages all scope to that kid via the lecture→week→class chain.

---

## 9. Production cutover

The codebase was built emulator-aware from day one; cutover is env-vars-only. Checklist:

1. Create a real Firebase project. Copy the project id everywhere `instructions/FIREBASE_SCHEMA.md` lists.
2. Generate a service-account JSON. Place at `firebase/service-account.json` (gitignored). Set `FIREBASE_SERVICE_ACCOUNT_JSON=...` in:
   - `backend-r-plumber/.Renviron`
   - `classroom-app-python/.env`
3. **Unset** the four emulator host env vars in those same files (`FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_STORAGE_EMULATOR_HOST`, `FIREBASE_DATABASE_EMULATOR_HOST`).
4. Implement the prod JWT verification stub in `backend-r-plumber/R/auth.R::verify_firebase_token` (Google public-key JWKS + `jose::jwt_decode_sig`).
5. Build each web app with `VITE_FIREBASE_*` keys pointing at the real project. They auto-skip emulator endpoints when `import.meta.env.DEV` is false.
6. Push security rules: `firebase deploy --only firestore:rules,storage`.
7. Add prod URLs to `cors.R::CORS_ALLOWED_ORIGINS`.
8. Re-run `restore-firestore.mjs` against the prod project (point `TARGET` at the new project id) to seed real data.

---

## 10. Operational runbooks

### 10.1 Restart the R backend

```powershell
# kill anything on 8000
$conn = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($conn) { Stop-Process -Id ($conn.OwningProcess | Select -Unique) -Force }
# start fresh
Set-Location e:/Projects/nadaStatatistics/backend-r-plumber
& "C:\Program Files\R\R-4.5.3\bin\Rscript.exe" run_api.R
```

### 10.2 Re-enroll all students after data drift

```powershell
node scripts/enroll-all-students.mjs
```
Idempotent. Sets every `classes.enrolled_student_ids` and `lectures.enrolled_student_ids` to the current full active student roster.

### 10.3 Capture app won't start

| Symptom                                              | Likely cause                                  | Fix                                                                              |
| ---------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------- |
| `ModuleNotFoundError: No module named 'mediapipe'`   | Wrong Python env activated                    | Activate the right venv/conda env, `pip install mediapipe` (needs Py 3.11)       |
| Wizard exits silently after `pkg_resources` warning  | Tk root closed early or app exception swallowed | Run again — `main()` now prints `[ui] ...` checkpoints; paste the last one      |
| `Could not open camera at index 0`                   | Camera busy / wrong index                     | Set `CAMERA_INDEX=1` in `.env`; close OBS / Zoom / etc.                          |
| Confirm screen says `0 enrolled — face recognition will skip everyone` | Lecture has no `enrolled_student_ids`         | Run `enroll-all-students.mjs`                                                    |
| Long freeze on "Starting camera…"                    | First-run model load (~30s)                   | Wait — log line "models loaded; opening camera…" appears when ready              |

### 10.4 Parent flow troubleshooting

| Symptom                                  | Cause                                                                        | Fix                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `EMAIL_EXISTS` on parent create          | Auth user with that email already exists                                     | Use a different email or delete the user from Emulator UI                                            |
| Parent logs in but Subjects empty        | Either kid isn't enrolled in any class **or** R wasn't restarted after edits | `node scripts/enroll-all-students.mjs`; restart R                                                    |
| Parent logs in and gets bounced to login | `users/<uid>` doc is missing or has wrong role                               | Check Emulator UI → Firestore → `users/<that uid>` → must have `role:"parent", linked_id:par_*`      |
| Lectures empty but Classes show          | `lecture.enrolled_student_ids` is empty + transitive path broken             | `enroll-all-students.mjs`; ensure R has the latest `.lectures_visible_to` (transitive class fallback)|

### 10.5 Reseed everything from scratch

```powershell
# stop all the things first
Stop-Process -Name java -Force -ErrorAction SilentlyContinue
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Stop-Process -Name Rscript -Force -ErrorAction SilentlyContinue

# wipe the emulator dataset
Remove-Item firebase-emulator/seed -Recurse -Force -ErrorAction SilentlyContinue

# start emulator from the curated baseline
firebase emulators:start --import=./firebase-emulator/seed-fresh --export-on-exit=./firebase-emulator/seed
# (in another terminal:)
node scripts/seed-curriculum.mjs    # creates doctors/subjects/classes/weeks + enrolls all students
```

---

## 11. Conventions & gotchas

- **Plumber list-columns are double-wrapped.** When `fs_collection_df` returns a list-column (e.g. `enrolled_student_ids`), plumber's JSON serializer emits `[["stu_x"]]` per row. The web-parent / web-admin pages flatten one level via `flatIds()`. New frontend code that reads array fields should follow that pattern.
- **`drop_empty()` keeps empty lists.** `length(list()) == 0`, so it doesn't strip them. That's intentional — Firestore should receive `arrayValue: { values: [] }` for an empty linkage rather than nothing.
- **Auto-generated passwords surface in the response.** When admin creates a user without setting a password, the POST response includes `temporary_password`. The admin UI is the only place that should read it; never log it.
- **Service-account paths bypass rules.** Both R and the Python capture app run as the service account (or as `Bearer owner` against the emulator), so Firestore rules don't apply to them. Don't rely on rules for your write logic; re-check in code.
- **Emulator JWTs are unsigned.** `auth.R::decode_emulator_jwt` happily accepts them. The minute you cut over to prod you must wire `verify_firebase_token` to actually verify; otherwise anyone can forge any role.
- **Each web app is its own Vite project.** Shared layout components are duplicated, not packaged. Be willing to make the same fix four times — or one time inside a shared package if you decide to extract one (current convention: don't).

---

## 12. Glossary

| Term            | Meaning                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| APP_ROLE        | Constant in each web app (`web-*/src/appRole.js`) declaring which role this app is for.                |
| ID token        | Short-lived JWT minted by Firebase Auth, sent as `Authorization: Bearer <token>` on every API request. |
| linked_id       | The role-specific record id (`stu_*` / `doc_*` / `adm_*` / `par_*`) that a `users/{uid}` doc points at.|
| Custom token    | Long-lived token minted by R (after face-login) that the client trades back to Firebase for an ID token. |
| Engagement score| Numeric output of `engagement.R` from emotion + sleep + gesture features. 0..100.                      |
| Face encoding   | 128-dim float vector from `face_recognition` (dlib). Stored on `students` and `doctors`.               |
| Visibility helper | An R function `.X_visible_to(user)` that returns the row-filtered data.frame for the caller's role.  |

---

*Last updated: 2026-05-07. Newest sections: §4 parent role, §6.4 web-parent, §8 parent feature, §10.4 parent troubleshooting.*
