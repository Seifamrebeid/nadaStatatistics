import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { RefreshCw, Download } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export default function DoctorAnalytics() {
  const { profile } = useAuth();
  const doctorId = profile?.linked_id;

  const [subjects,  setSubjects]  = useState([]);
  const [classes,   setClasses]   = useState([]);
  const [weeks,     setWeeks]     = useState([]);
  const [lectures,  setLectures]  = useState([]);
  const [emotions,  setEmotions]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [loadingEm, setLoadingEm] = useState(false);
  const [err,       setErr]       = useState(null);

  // selections
  const [selSubject, setSelSubject] = useState("");
  const [selClass,   setSelClass]   = useState("");
  const [selWeek,    setSelWeek]    = useState(null); // week_number (int)
  const [selStudent, setSelStudent] = useState("");

  // ── load base data ────────────────────────────────────────────────────────
  async function loadBase() {
    setLoading(true); setErr(null);
    try {
      const [subjSnap, clsSnap, wkSnap, lecSnap] = await Promise.all([
        doctorId
          ? getDocs(query(collection(db, "subjects"), where("doctor_id", "==", doctorId)))
          : getDocs(collection(db, "subjects")),
        getDocs(collection(db, "classes")),
        getDocs(collection(db, "weeks")),
        doctorId
          ? getDocs(query(collection(db, "lectures"), where("doctor_id", "==", doctorId)))
          : getDocs(collection(db, "lectures")),
      ]);
      const subjList = subjSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setSubjects(subjList);
      setClasses(clsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setWeeks(wkSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLectures(lecSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      // auto-select first subject
      if (subjList.length > 0 && !selSubject) {
        setSelSubject(subjList[0].id);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadBase(); }, [doctorId]);

  // ── cascade: classes for selected subject ─────────────────────────────────
  const subjectClasses = useMemo(
    () => classes.filter((c) => c.subject_id === selSubject),
    [classes, selSubject],
  );

  // auto-select first class when subject changes
  useEffect(() => {
    if (subjectClasses.length > 0) {
      setSelClass(subjectClasses[0].id);
    } else {
      setSelClass("");
    }
    setSelWeek(null);
    setEmotions([]);
  }, [selSubject]);

  // ── week numbers for selected class ───────────────────────────────────────
  const weekNumbers = useMemo(() => {
    const classWeeks = weeks.filter((w) => w.class_id === selClass);
    const nums = [...new Set(classWeeks.map((w) => w.week_number).filter(Boolean))];
    return nums.sort((a, b) => a - b);
  }, [weeks, selClass]);

  // reset week when class changes
  useEffect(() => {
    setSelWeek(null);
    setEmotions([]);
  }, [selClass]);

  // ── find lecture for selected subject + class + week ──────────────────────
  const activeLecture = useMemo(() => {
    if (!selSubject || !selClass || !selWeek) return null;
    return lectures.find(
      (l) => l.subject_id === selSubject && l.class_id === selClass && l.week_number === selWeek,
    ) || null;
  }, [lectures, selSubject, selClass, selWeek]);

  // ── load emotions when lecture changes ────────────────────────────────────
  useEffect(() => {
    if (!activeLecture) { setEmotions([]); return; }
    setLoadingEm(true);
    getDocs(query(collection(db, "emotions"), where("lecture_id", "==", activeLecture.id)))
      .then((snap) => setEmotions(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((e) => setErr(e.message))
      .finally(() => setLoadingEm(false));
  }, [activeLecture?.id]);

  // ── derived analytics ─────────────────────────────────────────────────────
  const studentOptions = useMemo(() => {
    const ids = [...new Set(emotions.map((e) => e.student_id).filter(Boolean))];
    return ids.sort();
  }, [emotions]);

  const filtered = useMemo(
    () => selStudent ? emotions.filter((e) => e.student_id === selStudent) : emotions,
    [emotions, selStudent],
  );

  const engagementData = useMemo(() => {
    const byTime = new Map();
    for (const row of filtered) {
      const ts = row.timestamp
        ? (row.timestamp?.toDate ? row.timestamp.toDate() : new Date(row.timestamp)).toLocaleTimeString()
        : "—";
      const cur = byTime.get(ts) || { t: ts, sum: 0, n: 0 };
      cur.sum += Number(row.engagement_score || 0);
      cur.n += 1;
      byTime.set(ts, cur);
    }
    return Array.from(byTime.values())
      .map((r) => ({ time: r.t, score: +(r.sum / r.n).toFixed(2) }))
      .slice(-30);
  }, [filtered]);

  const sleepData = useMemo(() => {
    const m = new Map();
    for (const r of filtered) {
      const k = r.state === "sleeping" ? (r.sleep_reason || "sleeping") : "awake";
      m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries()).map(([reason, count]) => ({ reason, count }));
  }, [filtered]);

  const gestureData = useMemo(() => {
    const m = new Map();
    for (const r of filtered) {
      const g = r.gesture;
      if (g && g !== "none") m.set(g, (m.get(g) || 0) + 1);
    }
    return Array.from(m.entries()).map(([gesture, count]) => ({ gesture, count }));
  }, [filtered]);

  // ── csv download ──────────────────────────────────────────────────────────
  function downloadCSV() {
    if (!emotions.length) return;
    const headers = ["student_id","lecture_id","timestamp","emotion","state","engagement_score","gesture","sleep_reason"];
    const rows = emotions.map((e) => {
      const ts = e.timestamp?.toDate ? e.timestamp.toDate().toISOString() : (e.timestamp || "");
      return [e.student_id||"",e.lecture_id||"",ts,e.emotion||"",e.state||"",e.engagement_score??"",e.gesture||"",e.sleep_reason||""].join(",");
    });
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `week${selWeek}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  }

  const selSubjectName = subjects.find((s) => s.id === selSubject)?.name || "";
  const selClassName   = classes.find((c) => c.id === selClass)?.name || "";

  return (
    <div className="space-y-5">
      {/* header + subject/class selectors */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Analytics</h1>
            {selSubjectName && (
              <p className="mt-1 text-sm text-slate-500">{selSubjectName}{selClassName ? ` — ${selClassName}` : ""}</p>
            )}
          </div>
          <button onClick={loadBase} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <select value={selSubject} onChange={(e) => setSelSubject(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Select subject</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={selClass} onChange={(e) => setSelClass(e.target.value)}
            disabled={!selSubject}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400">
            <option value="">Select class</option>
            {subjectClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {studentOptions.length > 0 && (
            <select value={selStudent} onChange={(e) => setSelStudent(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">All students</option>
              {studentOptions.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          )}
        </div>

        {err && <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{err}</div>}
      </div>

      {/* week number selector */}
      {selClass && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Week</p>
          <div className="flex flex-wrap gap-2">
            {weekNumbers.map((n) => (
              <button
                key={n}
                onClick={() => setSelWeek(n)}
                className={`h-9 w-9 rounded-lg text-sm font-semibold transition-colors
                  ${selWeek === n
                    ? "bg-brand-600 text-white"
                    : "border border-slate-300 text-slate-700 hover:bg-slate-50"}`}
              >
                {n}
              </button>
            ))}
          </div>
          {selWeek && !activeLecture && !loadingEm && (
            <p className="mt-3 text-sm text-slate-500">No lecture recorded for Week {selWeek} yet.</p>
          )}
        </div>
      )}

      {/* charts */}
      {loadingEm && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Loading data…
        </div>
      )}

      {!loadingEm && activeLecture && emotions.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          No emotion data recorded for this lecture yet.
        </div>
      )}

      {!loadingEm && emotions.length > 0 && (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            {engagementData.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-4 text-base font-semibold text-slate-900">Engagement Over Time</h2>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={engagementData}>
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="score" stroke="#3b82f6" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {sleepData.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-4 text-base font-semibold text-slate-900">Attention State</h2>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={sleepData}>
                    <XAxis dataKey="reason" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#ef4444" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {gestureData.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-slate-900">Gestures</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={gestureData}>
                  <XAxis dataKey="gesture" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#10b981" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div>
            <button onClick={downloadCSV}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4" />
              Download CSV
            </button>
          </div>
        </>
      )}

      {!selClass && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Select a subject and class to view analytics.
        </div>
      )}
    </div>
  );
}
