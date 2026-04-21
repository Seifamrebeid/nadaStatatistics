# Firebase Data Design

Schema reference for the Classroom Emotion Detection System. Mirrors what is specified in `PROJECT_INSTRUCTIONS.md` — if a field is not here, it is not in the design.

## Dev vs prod

All dev runs on the **Firebase Emulator Suite** (local). The schema, security rules, and field shapes are identical between emulator and prod — the only thing that changes is the hostname and auth flow. Flip env vars to switch.

| Service | Emulator (dev) | Production |
|---|---|---|
| Auth | `http://localhost:9099` | `https://identitytoolkit.googleapis.com` |
| Firestore | `http://localhost:8080` | `https://firestore.googleapis.com` |
| Storage | `http://localhost:9199` | `https://firebasestorage.googleapis.com` |
| Emulator UI | `http://localhost:4000` | n/a (Firebase Console) |

Auth tokens from the emulator are **unsigned** (magic dev tokens). Backend code must accept them in dev but require full JWT verification in prod.

## Services used

| Service | Purpose |
|---|---|
| **Firebase Auth** | Email/password + Google sign-in for students, doctors, admins |
| **Cloud Firestore** | All structured data (users, roles, lectures, emotions, ...) |
| **Firebase Storage** | Student enrollment photos (raw JPEG/PNG) |

---

## Firestore collections

### `users` — role lookup table
One document per Firebase Auth user. The R backend hits this on every request to resolve the caller's role.

| Field | Type | Notes |
|---|---|---|
| `uid` | string | Firebase Auth UID (also used as the document id) |
| `role` | enum | `"student"` \| `"doctor"` \| `"admin"` |
| `linked_id` | string | ID of the matching doc in `students` / `doctors` / `admins` |

Every time a student / doctor / admin is created, a matching `users` doc is created in the same transaction.

---

### `students`
Created by admins only.

| Field | Type | Notes |
|---|---|---|
| `student_id` | string | Doc id |
| `name` | string | |
| `email` | string | Matches the Firebase Auth email |
| `face_photo_url` | string (URL) | Points at `students/{student_id}/face.jpg` in Firebase Storage |
| `face_encoding` | array[128] of float | Computed by `face_recognition` from the enrollment photo. **Required** for the classroom app to identify this student.** |
| `created_by` | string (uid) | Admin who created this record |
| `created_at` | timestamp | |
| `active` | boolean | Soft-delete flag (`false` = deleted) |

Without `face_encoding`, the Python classroom app cannot match this student at capture time. The admin UI must surface "not enrolled" prominently.

---

### `doctors`
Created by admins only.

| Field | Type | Notes |
|---|---|---|
| `doctor_id` | string | Doc id |
| `name` | string | |
| `email` | string | |
| `department` | string | |
| `face_photo_url` | string (URL) | Points at `doctors/{doctor_id}/face.jpg` in Firebase Storage. Used for **face sign-in**. |
| `face_encoding` | array[128] of float | Computed by `face_recognition` from the enrollment photo. Required for face sign-in; optional otherwise (doctor can always use email/password). |
| `created_by` | string (uid) | Admin who created this record |
| `created_at` | timestamp | |
| `active` | boolean | Soft-delete flag |

---

### `admins`
Bootstrapped manually for the first admin; created by other admins thereafter.

| Field | Type | Notes |
|---|---|---|
| `admin_id` | string | Doc id |
| `name` | string | |
| `email` | string | |
| `created_at` | timestamp | |

---

### `lectures`
Created by doctors (for their own) or admins (any).

| Field | Type | Notes |
|---|---|---|
| `lecture_id` | string | Doc id |
| `title` | string | |
| `doctor_id` | string | Owning doctor (FK to `doctors.doctor_id`) |
| `date` | timestamp | Scheduled date |
| `subject` | string | |
| `enrolled_student_ids` | array of string | FKs to `students.student_id`. The classroom app uses this list to know which face encodings to load. |
| `status` | enum | `"scheduled"` \| `"recording"` \| `"finished"` — set by the Python classroom app on start/exit |
| `audio_url` | string (URL, optional) | Set by Python on finalize. Points at `lectures/{id}/audio.wav` in Storage. |
| `transcript_id` | string (FK, optional) | FK to `transcripts` doc; set by Python after Whisper completes. |
| `report_pdf_url` | string (URL, optional) | Set by R after rendering the per-lecture PDF. Points at `reports/lectures/{id}.pdf` in Storage. |
| `finalized_at` | timestamp (optional) | Set by R Plumber when the Python app called `/finalize`. |

---

### `transcripts`
Whisper-generated transcripts of recorded lectures. **One parent doc + a subcollection of live segments per lecture.** Written by the Python classroom app in real time during the lecture — students subscribe via `onSnapshot` to see captions live.

**`transcripts/{transcript_id}` — parent doc (metadata only)**

| Field | Type | Notes |
|---|---|---|
| `transcript_id` | string | Doc id |
| `lecture_id` | string | FK to `lectures.lecture_id` |
| `language` | string | `"ar"` / `"en"` / ... — either `WHISPER_LANGUAGE` or Whisper's detection |
| `started_at` | timestamp | When the streaming transcriber emitted its first segment |
| `last_updated_at` | timestamp | Bumped on every new segment write |
| `segment_count` | integer | Running count; matches number of docs in the subcollection |
| `completed` | boolean | `false` while the lecture is recording; flipped to `true` when the Python app exits |

**`transcripts/{transcript_id}/segments/{auto_id}` — subcollection (one doc per finalized speech segment)**

| Field | Type | Notes |
|---|---|---|
| `chunk_index` | integer | Monotonic, starts at 0; used for client-side ordering |
| `start` | float | Seconds from lecture start |
| `end` | float | Seconds from lecture start |
| `text` | string | Transcribed text for this segment |
| `created_at` | timestamp | Server write time |

Doctors + enrolled students of the parent lecture can read; no one else. The subcollection exists (instead of an inline array) because (a) Firestore real-time listeners work on queries, which an inline array does not support efficiently, and (b) a 60-minute lecture can produce hundreds of segments and exceed the 1 MB doc-size cap.

---

### `notifications`
Audit log of emails sent doctor → students via **Brevo** (transactional email). Only doctors produce these (via the R Plumber backend, which is the only writer); admins read for audit; students never see this collection.

| Field | Type | Notes |
|---|---|---|
| (doc id) | auto | Firestore auto-id — used as `notification_id` |
| `sender_doctor_id` | string | FK to `doctors.doctor_id` |
| `lecture_id` | string (optional) | FK to `lectures.lecture_id`; present when the send is scoped to a specific lecture (the usual case) |
| `recipient_student_ids` | array of string | FKs to `students.student_id` — the intended recipients |
| `recipient_emails` | array of string | Snapshot of the email addresses at send time (students' emails can change later; keep what was actually sent to) |
| `subject` | string | |
| `body` | string | |
| `sent_at` | timestamp | |
| `status` | enum | `"sent"` \| `"failed"` |
| `brevo_message_id` | string | Brevo's response id when status = sent |
| `error` | string (optional) | Brevo error text when status = failed |

---

### `emotions`
**Only the Python classroom app writes this collection** (via the Firebase service account). Every other actor reads only.

The collection name is historical — it records **emotion + sleep state + hand gesture** per observation, since all three are computed from the same frame and tied to the same student/lecture/timestamp.

| Field | Type | Notes |
|---|---|---|
| (doc id) | auto | Firestore auto-id |
| `student_id` | string | FK to `students.student_id`. `"unknown"` when a face wasn't matched. |
| `lecture_id` | string | FK to `lectures.lecture_id` |
| `timestamp` | timestamp | When the frame was captured |
| `emotion` | string | FER label (`happy`, `sad`, `angry`, `fear`, `surprise`, `disgust`, `neutral`) |
| `confidence` | float | `0.0`–`1.0`, FER's confidence on the emotion |
| `state` | enum | `"awake"` \| `"sleeping"` — derived from MediaPipe Face Mesh (eye-closure + head pose) |
| `sleep_reason` | enum / null | `null` when `state == "awake"`; otherwise `"head_down"` \| `"eyes_closed"` \| `"both"` |
| `gesture` | enum | `"none"` \| `"hand_raised"` \| `"toilet_request"` \| `"thumbs_up"` \| `"thumbs_down"` \| `"pointing"` \| (extensible — the Python gesture registry can add more) |
| `engagement_score` | float | Computed by the Python app from `emotion + state + gesture`. If `state == "sleeping"` the score is `0`. `hand_raised` adds `+0.2`. Mirrors the R-side `engagement_score()`. |

`emotion`, `state`, and `gesture` are **independent dimensions** — a sleeping student can still have a facial expression, and a gesture can co-occur with either awake or sleeping. Don't collapse them.

---

## Firebase Storage

```
students/
  └── {student_id}/
      └── face.jpg                # enrollment photo, one per student
doctors/
  └── {doctor_id}/
      └── face.jpg                # enrollment photo, one per doctor
lectures/
  └── {lecture_id}/
      └── audio.wav               # full-lecture audio captured by the Python classroom app
reports/
  └── lectures/
      └── {lecture_id}.pdf        # auto-generated per-lecture PDF report
```

Enrollment photos are uploaded by admins via the web / mobile app; the R backend converts each to a `face_encoding` and saves that on the respective `students` / `doctors` doc. The raw image stays in Storage so admins can audit what photo is on file.

Lecture audio is uploaded by the Python classroom app on finalize; it is the Whisper input and is kept so doctors can relisten. Report PDFs are rendered by R from `rmarkdown` after finalize.

**Login photos are never stored.** When a user signs in via face, the captured photo is held in memory on the backend long enough to run a single match, then discarded.

---

## Firebase Auth

- Email/password + Google sign-in both enabled.
- The **first admin** is bootstrapped manually via the Emulator UI in dev (http://localhost:4000 → Authentication → Add user), or via the Firebase Console in prod. Then add matching docs in `admins` and `users` (with `role: "admin"`).
- All other Auth users are created by admins through the app (the R backend calls the Admin SDK via REST).
- **Emulator UIDs do not survive the switch to prod** — you will re-bootstrap the first admin in the real project at deploy time.

### Face-based sign-in (students + doctors only)

Students and doctors can sign in **either** by email/password **or** by face recognition. Admins are intentionally restricted to email/password — face auth is weaker (photo-spoofable) and admin is the highest-privilege role.

Flow (from the client's perspective):
1. User opens the login screen, picks "Sign in with face", picks role (student / doctor).
2. Client captures one snapshot from the camera.
3. Client POSTs the image + role to R Plumber `POST /api/auth/face-login`.
4. Backend matches against the `face_encoding` of every `active: true` user in the requested role's collection.
5. On match: backend mints a Firebase **custom token** for the matched user's `uid` and returns it.
6. Client calls `signInWithCustomToken(auth, token)` — Firebase Auth then issues a normal ID token.
7. Every subsequent request uses the ID token like any other session — there is no separate "face auth" code path in the backend beyond the one login endpoint.

Custom-token minting differs between emulator and prod:
- **Emulator:** the Auth emulator accepts any custom token signed with the emulator's well-known dummy key. `firebase-admin` for R (or a manual JWT build via `jose`) just works.
- **Prod:** the service account private key signs the JWT; the Firebase Auth service verifies and issues a real ID token.

---

## Relationships

```
users.uid ──1:1── Firebase Auth user
users.linked_id ──► students.student_id | doctors.doctor_id | admins.admin_id

doctors.doctor_id ──1:N──► lectures.doctor_id
lectures.enrolled_student_ids[*] ──N:M──► students.student_id

lectures.lecture_id ──1:N──► emotions.lecture_id
students.student_id ──1:N──► emotions.student_id

doctors.doctor_id ──1:N──► notifications.sender_doctor_id
lectures.lecture_id ──1:N──► notifications.lecture_id (optional)
students.student_id ──N:M──► notifications.recipient_student_ids
```

---

## Write ownership

| Collection / path | Who writes | How |
|---|---|---|
| `users` | R Plumber backend | Admin CRUD flows (auto-created with student/doctor/admin) |
| `students` | R Plumber backend | Admin CRUD |
| `doctors` | R Plumber backend | Admin CRUD |
| `admins` | R Plumber backend (first admin manual) | Admin CRUD |
| `lectures` | R Plumber backend | Doctor CRUD on own; Admin CRUD on any |
| `lectures.status` | **Python classroom app** | Flipped to `recording` on start, `finished` on quit |
| `students.face_encoding`, `face_photo_url` | R Plumber backend | `POST /api/students/<id>/face` — admin upload triggers encoding |
| `doctors.face_encoding`, `face_photo_url` | R Plumber backend | `POST /api/doctors/<id>/face` — admin upload triggers encoding |
| `emotions` | **Python classroom app only** | Written via `firebase-admin` during capture |
| `transcripts` (parent) | **Python classroom app only** | Parent doc: written at stream start, patched on every segment, finalized with `completed: true` on exit |
| `transcripts/{id}/segments` | **Python classroom app only** | One doc per VAD-segmented chunk of speech, written in real time during the lecture |
| `lectures.audio_url` / `transcript_id` | **Python classroom app** | Patched on finalize |
| `lectures.status` / `finalized_at` / `report_pdf_url` | R Plumber backend | On `POST /api/lectures/<id>/finalize` → async render → Storage upload |
| `notifications` | R Plumber backend | On `POST /api/notifications` — **only** after a successful doctor-role check. Writes the audit row AFTER the Brevo call (so the row reflects actual send status). |
| `Storage: students/<id>/face.jpg` | R Plumber backend | On admin photo upload |
| `Storage: doctors/<id>/face.jpg` | R Plumber backend | On admin photo upload |
| `Storage: lectures/<id>/audio.wav` | **Python classroom app** | Uploaded on finalize |
| `Storage: reports/lectures/<id>.pdf` | R Plumber backend | Rendered by `rmarkdown` after finalize |

Everyone else (frontends, Shiny, Python for non-`emotions` collections) is **read-only**.

---

## Security rules — summary

See `PROJECT_INSTRUCTIONS.md` Phase 1 for the full requirements. Key points:

- Only admins write to `students`, `doctors`, `admins`
- Doctors write to `lectures` they own — match via `users.linked_id`, not `request.auth.uid` directly (because `doctors.doctor_id ≠ uid`)
- Students can read only their enrolled `lectures` and their own `emotions` rows
- **Nobody** except the service account writes to `emotions` — that path is the Python classroom app's exclusive territory (covers emotion + sleep state + gesture writes, since they share the row)
- **Nobody** except the service account writes to `notifications`; the R Plumber backend is the only writer and only after verifying the caller is a doctor who owns the target lecture
- Service-account-backed code (R Plumber backend, Python classroom app) bypasses these rules — **re-enforce the role check in application code**
- Storage: `students/{id}/face.jpg` and `doctors/{id}/face.jpg` are writable only by admins; readable by any authenticated user

---

## Example documents

**users/abc123uid**
```json
{
  "uid": "abc123uid",
  "role": "student",
  "linked_id": "stu_042"
}
```

**students/stu_042** (values shown for **emulator** — the Storage URL changes in prod)
```json
{
  "student_id": "stu_042",
  "name": "Nada Hassan",
  "email": "nada@example.edu",
  "face_photo_url": "http://localhost:9199/v0/b/emotion-detection-abc12.appspot.com/o/students%2Fstu_042%2Fface.jpg?alt=media",
  "face_encoding": [-0.112, 0.087, 0.034, ... 128 floats ...],
  "created_by": "admin_uid_001",
  "created_at": "2026-04-20T10:15:00Z",
  "active": true
}
```
In prod, `face_photo_url` uses `https://firebasestorage.googleapis.com/...` instead.

**lectures/lec_991** — scheduled
```json
{
  "lecture_id": "lec_991",
  "title": "Intro to Statistics — Week 3",
  "doctor_id": "doc_007",
  "date": "2026-04-22T09:00:00Z",
  "subject": "Statistics",
  "enrolled_student_ids": ["stu_042", "stu_043", "stu_044"],
  "status": "scheduled"
}
```

**lectures/lec_991** — after the classroom app finishes and R renders the report
```json
{
  "lecture_id": "lec_991",
  "title": "Intro to Statistics — Week 3",
  "doctor_id": "doc_007",
  "date": "2026-04-22T09:00:00Z",
  "subject": "Statistics",
  "enrolled_student_ids": ["stu_042", "stu_043", "stu_044"],
  "status": "finished",
  "audio_url": "http://localhost:9199/v0/b/emotion-detection-abc12.appspot.com/o/lectures%2Flec_991%2Faudio.wav?alt=media",
  "transcript_id": "trn_991",
  "report_pdf_url": "http://localhost:9199/v0/b/emotion-detection-abc12.appspot.com/o/reports%2Flectures%2Flec_991.pdf?alt=media",
  "finalized_at": "2026-04-22T10:03:41Z"
}
```

**transcripts/trn_991** — parent doc (live updating while lecture is recording)
```json
{
  "transcript_id": "trn_991",
  "lecture_id": "lec_991",
  "language": "ar",
  "started_at": "2026-04-22T09:00:18Z",
  "last_updated_at": "2026-04-22T09:04:11Z",
  "segment_count": 47,
  "completed": false
}
```

**transcripts/trn_991/segments/<auto-id>** — one doc per finalized speech segment
```json
{
  "chunk_index": 12,
  "start": 58.4,
  "end": 63.1,
  "text": "نجي بقى على الفرضية الصفرية، دي اللي بنحاول نرفضها.",
  "created_at": "2026-04-22T09:01:17Z"
}
```

**emotions/<auto-id>** — awake, hand raised (asking a question)
```json
{
  "student_id": "stu_042",
  "lecture_id": "lec_991",
  "timestamp": "2026-04-22T09:14:30Z",
  "emotion": "neutral",
  "confidence": 0.82,
  "state": "awake",
  "sleep_reason": null,
  "gesture": "hand_raised",
  "engagement_score": 0.8
}
```

**emotions/<auto-id>** — sleeping (both eyes closed and head down)
```json
{
  "student_id": "stu_043",
  "lecture_id": "lec_991",
  "timestamp": "2026-04-22T09:27:10Z",
  "emotion": "sad",
  "confidence": 0.61,
  "state": "sleeping",
  "sleep_reason": "both",
  "gesture": "none",
  "engagement_score": 0.0
}
```

**emotions/<auto-id>** — toilet request (visible on the doctor's LiveClassroom panel)
```json
{
  "student_id": "stu_044",
  "lecture_id": "lec_991",
  "timestamp": "2026-04-22T09:31:02Z",
  "emotion": "neutral",
  "confidence": 0.76,
  "state": "awake",
  "sleep_reason": null,
  "gesture": "toilet_request",
  "engagement_score": 0.6
}
```

**notifications/<auto-id>** — doctor sent an email to all enrolled students in a lecture
```json
{
  "sender_doctor_id": "doc_007",
  "lecture_id": "lec_991",
  "recipient_student_ids": ["stu_042", "stu_043", "stu_044"],
  "recipient_emails": ["nada@example.edu", "omar@example.edu", "laila@example.edu"],
  "subject": "Reminder: please review chapter 3 before Monday",
  "body": "Hi all, ...",
  "sent_at": "2026-04-22T10:05:11Z",
  "status": "sent",
  "brevo_message_id": "<202604221005.1234567@smtp-relay.mailin.fr>"
}
```
