import {
  Cpu, Cloud, Database, Eye, MessageSquare, BarChart3, Layers,
  Smartphone, Globe, Shield, Boxes, Server, Cog, GitBranch, Camera,
} from "lucide-react";

// About page — high-level architecture, model stack, and tooling overview.
// Read-only; pulls nothing from Firestore.

export default function AdminAbout() {
  return (
    <div className="space-y-6">
      <Hero />

      <Section icon={<Layers className="h-5 w-5" />} title="Architecture at a glance">
        <p className="text-slate-600 leading-relaxed">
          A real-time classroom analytics system. A <b>Python desktop app</b> on
          a classroom PC captures video and audio, identifies students by face,
          scores their engagement (emotion, sleep, gestures, phone use) and
          transcribes the lecture live. Every observation is written to
          <b> Firebase Firestore</b> within ~1 second. Four web portals and three
          mobile apps subscribe via <code>onSnapshot</code> so the doctor sees
          per-student emotion and engagement updating live during the lecture.
          An <b>R Shiny analytics dashboard</b> gives admins org-wide reports
          and unsupervised clustering.
        </p>
        <ArchDiagram />
      </Section>

      <Section icon={<Cpu className="h-5 w-5" />} title="Models used">
        <Table
          columns={["Model", "Library", "Used for"]}
          rows={[
            ["dlib HOG + ResNet-34 face encoder (128-D)", "face_recognition (Python)",  "Face detection & student identification"],
            ["Mini-Xception CNN (FER-2013)",              "fer (Python)",                "Emotion classification — 7 classes"],
            ["MediaPipe Face Landmarker (478 landmarks)", "Google MediaPipe",            "Eye Aspect Ratio (sleep), head pitch, Mouth Aspect Ratio (yawn)"],
            ["MediaPipe Hand Landmarker",                 "Google MediaPipe",            "Gesture detection — hand raised, toilet request, thumbs up/down, pointing"],
            ["YOLOv8 nano (yolov8n.pt, COCO)",            "Ultralytics",                 "Phone detection → cheating signal"],
            ["Deepgram nova-2",                           "Deepgram WebSocket API",      "Live Arabic + English speech-to-text"],
            ["k-means (k=3)",                             "stats (R)",                   "Doctor + student clustering by engagement profile"],
          ]}
        />
      </Section>

      <Section icon={<Boxes className="h-5 w-5" />} title="Tech stack">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <StackCard icon={<Globe />} color="indigo" title="Web (4 portals)" items={[
            "Vite + React 18", "TailwindCSS", "Firebase JS SDK 10",
            "react-router-dom", "lucide-react icons", "xlsx + jsPDF (reports)",
          ]} />
          <StackCard icon={<Smartphone />} color="purple" title="Mobile (3 apps)" items={[
            "Expo SDK 50+", "React Native", "expo-router file routing",
            "Firebase JS SDK 10", "Live Classroom screens",
          ]} />
          <StackCard icon={<Camera />} color="rose" title="Python capture" items={[
            "OpenCV 4 / cv2", "MediaPipe Tasks (face + hand)",
            "FER (Mini-Xception)", "face_recognition (dlib ResNet-34)",
            "Ultralytics YOLOv8", "sounddevice → Deepgram WebSocket",
            "Tkinter + customtkinter UI", "firebase-admin + CSV mirror",
          ]} />
          <StackCard icon={<Cloud />} color="amber" title="Firebase" items={[
            "Firestore (real-time DB)", "Auth (email/pwd + custom token)",
            "Storage (face photos, audio, PDFs)",
            "Emulator suite for dev (auth/firestore/storage/UI)",
          ]} />
          <StackCard icon={<BarChart3 />} color="emerald" title="Analytics" items={[
            "R 4.5", "Shiny + shinydashboard",
            "ggplot2 + plotly", "DT (interactive tables)",
            "writexl + gridExtra (exports)", "k-means clustering",
          ]} />
          <StackCard icon={<MessageSquare />} color="cyan" title="Comms" items={[
            "Brevo transactional email API",
            "Audited via notifications collection",
            "300 emails/day on free tier",
          ]} />
        </div>
      </Section>

      <Section icon={<Database className="h-5 w-5" />} title="Data model">
        <p className="text-slate-600 leading-relaxed mb-3">
          Curriculum is hierarchical:
          <span className="mx-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-xs">subjects</span>
          →
          <span className="mx-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-xs">classes</span>
          →
          <span className="mx-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-xs">weeks</span>
          →
          <span className="mx-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-xs">lectures</span>.
          Per-frame data lives in
          <span className="mx-1 px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-mono text-xs">emotions</span>
          and
          <span className="mx-1 px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-mono text-xs">attendance</span>;
          live captions in
          <span className="mx-1 px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-mono text-xs">transcripts/&#123;id&#125;/segments</span>.
          Identity in
          <span className="mx-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono text-xs">users / students / doctors / parents / admins</span>.
        </p>
        <Table
          columns={["Collection", "Owner-writes", "Purpose"]}
          rows={[
            ["users",         "R/Node admin SDK",      "uid → role + linked_id lookup"],
            ["students",      "Admin",                 "Profile + face_encoding + face_photo_url"],
            ["doctors",       "Admin",                 "Profile + department + face_encoding"],
            ["parents",       "Admin",                 "Profile + linked_student_ids"],
            ["subjects",      "Admin",                 "Owned by one doctor"],
            ["classes",       "Admin / doctor",        "Roster + section/term"],
            ["weeks",         "Admin / doctor",        "16-week teaching plan per class"],
            ["lectures",      "Doctor",                "status: scheduled → recording → finished"],
            ["emotions",      "Python only",           "1 row per face per frame batch"],
            ["attendance",    "Python (auto) + manual","Per student per lecture"],
            ["transcripts/*", "Python only",           "Streaming Deepgram segments"],
            ["grades",        "Doctor / admin",        "Per student per subject"],
            ["notifications", "Doctor (via Brevo)",    "Email audit log"],
          ]}
        />
      </Section>

      <Section icon={<Eye className="h-5 w-5" />} title="What the doctor sees during a lecture">
        <ul className="text-slate-600 space-y-1.5 list-disc pl-5">
          <li><b>Per-student grid</b> — latest emotion, state, gesture, color-coded engagement</li>
          <li><b>"Right now" counters</b> — awake / sleeping / hand-raised / toilet-request now</li>
          <li><b>Cumulative totals</b> — total hand raises, sleep events, yawns, cheat alerts during the whole lecture</li>
          <li><b>Live warnings feed</b> — sleep, attention, cheating events as they happen</li>
          <li><b>Streaming transcript</b> — Deepgram captions appear within ~1 s of speech</li>
          <li><b>Real attendance</b> — students seen by the camera in the last 10 min</li>
        </ul>
      </Section>

      <Section icon={<Cog className="h-5 w-5" />} title="Tooling & DevOps">
        <ul className="text-slate-600 space-y-1.5 list-disc pl-5">
          <li><b>Firebase Emulator Suite</b> — local Auth + Firestore + Storage + UI for dev with zero cloud cost</li>
          <li><b>Auto-snapshot on shutdown</b> — Ctrl+C the emulator, all 3 services dump to <code>firebase-emulator/snapshot/</code>; next start auto-restores</li>
          <li><b>16 helper scripts</b> — seed curriculum, seed engagement, upload photos, simulate live stream, lecture toggle, backup/restore</li>
          <li><b>Live stream simulator</b> — <code>simulate-live-stream.mjs</code> demos the full real-time pipeline with no camera needed</li>
          <li><b>Per-portal Vite builds</b> — each web app is independent (own deps, own port, own build)</li>
        </ul>
      </Section>

      <Section icon={<Shield className="h-5 w-5" />} title="Security & privacy">
        <ul className="text-slate-600 space-y-1.5 list-disc pl-5">
          <li><b>Firebase Auth</b> — email/password; designed face-login flow for students + doctors</li>
          <li><b>Role-gated portals</b> — each web app hard-codes its allowed role; mismatch bounces to login</li>
          <li><b>Soft delete</b> — entities marked <code>active: false</code>, never hard-deleted</li>
          <li><b>Firestore security rules</b> — per-collection ownership enforced server-side</li>
          <li><b>Photos in Storage</b> — student face photos at <code>students/&lt;id&gt;/face.jpg</code>; never embedded in Firestore docs</li>
        </ul>
      </Section>

      <Section icon={<GitBranch className="h-5 w-5" />} title="Repository layout">
        <pre className="bg-slate-900 text-slate-100 text-xs rounded-xl p-4 overflow-x-auto">
{`nadaStatatistics/
├── classroom-app-python/       Python capture (cv2 + MediaPipe + FER + YOLO + Deepgram)
├── web-admin/                  Vite + React  (port 5175)
├── web-doctor/                 Vite + React  (port 5174)  ← Live Classroom + Reports
├── web-student/                Vite + React  (port 5173)
├── web-parent/                 Vite + React  (port 5176)
├── mobile-admin/               Expo (React Native)
├── mobile-doctor/              Expo (React Native)        ← mobile Live Classroom
├── mobile-student/             Expo (React Native)
├── r-analysis/shiny/           R Shiny dashboard (10 tabs)
├── backend-brevo/              Node + Express (optional server-side email proxy)
├── firebase-emulator/          firebase.json + snapshot/
├── scripts/                    Seed / backup / simulate / upload helpers
└── طلاب_photos/                119 student face photos`}
        </pre>
      </Section>

      <footer className="text-center text-xs text-slate-400 pt-4 pb-2">
        Classroom Emotion Detection System · v0.1 · {new Date().getFullYear()}
      </footer>
    </div>
  );
}

// ─── pieces ────────────────────────────────────────────────────────────

function Hero() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-8 text-white shadow-lg">
      <div className="relative z-10">
        <h1 className="text-3xl font-bold tracking-tight">About this project</h1>
        <p className="mt-2 text-lg text-indigo-100">
          Real-time classroom emotion + engagement analytics powered by computer
          vision, MediaPipe, YOLOv8 and Firebase.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {["Python", "OpenCV", "MediaPipe", "YOLOv8", "FER", "Firebase",
            "React", "Vite", "Expo", "R Shiny", "Tailwind", "Deepgram", "Brevo"]
            .map(t => (
              <span key={t} className="px-2.5 py-1 rounded-full bg-white/15 backdrop-blur text-xs font-semibold">
                {t}
              </span>
            ))}
        </div>
      </div>
      <div className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-12 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
    </div>
  );
}

function Section({ icon, title, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
        <span className="text-indigo-600">{icon}</span>
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function StackCard({ icon, color, title, items }) {
  const colors = {
    indigo:  "bg-indigo-50 text-indigo-700 border-indigo-100",
    purple:  "bg-purple-50 text-purple-700 border-purple-100",
    rose:    "bg-rose-50 text-rose-700 border-rose-100",
    amber:   "bg-amber-50 text-amber-700 border-amber-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    cyan:    "bg-cyan-50 text-cyan-700 border-cyan-100",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.indigo}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-current">{icon}</span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <ul className="space-y-1 text-sm">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-1.5">
            <span className="text-current mt-1">•</span>
            <span className="text-slate-700">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Table({ columns, rows }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>{columns.map((c) => <th key={c} className="px-3 py-2.5">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100">
              {r.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-slate-700 align-top">
                  {j === 0 ? <span className="font-medium text-slate-900">{cell}</span> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ArchDiagram() {
  const Box = ({ title, sub, color, className = "" }) => {
    const styles = {
      blue:    "bg-blue-50 border-blue-200 text-blue-900",
      indigo:  "bg-indigo-50 border-indigo-200 text-indigo-900",
      amber:   "bg-amber-50 border-amber-200 text-amber-900",
      emerald: "bg-emerald-50 border-emerald-200 text-emerald-900",
      purple:  "bg-purple-50 border-purple-200 text-purple-900",
    };
    return (
      <div className={`rounded-xl border-2 px-4 py-3 ${styles[color] || styles.indigo} ${className}`}>
        <div className="font-semibold text-sm">{title}</div>
        {sub && <div className="text-xs opacity-75 mt-0.5">{sub}</div>}
      </div>
    );
  };
  const Arrow = () => (
    <div className="flex items-center justify-center text-slate-400 text-xl font-bold">→</div>
  );
  return (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-7 gap-3 items-stretch">
      <Box title="Camera + Mic" sub="30 fps" color="amber" className="md:col-span-1" />
      <Arrow />
      <Box title="Python Capture" sub="cv2 · MediaPipe · FER · YOLO · Deepgram" color="indigo" className="md:col-span-2" />
      <Arrow />
      <Box title="Firestore" sub="emotions · attendance · transcripts" color="emerald" className="md:col-span-1" />
      <Arrow />
      <div className="md:col-span-1 space-y-2">
        <Box title="Web doctor" sub="Live Classroom" color="blue" />
        <Box title="R Shiny" sub="Analytics" color="purple" />
      </div>
    </div>
  );
}
