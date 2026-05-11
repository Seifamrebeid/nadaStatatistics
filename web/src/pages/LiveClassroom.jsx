import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  where,
  limit,
  getDocs,
} from "firebase/firestore";

// ── helpers ──────────────────────────────────────────────────────────────────

function toMillis(ts) {
  if (!ts) return 0;
  if (ts.toMillis) return ts.toMillis();
  return new Date(ts).getTime();
}

function formatTime(ts) {
  const ms = toMillis(ts);
  if (!ms) return "—";
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function scoreBg(score) {
  const n = Number(score) || 0;
  if (n >= 70) return "text-green-700 bg-green-50";
  if (n >= 45) return "text-amber-700 bg-amber-50";
  return "text-red-700 bg-red-50";
}

// ── component ─────────────────────────────────────────────────────────────────

export default function LiveClassroom() {
  const { lectureId } = useParams();

  // "Right now" stats — derived from latest doc per student
  const [stats, setStats] = useState({
    awakeCount: 0,
    sleepingCount: 0,
    handRaisedCount: 0,
    toiletRequestCount: 0,
    attentionAlertsCount: 0,
    cheatAlertsCount: 0,
    cameraDetected: 0,
  });

  // Cumulative totals across the whole lecture (transition-counted: each
  // distinct event = 1, not every frame).
  const [totals, setTotals] = useState({
    totalObservations: 0,
    uniqueStudents: 0,
    handRaiseEvents: 0,
    toiletRequestEvents: 0,
    sleepEvents: 0,
    yawnEvents: 0,
    attentionWarnings: 0,
    cheatWarnings: 0,
    phoneEvents: 0,
  });

  // latest emotion doc per student
  const [studentRows, setStudentRows] = useState([]);

  // student id -> { name, face_photo_url }
  const [studentsLookup, setStudentsLookup] = useState({});

  // attendance from the attendance collection
  const [confirmedPresent, setConfirmedPresent] = useState(0);

  // warnings feed
  const [warnings, setWarnings] = useState([]);

  // transcript
  const [transcriptSegments, setTranscriptSegments] = useState([]);

  const [err, setErr] = useState(null);

  // ── students lookup (loaded once for name + photo) ───────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "students"));
        if (cancelled) return;
        const map = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          map[d.id] = { name: data.name, face_photo_url: data.face_photo_url };
        });
        setStudentsLookup(map);
      } catch (e) {
        console.error("students lookup:", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── emotions subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!lectureId) return;

    const q = query(
      collection(db, "emotions"),
      where("lecture_id", "==", lectureId),
      orderBy("timestamp", "desc"),
      limit(200),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const emotions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // --- per-student latest doc ---
        const latestByStudent = new Map();
        emotions.forEach((e) => {
          if (!e.student_id) return;
          const existing = latestByStudent.get(e.student_id);
          if (!existing || toMillis(e.timestamp) > toMillis(existing.timestamp)) {
            latestByStudent.set(e.student_id, e);
          }
        });
        setStudentRows([...latestByStudent.values()].sort((a, b) =>
          String(a.student_id).localeCompare(String(b.student_id)),
        ));

        // --- aggregate stats from latest-per-student ---
        let awake = 0, sleeping = 0, handRaised = 0, toiletRequest = 0;
        let attentionAlerts = 0, cheatAlerts = 0;

        latestByStudent.forEach((e) => {
          if (e.state === "sleeping") sleeping++; else awake++;
          if (e.gesture === "hand_raised") handRaised++;
          if (e.gesture === "toilet_request") toiletRequest++;
          if (e.attention_warning === true) attentionAlerts++;
          if (e.cheat_warning === true) cheatAlerts++;
        });

        // camera-detected attendance: students with an emotion doc in last 10 min
        const tenMinAgo = Date.now() - 10 * 60 * 1000;
        const recentIds = new Set();
        emotions.forEach((e) => {
          if (e.student_id && toMillis(e.timestamp) > tenMinAgo) {
            recentIds.add(e.student_id);
          }
        });

        setStats({
          awakeCount: awake,
          sleepingCount: sleeping,
          handRaisedCount: handRaised,
          toiletRequestCount: toiletRequest,
          attentionAlertsCount: attentionAlerts,
          cheatAlertsCount: cheatAlerts,
          cameraDetected: recentIds.size,
        });
      },
      (error) => {
        console.error("Error subscribing to emotions:", error);
        setErr(error.message);
      },
    );

    return unsub;
  }, [lectureId]);

  // ── totals subscription (whole-lecture cumulative counts) ────────────
  // Counts transitions, not raw frames: a 30-second toilet request at 1 obs/s
  // counts as 1 event, not 30. Capped at 5000 docs to stay performant for a
  // 90-min lecture with up to 50 students at 1 obs/sec.
  useEffect(() => {
    if (!lectureId) return;

    const q = query(
      collection(db, "emotions"),
      where("lecture_id", "==", lectureId),
      orderBy("timestamp", "asc"),
      limit(5000),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => d.data());
        const lastByStudent = new Map(); // student_id -> { gesture, state, yawning, attention, cheat, phone }
        const t = {
          totalObservations: docs.length,
          uniqueStudents: 0,
          handRaiseEvents: 0,
          toiletRequestEvents: 0,
          sleepEvents: 0,
          yawnEvents: 0,
          attentionWarnings: 0,
          cheatWarnings: 0,
          phoneEvents: 0,
        };
        const seen = new Set();
        for (const e of docs) {
          if (!e.student_id) continue;
          seen.add(e.student_id);
          const prev = lastByStudent.get(e.student_id) || {};

          // Gesture transitions: count when entering hand_raised / toilet_request
          if (e.gesture === "hand_raised" && prev.gesture !== "hand_raised") t.handRaiseEvents++;
          if (e.gesture === "toilet_request" && prev.gesture !== "toilet_request") t.toiletRequestEvents++;

          // Sleep transitions: count when going from awake -> sleeping
          if (e.state === "sleeping" && prev.state !== "sleeping") t.sleepEvents++;

          // Yawn transitions: count when yawning becomes true
          if (e.yawning === true && prev.yawning !== true) t.yawnEvents++;

          // Warning transitions: count when warning flips from false/unset -> true
          if (e.attention_warning === true && prev.attention_warning !== true) t.attentionWarnings++;
          if (e.cheat_warning === true && prev.cheat_warning !== true) t.cheatWarnings++;

          // Phone transitions
          if (e.on_phone === true && prev.on_phone !== true) t.phoneEvents++;

          lastByStudent.set(e.student_id, {
            gesture: e.gesture,
            state: e.state,
            yawning: e.yawning,
            attention_warning: e.attention_warning,
            cheat_warning: e.cheat_warning,
            on_phone: e.on_phone,
          });
        }
        t.uniqueStudents = seen.size;
        setTotals(t);
      },
      (error) => console.error("totals subscription:", error),
    );

    return unsub;
  }, [lectureId]);

  // ── attendance subscription ──────────────────────────────────────────────
  useEffect(() => {
    if (!lectureId) return;

    const q = query(
      collection(db, "attendance"),
      where("lecture_id", "==", lectureId),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const present = snap.docs.filter(
          (d) => d.data().status === "present",
        ).length;
        setConfirmedPresent(present);
      },
      (error) => {
        console.error("Error subscribing to attendance:", error);
      },
    );

    return unsub;
  }, [lectureId]);

  // ── warnings subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!lectureId) return;

    const q = query(
      collection(db, "warnings"),
      where("lecture_id", "==", lectureId),
      orderBy("timestamp", "desc"),
      limit(20),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setWarnings(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (error) => {
        console.error("Error subscribing to warnings:", error);
      },
    );

    return unsub;
  }, [lectureId]);

  // ── transcript subscription ──────────────────────────────────────────────
  useEffect(() => {
    if (!lectureId) return;

    const segmentsRef = collection(db, "transcripts", lectureId, "segments");
    const q = query(segmentsRef, orderBy("chunk_index"));

    const unsub = onSnapshot(q, (snap) => {
      setTranscriptSegments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return unsub;
  }, [lectureId]);

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-800">Live Classroom</h1>

      {err && (
        <div className="text-red-600 p-4 bg-red-50 rounded-2xl border border-red-200">
          {err}
        </div>
      )}

      {/* ── RIGHT NOW ── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Right now
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard value={stats.awakeCount} label="Awake now" color="green" />
          <StatCard value={stats.sleepingCount} label="Sleeping now" color="red" />
          <StatCard value={stats.handRaisedCount} label="Hands raised now" color="blue" />
          <StatCard value={stats.toiletRequestCount} label="Toilet requests now" color="yellow" />
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <StatCard value={stats.attentionAlertsCount} label="Attention alerts now" color="amber" />
          <StatCard value={stats.cheatAlertsCount} label="Cheat alerts now" color="red" />
        </div>
      </section>

      {/* ── TOTALS DURING THIS LECTURE ── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Total during this lecture
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard value={totals.handRaiseEvents}      label="Total hand raises"      color="blue" />
          <StatCard value={totals.toiletRequestEvents}  label="Total toilet requests"  color="yellow" />
          <StatCard value={totals.sleepEvents}          label="Total sleep events"     color="red" />
          <StatCard value={totals.yawnEvents}           label="Total yawns"            color="amber" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <StatCard value={totals.attentionWarnings}    label="Total attention warnings" color="amber" />
          <StatCard value={totals.cheatWarnings}        label="Total cheat warnings"     color="red" />
          <StatCard value={totals.phoneEvents}          label="Total phone events"       color="amber" />
          <StatCard value={totals.totalObservations}    label="Total observations"       color="green" />
        </div>
      </section>

      {/* ── attendance ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
          <div className="text-2xl font-bold text-emerald-700">{stats.cameraDetected}</div>
          <div className="text-sm text-slate-500 mt-1">Camera detected (last 10 min)</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
          <div className="text-2xl font-bold text-indigo-700">{confirmedPresent}</div>
          <div className="text-sm text-slate-500 mt-1">Confirmed present</div>
        </div>
      </div>

      {/* ── per-student live table ── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">Student Status</h2>
        </div>
        {studentRows.length === 0 ? (
          <p className="text-slate-400 text-sm px-6 py-6">No student data yet…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">Emotion</th>
                  <th className="px-4 py-3">Attention</th>
                  <th className="px-4 py-3">Cheat Risk</th>
                  <th className="px-4 py-3">Gesture</th>
                  <th className="px-4 py-3">Phone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {studentRows.map((e) => {
                  const cheatScore = Number(e.cheat_risk_score) || 0;
                  const gesture = e.gesture && e.gesture !== "none" ? e.gesture : null;
                  const sInfo = studentsLookup[e.student_id] || {};
                  return (
                    <tr key={e.student_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <StudentAvatar src={sInfo.face_photo_url} name={sInfo.name || e.student_id} />
                          <div className="leading-tight">
                            <div className="font-medium text-slate-800">{sInfo.name || e.student_id}</div>
                            <div className="text-xs text-slate-400 font-mono">{e.student_id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {e.state === "sleeping" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            sleeping
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            awake
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-600">{e.emotion ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${scoreBg(e.engagement_score)}`}>
                          {e.engagement_score != null ? Number(e.engagement_score).toFixed(0) : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {cheatScore > 0 ? (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${e.cheat_warning ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                            {cheatScore.toFixed(0)}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-600">
                        {gesture ? gesture.replace(/_/g, " ") : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {e.on_phone ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                            📵 Phone
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── live warnings feed ── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">Live Warnings</h2>
        </div>
        <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
          {warnings.length === 0 ? (
            <p className="text-slate-400 text-sm px-6 py-6">No warnings yet…</p>
          ) : (
            warnings.map((w) => {
              const isCheat = w.type === "cheat" || w.cheat_warning === true;
              return (
                <div
                  key={w.id}
                  className={`flex items-center justify-between px-6 py-3 text-sm ${isCheat ? "bg-red-50" : "bg-amber-50"}`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${isCheat ? "bg-red-500" : "bg-amber-400"}`}
                    />
                    <span className={`font-medium ${isCheat ? "text-red-700" : "text-amber-700"}`}>
                      {isCheat ? "Cheat" : "Attention"}
                    </span>
                    <span className="font-mono text-slate-600">{w.student_id ?? "—"}</span>
                    {w.score != null && (
                      <span className="text-slate-500">score: {Number(w.score).toFixed(0)}</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap">{formatTime(w.timestamp)}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── live transcript ── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Live Transcript</h2>
        <div className="space-y-2 max-h-96 overflow-y-auto bg-slate-50 p-4 rounded-xl">
          {transcriptSegments.length > 0 ? (
            transcriptSegments.map((seg) => (
              <div key={seg.id} className="text-sm border-b border-slate-200 pb-2 last:border-0">
                <span className="text-slate-400 text-xs">
                  {seg.start?.toFixed(1)}s – {seg.end?.toFixed(1)}s
                </span>
                <div className="text-slate-800 mt-0.5">{seg.text}</div>
              </div>
            ))
          ) : (
            <div className="text-slate-400">No transcript segments yet…</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── tiny helper component ─────────────────────────────────────────────────────

const colorMap = {
  green:  { card: "bg-green-50 border-green-200",  value: "text-green-800",  label: "text-green-600" },
  red:    { card: "bg-red-50 border-red-200",       value: "text-red-800",    label: "text-red-600" },
  blue:   { card: "bg-blue-50 border-blue-200",     value: "text-blue-800",   label: "text-blue-600" },
  yellow: { card: "bg-yellow-50 border-yellow-200", value: "text-yellow-800", label: "text-yellow-600" },
  amber:  { card: "bg-amber-50 border-amber-200",   value: "text-amber-800",  label: "text-amber-600" },
};

function StatCard({ value, label, color }) {
  const c = colorMap[color] ?? colorMap.blue;
  return (
    <div className={`${c.card} border rounded-2xl p-5 shadow-sm`}>
      <div className={`text-3xl font-bold ${c.value}`}>{value}</div>
      <div className={`text-sm mt-1 ${c.label}`}>{label}</div>
    </div>
  );
}

function StudentAvatar({ src, name }) {
  const [errored, setErrored] = useState(false);
  if (src && !errored) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setErrored(true)}
        className="h-10 w-10 rounded-full object-cover ring-2 ring-white shadow-sm bg-slate-100"
      />
    );
  }
  const initials = (name || "?")
    .split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return (
    <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-700 ring-2 ring-white shadow-sm flex items-center justify-center text-xs font-semibold">
      {initials}
    </div>
  );
}
