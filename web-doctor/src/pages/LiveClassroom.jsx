import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  where,
  limit,
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

  // stats derived from emotions
  const [stats, setStats] = useState({
    awakeCount: 0,
    sleepingCount: 0,
    handRaisedCount: 0,
    toiletRequestCount: 0,
    attentionAlertsCount: 0,
    cheatAlertsCount: 0,
    cameraDetected: 0,
  });

  // latest emotion doc per student
  const [studentRows, setStudentRows] = useState([]);

  // attendance from the attendance collection
  const [confirmedPresent, setConfirmedPresent] = useState(0);

  // warnings feed
  const [warnings, setWarnings] = useState([]);

  // transcript
  const [transcriptSegments, setTranscriptSegments] = useState([]);

  const [err, setErr] = useState(null);

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

      {/* ── state overview ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard value={stats.awakeCount} label="Awake" color="green" />
        <StatCard value={stats.sleepingCount} label="Sleeping" color="red" />
        <StatCard value={stats.handRaisedCount} label="Hands Raised" color="blue" />
        <StatCard value={stats.toiletRequestCount} label="Toilet Requests" color="yellow" />
      </div>

      {/* ── alerts ── */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard value={stats.attentionAlertsCount} label="Attention Alerts" color="amber" />
        <StatCard value={stats.cheatAlertsCount} label="Cheat Alerts" color="red" />
      </div>

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
                  <th className="px-4 py-3">Student ID</th>
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
                  return (
                    <tr key={e.student_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-slate-700">{e.student_id}</td>
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
