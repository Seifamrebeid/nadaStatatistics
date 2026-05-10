# How to start the whole project

Step-by-step guide for booting every piece of the Classroom Emotion Detection
System. Open a separate **PowerShell terminal for each step** that says "leave
running" — closing the terminal kills the service.

> **TL;DR for the demo (3 terminals):**
> 1. `npm run emu:start`
> 2. `cd web-doctor; npm run dev`
> 3. `node scripts/simulate-live-stream.mjs <lecture_id> 300 10`

---

## 0. One-time prerequisites

Only do these once per machine. Skip if already installed.

| Tool | Version | Check with |
|---|---|---|
| Node.js | ≥ 18 | `node --version` |
| npm | bundled with Node | `npm --version` |
| Firebase CLI | latest | `firebase --version` |
| Java JDK | 17+ (for Firestore emulator) | `java -version` |
| R | 4.5.x | `Rscript --version` |
| Python | 3.10+ | `python --version` |

Install Firebase CLI globally if you don't have it:

```powershell
npm i -g firebase-tools@latest
```

Install project dependencies (only the first time, or after pulling new code):

```powershell
# from the repo root (e:\Projects\nadaStatatistics)
npm install

# install per-portal deps
cd web-admin   ; npm install ; cd ..
cd web-doctor  ; npm install ; cd ..
cd web-student ; npm install ; cd ..
cd web-parent  ; npm install ; cd ..

# Python (only if you'll run the real capture)
cd classroom-app-python
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
deactivate
cd ..
```

---

## 1. Start the Firebase emulator (always first)

**Terminal 1 — leave running.**

```powershell
cd e:\Projects\nadaStatatistics
npm run emu:start
```

Wait for the table that lists Auth / Firestore / Storage / UI ports. When you
see this, the emulator is ready:

```
✔  All emulators ready! It is now safe to connect your app.
i  View Emulator UI at http://127.0.0.1:4000/
```

The emulator auto-restores from `firebase-emulator/snapshot/` (or the JSON
backup if no snapshot yet). Your current data — students, doctors, lectures,
emotions, transcripts, attendance, grades — is loaded automatically.

**Verify it's healthy** (in a throwaway terminal):

```powershell
Invoke-WebRequest "http://127.0.0.1:8080/v1/projects/fridgechef-jt50c/databases/(default)/documents/students" -Headers @{Authorization="Bearer owner"} -UseBasicParsing | Select-Object StatusCode
```
Expect `200`. If you see `404 page not found` (plain text), something else
(usually Docker) is on port 8080 — see Troubleshooting.

---

## 2. Start the web portals

Each portal is a separate Vite app on its own port. Start whichever ones you
need; they don't depend on each other.

| Portal | Terminal | Command | URL |
|---|---|---|---|
| Doctor | 2 | `cd web-doctor ; npm run dev` | http://localhost:5174 |
| Admin | 3 | `cd web-admin ; npm run dev` | http://localhost:5175 |
| Student | 4 | `cd web-student ; npm run dev` | http://localhost:5173 |
| Parent | 5 | `cd web-parent ; npm run dev` | http://localhost:5176 |

Each one prints "Local: http://localhost:..." when ready. **Leave the
terminals running**; closing them kills the dev server.

### Login

Open the URL → you get a Firebase login screen. Use one of the seeded
accounts (the auth-backup.json in the snapshot has them):

| Role | Email | Password |
|---|---|---|
| Admin | the admin email from the seed | the seeded password |
| Doctor | any doctor email from the seed | the seeded password |
| Student | any student email from the seed | the seeded password |
| Parent | any parent email from the seed | the seeded password |

> Don't remember the seeded passwords? Open the **Emulator UI** at
> http://127.0.0.1:4000/auth — every user is listed and you can copy the
> email or reset the password right there.

---

## 3. Start the R Shiny analytics dashboard (optional)

**Terminal 6 — leave running.**

```powershell
$env:PATH = "C:\Program Files\R\R-4.5.3\bin;$env:PATH"
Rscript r-analysis/shiny/run_shiny.R
```

Opens http://127.0.0.1:3838 in your browser. The dashboard reads directly
from the emulator. 10 tabs: Overview, Live Lecture, Students, Doctors,
Parents, Lectures, Subjects & Classes, Trends & Clusters, Transcripts,
Notifications, Data Quality.

Sidebar buttons:
- **Reload data** — clears cache and re-reads Firestore
- **Light / Dark mode** — toggles the theme

---

## 4. Run the real Python classroom capture (optional)

Only do this if you have a webcam connected. Otherwise skip to step 5 (live
stream simulator) which gives the same end-to-end demo without a camera.

**Terminal 7.**

```powershell
cd classroom-app-python
.\venv\Scripts\Activate.ps1
python capture_app_ui.py     # GUI wizard — pick doctor → subject → class → week → lecture
# or
python capture_app.py         # headless mode
```

The GUI walks you through picking a lecture, then opens the live capture
window. Faces are detected, emotions/state/gestures classified, and
observations stream into the `emotions` collection ~once a second.

End the lecture by closing the window — the lecture status is patched to
`finished` automatically.

---

## 5. Demo: the real-time pipeline (no camera needed)

**This is the showpiece for your presentation.** Three terminals + the doctor
portal in your browser.

### Step 5a — Start a lecture from the doctor portal

1. Open http://localhost:5174 (web-doctor).
2. Sign in as a doctor.
3. Go to **Lectures**.
4. Pick any lecture and click ▶ **Start** — its status flips to `recording`.
5. The 🟣 **Live** button appears next to it. Click it.
6. The Live Classroom monitor opens at `/lectures/<id>/live`. You'll see
   "Right now" + "Total during this lecture" cards + an empty per-student
   table waiting for data.

### Step 5b — Stream fake observations into that lecture

Copy the lecture ID from the URL (the last path segment), then in a new
terminal:

```powershell
node scripts/simulate-live-stream.mjs <lecture_id> 300 10
```

That writes one observation per student per second for 5 minutes (300s),
across 10 students. The Live Classroom page updates in real time:

- Per-student photos + names appear
- Engagement scores cycle (color-coded green/amber/red)
- "Total hand raises" / "Total toilet requests" / "Total sleep events"
  accumulate
- Sleep alerts and hand-raise events scroll into the warnings feed
- The transcript panel populates if there's a transcript for that lecture

### Step 5c — Stop the lecture

Back in **Lectures**, click ⏹ **Stop** on the same row. Status flips to
`finished`, the Live button disappears, and `finalized_at` is set in
Firestore. The simulator can be left running or Ctrl+C'd.

---

## 6. Save your work / shutdown

### To save data without stopping

```powershell
npm run emu:save
```

Backs up Firestore + Auth via JSON to `firebase-emulator/backup/`.

### To shutdown for the day

In **Terminal 1** (the emulator), press **Ctrl+C**. The emulator
auto-exports a full snapshot (Firestore + Auth + Storage with all student
photos) to `firebase-emulator/snapshot/`. It also runs the JSON backup as a
secondary archive.

You can then close all the other terminals — the data is safely persisted.
Next time you run `npm run emu:start`, everything is restored automatically.

---

## 7. Resetting / troubleshooting

### "Port 8080 is already in use" / "404 page not found" from Firestore

Docker Desktop or another service is squatting on port 8080.

```powershell
# find the squatter
netstat -ano | findstr ":8080"
# the second column shows the PID. Look it up:
Get-Process -Id <pid>
```

If it's Docker: quit Docker Desktop from the system tray, then restart the
emulator. Or move the Firestore emulator port: edit
`firebase-emulator/firebase.json` → change `firestore.port` from `8080` to
`8085`, then update `r-analysis/shiny/.Renviron` and
`classroom-app-python/.env` to match.

### Empty data in the dashboards

```powershell
# verify counts
Invoke-WebRequest "http://127.0.0.1:8080/v1/projects/fridgechef-jt50c/databases/(default)/documents/students?pageSize=1" -Headers @{Authorization="Bearer owner"} -UseBasicParsing
```

If counts are 0, restore from the JSON backup:

```powershell
npm run emu:restore
```

### Re-upload student photos

If Storage data is missing (e.g., snapshot got wiped):

```powershell
node scripts/upload-student-photos.mjs --from "طلاب_photos" --force
```

99 of 101 students get their real face photo. The remaining 2 fall back to
a generated DiceBear avatar so every row in the UI has a picture.

### Re-seed engagement data

```powershell
$env:STUDENT_LIMIT = "50"
$env:LECTURES_PER_STUDENT = "6"
$env:OBS_PER_LECTURE = "20"
node scripts/seed-fake-engagement.mjs
```

Adds ~5,000 realistic emotion observations for 50 students.

### Clean restart from zero

```powershell
# stop emulator (Ctrl+C in its terminal)
Remove-Item firebase-emulator/snapshot -Recurse -Force
npm run emu:start:fresh
# then re-restore:
npm run emu:restore
node scripts/upload-student-photos.mjs --from "طلاب_photos" --force
```

---

## 8. Cheat sheet — every URL and command

```
EMULATOR ──────────────────────────────────────────────────────
  Hub:        http://127.0.0.1:4400
  Auth:       http://127.0.0.1:9099
  Firestore:  http://127.0.0.1:8080
  Storage:    http://127.0.0.1:9199
  UI:         http://127.0.0.1:4000

PORTALS ───────────────────────────────────────────────────────
  Student:    http://localhost:5173
  Doctor:     http://localhost:5174
  Admin:      http://localhost:5175
  Parent:     http://localhost:5176

DASHBOARDS ────────────────────────────────────────────────────
  Shiny:      http://127.0.0.1:3838

CORE COMMANDS ─────────────────────────────────────────────────
  npm run emu:start          # start emulator + restore data
  npm run emu:start:fresh    # start emulator empty
  npm run emu:save           # save Firestore + Auth without stopping
  npm run emu:restore        # restore from JSON backup
  npm run emu:backup         # write JSON backup

  node scripts/lecture-toggle.mjs list                    # list lectures
  node scripts/lecture-toggle.mjs <lec_id> start          # mark recording
  node scripts/lecture-toggle.mjs <lec_id> stop           # mark finished
  node scripts/simulate-live-stream.mjs <lec_id> 300 10   # stream fake live data
  node scripts/seed-fake-engagement.mjs                   # bulk seed emotions
  node scripts/upload-student-photos.mjs --from "طلاب_photos" --force
```
