Feature Report — Classroom Emotion Detection System
For your advisor meeting. Ordered top-to-bottom: best → medium. Group your talk around Tier 1 + 2 — those are the differentiators. Tier 3+ proves completeness.

Tier 1 — Showstoppers (lead with these)
1. Real-time Live Classroom Monitor (web-doctor)
Where: LiveClassroom.jsx (route /lectures/:id/live)
The doctor opens any active lecture and sees, updating live via Firestore onSnapshot subscriptions:

Per-student grid: latest emotion, state (awake/sleeping), gesture, engagement score (color-coded green/amber/red)
Aggregate counters: awake / sleeping / hand-raised / toilet-request / attention alerts / cheating alerts / camera-detected attendance (last 10 min)
Live warnings feed (sleep events, hand-raises) as they happen
Streaming transcript segments scrolling in real time
Why it sells: No page refresh, sub-second latency, replaces the manual "scan the room" classroom management. This is the centerpiece — demo it live.

2. End-to-end Real-time Pipeline (Python → Firebase → Doctor screen)
Where: classroom-app-python/ → emotions collection → LiveClassroom.jsx

Camera at 30 fps, processes every 5th frame (~6 detections/sec)
Buffered Firestore writer flushes every 1 second
Doctor sees the change in their browser within ~1 second of the student's expression changing
Verified with scripts/simulate-live-stream.mjs (lets you demo the full pipeline without needing a webcam)
3. Lecture Lifecycle Control from the Web
Where: DoctorLectures.jsx — Start / Stop / Live buttons per row

▶ Start → flips Firestore status: "recording" + started_at: serverTimestamp()
⏹ Stop → flips to "finished" + finalized_at
🟣 Live button appears only when recording → opens the live monitor
All status changes are reactive: Python app, web portals, Shiny dashboard all see the change instantly
4. Multi-Modal Engagement Detection (Python capture pipeline)
Where: capture_app.py and per-detector modules
Single camera frame → 5 parallel signals per student:

Emotion (FER 7-class CNN) — happy/sad/angry/fear/surprise/disgust/neutral
Sleep state (MediaPipe Face Mesh) — Eye Aspect Ratio + head pitch, dual-signal fusion
Gestures (MediaPipe Hands) — extensible registry: hand_raised, thumbs_up, toilet_request, pointing
Yawn detection (Mouth Aspect Ratio + hand-over-mouth overlap)
Phone use (YOLOv8 Nano + face proximity → cheating signal) All five fused into a deterministic 0–1 engagement score (sleeping → 0; hand_raised → +0.2 bonus).
5. Live Streaming Arabic/English Transcription
Where: audio_recorder.py + stream_transcribe.py

Background thread captures 16 kHz mono audio
Pushed to Deepgram nova-2 WebSocket for streaming transcription
Each VAD-segmented chunk written to transcripts/{id}/segments subcollection live
Students + doctors see captions appear during the lecture (web + mobile)
Tier 2 — Strong engineering (your "depth" features)
6. Four-portal Web Architecture with Role-Gated Access
web-admin (port 5175), web-doctor (5174), web-student (5173), web-parent (5176)
Each portal hard-codes its expected role; mismatch → user is bounced
All share Firebase Auth project fridgechef-jt50c; role + linked_id resolved per-session from users/{uid} doc
No middle-tier backend needed — Vite + React + Firestore SDK directly
7. Three-portal Mobile Suite (Expo + React Native)
mobile-admin, mobile-doctor, mobile-student
Mobile-doctor has its own Live Classroom screen — large per-student cards, optimized for in-room handheld monitoring
Mobile-student has the personal real-time feedback view
Feature parity with web for CRUD + analytics
8. R Shiny Unified Analytics Dashboard
Where: r-analysis/shiny/app.R (single app, 10 tabs)

Overview — org-wide KPIs + top performers
Live Lecture — auto-refresh every 5s, mirrors web-doctor monitor
Students / Doctors / Parents / Lectures — searchable per-entity deep dives
Subjects & Classes — curriculum analytics
Trends & Clusters — k-means clustering of doctors and students by engagement profile, time series
Transcripts — word frequency, segments
Notifications — email audit
Data Quality — coverage health checks
Dark/Light mode toggle + Excel + PDF export + searchable picker + in-process caching with manual reload
9. K-means Clustering of Engagement Profiles (Shiny "Trends" tab)
Doctors clustered by (mean_engagement, sleep_rate)
Students clustered by (mean_engagement, hand_raised_rate)
Identifies "engaged stars / average / disengaged / sleepers" patterns automatically — unsupervised, k=3
Visualized as scatter with cluster colors + point labels
10. Per-Lecture Reports with PDF Auto-Generation
After lecture finalize, full PDF report rendered (engagement timeline, per-student emotion mix, sleep events, transcript)
Stored in Firebase Storage at reports/lectures/{id}.pdf
Doctor downloads from the lectures page
11. Excel + PDF Export from Shiny (per student)
Excel multi-sheet: Profile, Per-lecture summary, Raw observations
PDF: paginated tables with indigo headers, generated 100% in-R (no LaTeX/Chrome dep)
Tier 3 — Solid features (system completeness)
12. Doctor → Student Notifications (Brevo email)
Doctor composes message → recipients selected from enrolled list
Emails sent via Brevo transactional email API
Audit row written to notifications collection AFTER send (status = sent/failed)
Doctor + admin can browse the audit log
13. Hierarchical Curriculum (subjects → classes → weeks → lectures)
Admin defines subjects, assigns to a doctor
Each subject contains classes, classes contain a 16-week teaching plan
Each week ties to a live lecture session record
Drives the Shiny "Subjects & Classes" and "Trends" analytics
14. Parent Portal with Multi-Child View (newest portal)
Parent links to multiple children
Side-by-side comparison: engagement, sleep rate, attendance, grades
Notifications received across all linked children
Per-child weekly/lecture drill-downs
15. Attendance Tracking (manual + automatic)
Auto: if a student's face is detected during a lecture, they're marked present (camera-detected)
Manual: admin/doctor can override
Per-student attendance rate trend line
16. Grades Management
Per-student per-subject marks + letter grade
Web-CRUD by admin/doctor; students + parents read-only
CSV export from admin
17. Cheating / Phone-Use Detection
YOLOv8 detects phone in frame
Distance-to-face heuristic flags cheat_warning
Surfaces in LiveClassroom alerts panel + lecture report
18. Attention Score (separate from engagement)
Explainable 0–100 score: sleeping −48, on_phone −28, yawning −10, hand_raised +4, etc.
Triggers attention_warning when < 45
Doctor sees per-student attention trend
19. Recommendations Widget (student page)
Rule-based personalized text: "Improve attendance to protect your grade trend", "Reduce distractions", etc.
Driven by attention + grade + attendance thresholds
20. Firebase Emulator Suite (local dev environment)
Auth + Firestore + Storage all run locally; identical schema/rules to prod
Single env var flip switches the whole stack from emulator to cloud
16 helper scripts (seed, backup, restore, dedupe, simulate)
Tier 4 — Standard CRUD that rounds out the system
21. Admin Portal CRUDs
14 pages: Admins, Doctors, Students, Parents, Subjects, Classes, Weeks, Lectures, Attendance, Grades, Analytics, Student Search, Settings, Dashboard

22. Doctor Portal CRUDs
13 pages: Dashboard, Lectures, Subjects, Classes, Weeks, Hierarchy, Analytics, Attendance, Grades, Messages, Notifications, Student Search, LiveClassroom

23. Student Portal CRUDs
10 pages: Dashboard, Lectures, Engagement, Attendance, Grades, Live Lecture, Transcripts, History, Doctor Search, Hierarchy

24. Soft-delete via active: false
Audit-safe — no data ever truly deleted, queries filter on active == true

25. Dual-write CSV audit trail
Every emotion observation also written to data/emotions.csv for offline analysis & disaster-recovery

26. Backup / Restore Tooling
backup-firestore.mjs + restore-firestore.mjs — full Firestore dump/restore, plus auth backup/restore, plus cloud upload script