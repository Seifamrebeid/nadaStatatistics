# Project Highlights

Scannable list of every feature — for the advisor briefing. No deep dives.

## 🌟 Top features

- **Live Classroom Monitor** — real-time per-student dashboard during a recording lecture
- **End-to-end real-time pipeline** — Python capture → Firebase → doctor sees it in ~1s
- **Lecture Start / Stop control from the web** — flips Firestore status; Live button appears automatically
- **Multi-modal engagement detection** — emotion + sleep + gesture + yawn + phone-use, all from one camera frame
- **Live streaming transcription (Arabic + English)** via Deepgram nova-2 WebSocket
- **Cumulative event totals** — Total hand-raises / toilet requests / sleep events / yawns / cheat alerts per lecture
- **K-means clustering** — auto-groups doctors and students by engagement profile

## 🖥️ Unified web app (4 role-aware views)

- **One Vite + React app** at `web/` — single URL, single deployment
- **Role-gated routing** — `/admin/*`, `/doctor/*`, `/student/*`, `/parent/*`
- After login, redirected to the right home based on `users/{uid}.role`
- Admin view — full CRUD on the whole system
- Doctor view — lectures, live monitor, analytics, attendance, grades, notifications
- Student view — personal dashboard, live engagement feedback, grades, transcripts
- Parent view — multi-child comparison view

## 📱 Mobile apps (3)

- **mobile-admin**
- **mobile-doctor** with mobile Live Classroom screen
- **mobile-student** with personal real-time emotion view

## 📊 R Shiny analytics dashboard (10 tabs)

- Overview · Live Lecture · Students · Doctors · Parents · Lectures · Subjects & Classes · Trends & Clusters · Transcripts · Notifications · Data Quality
- **Dark / Light mode toggle**
- **Excel + PDF export** per student
- **Searchable picker** (students / doctors / parents / lectures)
- **Auto-refresh every 5s** in the Live tab

## 🤖 Python classroom app

- 30 fps camera capture
- **Face recognition** for student identification
- **Emotion detection** (7 emotions → 4 classes)
- **Sleep detection** (Eye Aspect Ratio + head pitch)
- **Gesture detection** (hand raised, toilet request, thumbs up/down, pointing)
- **Yawn detection** (Mouth Aspect Ratio + hand-over-mouth)
- **Phone-use / cheating detection** (YOLOv8)
- **Attention scoring** (explainable 0–100 score)
- **Live audio transcription** (Deepgram streaming)
- **Tkinter GUI wizard** (5-step lecture setup) + headless mode
- **Buffered Firebase writer** (flushes every 1s)
- **Dual-write CSV audit trail**

## 🔐 Auth & roles

- Firebase Auth (email/password)
- **Face-based sign-in** for students + doctors (designed)
- Role-based access — each portal hard-codes its allowed role
- 4 roles: admin / doctor / student / parent

## 🗂️ Data model

- Subjects → Classes → Weeks → Lectures
- 16-week teaching plan per class
- Students enrolled per class + per lecture
- Parents linked to multiple children
- Soft-delete via `active: false`

## 📧 Notifications

- Doctor → student email via **Brevo transactional email**
- Full audit log in `notifications` collection

## 🎓 Grades & attendance

- **Auto attendance** (camera-detected) + manual override
- Grades per student per subject, letter-grade mapping
- Class-average comparison for students + parents

## 📸 Storage

- Student face photos (99 real + 2 generated)
- Lecture audio recordings
- PDF reports
- All in Firebase Storage emulator

## 🔧 Developer tooling

- **Firebase Emulator Suite** (Auth + Firestore + Storage + UI)
- **Auto-snapshot on shutdown** — `--export-on-exit` saves all 3 services
- **Auto-restore on start** — every restart picks up the last snapshot
- **16 helper scripts** — seed, backup, restore, simulate, upload-photos
- **`simulate-live-stream.mjs`** — demo the live pipeline without a camera
- **`seed-fake-engagement.mjs`** — realistic synthetic data (4 student personalities)
- **`lecture-toggle.mjs`** — CLI to start/stop a lecture
- **`upload-student-photos.mjs`** — bulk photo upload with avatar fallback

## 🧠 Analytics features (highlights)

- Per-student engagement timeline + comparison vs class average
- Per-doctor teaching profile + student × lecture heatmap
- Top / bottom performers ranking
- Day-of-week + time-of-day patterns
- Emotion / gesture / sleep / yawn distributions
- Transcript word frequency
- Data quality coverage report
- Personalized recommendations (rule-based)

## 🎨 UI / UX

- Modern Tailwind design across all web portals
- **Student photos** in attendance + live classroom tables
- Color-coded engagement scores (green / amber / red)
- Round avatar badges with initials fallback
- Status badges (recording / scheduled / finished) color-coded
- Sidebar nav + responsive layouts

## 📐 Architecture wins

- **Single Firebase project** powers all 4 web + 3 mobile + Shiny + Python apps
- **Same schema** dev (emulator) and prod (cloud) — flip env var to switch
- **No middle-tier backend** — clients use Firestore SDK directly with security rules
- **Real-time everywhere** via `onSnapshot` subscriptions
- **One-command startup** — `npm run emu:start` boots everything with data
