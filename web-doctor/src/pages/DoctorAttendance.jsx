import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import {
  collection, doc, getDocs, onSnapshot, query, setDoc, where, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";

const STATUSES = ["present", "absent", "late", "excused"];

const STATUS_STYLE = {
  present: "bg-emerald-100 text-emerald-800",
  absent:  "bg-red-100 text-red-800",
  late:    "bg-amber-100 text-amber-800",
  excused: "bg-blue-100 text-blue-800",
  "":      "bg-slate-100 text-slate-500",
};

function formatDetectedAt(ts) {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function DoctorAttendance() {
  const { profile } = useAuth();
  const doctorId = profile?.linked_id;

  const [subjects,  setSubjects]  = useState([]);
  const [classes,   setClasses]   = useState([]);
  const [weeks,     setWeeks]     = useState([]);
  const [lectures,  setLectures]  = useState([]);
  const [students,  setStudents]  = useState([]);
  const [attMap,    setAttMap]    = useState({}); // key: studentId → doc
  const [edits,     setEdits]     = useState({}); // key: studentId → status
  const [saving,    setSaving]    = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);

  const [selSubject, setSelSubject] = useState("");
  const [selClass,   setSelClass]   = useState("");
  const [selWeek,    setSelWeek]    = useState(null);

  async function loadBase() {
    if (!doctorId) return;
    setLoading(true); setErr(null);
    try {
      const [subjSnap, clsSnap, wkSnap, lecSnap, studSnap] = await Promise.all([
        getDocs(query(collection(db, "subjects"), where("doctor_id", "==", doctorId))),
        getDocs(collection(db, "classes")),
        getDocs(collection(db, "weeks")),
        getDocs(query(collection(db, "lectures"), where("doctor_id", "==", doctorId))),
        getDocs(query(collection(db, "students"), where("active", "==", true))),
      ]);
      const subjList = subjSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setSubjects(subjList);
      setClasses(clsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setWeeks(wkSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLectures(lecSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setStudents(studSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      if (!selSubject && subjList.length > 0) setSelSubject(subjList[0].id);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadBase(); }, [doctorId]);

  const subjectClasses = useMemo(
    () => classes.filter((c) => c.subject_id === selSubject),
    [classes, selSubject],
  );
  useEffect(() => {
    setSelClass(subjectClasses[0]?.id || "");
    setSelWeek(null); setEdits({});
  }, [selSubject]);

  const weekNumbers = useMemo(() => {
    const nums = [...new Set(
      weeks.filter((w) => w.class_id === selClass).map((w) => w.week_number).filter(Boolean)
    )].sort((a, b) => a - b);
    return nums;
  }, [weeks, selClass]);

  useEffect(() => { setSelWeek(null); setEdits({}); }, [selClass]);

  const activeLecture = useMemo(() => {
    const week = weeks.find((w) => w.class_id === selClass && w.week_number === selWeek);
    if (!week) return null;
    return lectures.find((l) => l.week_id === week.id) || null;
  }, [lectures, weeks, selSubject, selClass, selWeek]);

  const enrolledStudents = useMemo(() => {
    const cls = classes.find((c) => c.id === selClass);
    const ids = cls?.enrolled_student_ids || [];
    return students.filter((s) => ids.includes(s.id));
  }, [classes, students, selClass]);

  // Real-time attendance subscription
  useEffect(() => {
    if (!activeLecture) { setAttMap({}); setEdits({}); return; }
    const q = query(collection(db, "attendance"), where("lecture_id", "==", activeLecture.id));
    const unsub = onSnapshot(q, (snap) => {
      const m = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        m[data.student_id] = { id: d.id, ...data };
      });
      setAttMap(m);
      // Merge edits: preserve existing manual edits, auto-fill auto-detected as present
      setEdits((prev) => {
        const next = { ...prev };
        for (const [studentId, doc] of Object.entries(m)) {
          if (doc.auto_detected === true) {
            // Auto-detected: set present only if user hasn't manually edited yet
            if (!(studentId in prev)) {
              next[studentId] = "present";
            }
          } else if (!(studentId in prev)) {
            next[studentId] = doc.status || "";
          }
        }
        return next;
      });
    }, (e) => setErr(e.message));
    return unsub;
  }, [activeLecture?.id]);

  async function saveAll() {
    if (!activeLecture) return;
    setSaving(true);
    try {
      await Promise.all(
        enrolledStudents.map((s) => {
          const status = edits[s.id] || "absent";
          const docId  = `${activeLecture.id}_${s.id}`;
          return setDoc(doc(db, "attendance", docId), {
            lecture_id:  activeLecture.id,
            student_id:  s.id,
            class_id:    selClass,
            subject_id:  selSubject,
            doctor_id:   doctorId,
            week_number: selWeek,
            status,
            updated_at:  serverTimestamp(),
          }, { merge: true });
        })
      );
      // attMap updates automatically via onSnapshot; no manual refresh needed
    } catch (e) { alert("Save failed: " + e.message); }
    finally { setSaving(false); }
  }

  const stats = useMemo(() => {
    const counts = { present: 0, absent: 0, late: 0, excused: 0, autoDetected: 0 };
    for (const s of enrolledStudents) {
      const st = edits[s.id] || "absent";
      if (counts[st] !== undefined) counts[st]++;
      if (attMap[s.id]?.auto_detected === true && (edits[s.id] === "present" || (!edits[s.id] && attMap[s.id]?.status === "present"))) {
        counts.autoDetected++;
      }
    }
    return counts;
  }, [edits, enrolledStudents, attMap]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Attendance</h1>
            <p className="mt-1 text-sm text-slate-500">Mark attendance per lecture. Select subject → class → week.</p>
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
        </div>
        {err && <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{err}</div>}
      </div>

      {/* week picker */}
      {selClass && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Week</p>
          <div className="flex flex-wrap gap-2">
            {weekNumbers.map((n) => (
              <button key={n} onClick={() => setSelWeek(n)}
                className={`h-9 w-9 rounded-lg text-sm font-semibold transition-colors
                  ${selWeek === n ? "bg-brand-600 text-white" : "border border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
                {n}
              </button>
            ))}
          </div>
          {selWeek && !activeLecture && (
            <p className="mt-3 text-sm text-amber-600">No lecture found for Week {selWeek} in this class.</p>
          )}
        </div>
      )}

      {/* attendance table */}
      {activeLecture && enrolledStudents.length > 0 && (
        <>
          {/* summary */}
          <div className="grid grid-cols-5 gap-3">
            {Object.entries({ present: stats.present, absent: stats.absent, late: stats.late, excused: stats.excused }).map(([st, n]) => (
              <div key={st} className={`rounded-xl border p-3 text-center text-sm font-semibold ${STATUS_STYLE[st]}`}>
                <div className="text-lg">{n}</div>
                <div className="capitalize text-xs font-normal mt-0.5">{st}</div>
              </div>
            ))}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center text-sm font-semibold text-emerald-700">
              <div className="text-lg">{stats.autoDetected}</div>
              <div className="text-xs font-normal mt-0.5">Auto-detected</div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <p className="text-sm font-medium text-slate-700">
                Week {selWeek} — {enrolledStudents.length} students
              </p>
              <button onClick={saveAll} disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save all"}
              </button>
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Saved</th>
                  <th className="px-4 py-3 text-center">Source</th>
                </tr>
              </thead>
              <tbody>
                {enrolledStudents.map((s) => {
                  const current    = edits[s.id] || "";
                  const saved      = attMap[s.id]?.status || "";
                  const dirty      = current !== saved;
                  const isAuto     = attMap[s.id]?.auto_detected === true;
                  const detectedAt = isAuto ? formatDetectedAt(attMap[s.id]?.detected_at) : null;
                  return (
                    <tr key={s.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <div className="flex items-center gap-3">
                          <StudentAvatar src={s.face_photo_url} name={s.name || s.id} />
                          <div className="leading-tight">
                            <div>{s.name || s.id}</div>
                            <div className="text-xs text-slate-400 font-mono">{s.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <select value={current}
                          onChange={(e) => setEdits((prev) => ({ ...prev, [s.id]: e.target.value }))}
                          className={`rounded-lg border px-2 py-1 text-xs font-semibold capitalize ${STATUS_STYLE[current] || "border-slate-300"}`}>
                          <option value="">— mark —</option>
                          {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {saved ? (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLE[saved]}`}>
                            {saved}{dirty ? " *" : ""}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">not saved</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isAuto ? (
                          <span className="inline-flex flex-col items-center gap-0.5">
                            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Auto</span>
                            {detectedAt && <span className="text-xs text-slate-400">{detectedAt}</span>}
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">Manual</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!selClass && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Select a subject and class to mark attendance.
        </div>
      )}
    </div>
  );
}

// ── Avatar component — falls back to initials if photo URL is missing/broken
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
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-700 ring-2 ring-white shadow-sm flex items-center justify-center text-xs font-semibold">
      {initials}
    </div>
  );
}
