import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useChildren } from "../context/ChildContext";

const STATUS_STYLE = {
  present: "bg-emerald-100 text-emerald-800",
  absent:  "bg-red-100 text-red-800",
  late:    "bg-amber-100 text-amber-800",
  excused: "bg-blue-100 text-blue-800",
};

export default function ParentAttendance() {
  const { selectedId, selected } = useChildren();

  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState(null);
  const [fSubject, setFSubject] = useState("");

  async function load() {
    if (!selectedId) { setRows([]); return; }
    setLoading(true); setErr(null);
    try {
      const snap = await getDocs(
        query(collection(db, "attendance"), where("student_id", "==", selectedId))
      );
      const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const subjectCache = {};
      const enriched = await Promise.all(records.map(async (r) => {
        if (r.subject_id && !subjectCache[r.subject_id]) {
          const s = await getDoc(doc(db, "subjects", r.subject_id));
          subjectCache[r.subject_id] = s.exists() ? (s.data().name || r.subject_id) : r.subject_id;
        }
        return { ...r, subject_name: subjectCache[r.subject_id] || r.subject_id || "—" };
      }));

      setRows(enriched.sort((a, b) => (a.week_number ?? 0) - (b.week_number ?? 0)));
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [selectedId]);

  const subjects = useMemo(() => {
    const names = [...new Map(rows.map((r) => [r.subject_id, r.subject_name])).entries()];
    return names;
  }, [rows]);

  const filtered = useMemo(
    () => fSubject ? rows.filter((r) => r.subject_id === fSubject) : rows,
    [rows, fSubject],
  );

  const summary = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const r of filtered) if (c[r.status] !== undefined) c[r.status]++;
    return c;
  }, [filtered]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Child Attendance</h1>
            <p className="mt-1 text-sm text-slate-500">
              Attendance record for {selected?.name || "the selected child"}.
            </p>
          </div>
          <button onClick={load} disabled={loading || !selectedId}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        {!selectedId && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Select a child first from the header switcher.
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <select value={fSubject} onChange={(e) => setFSubject(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">All subjects</option>
            {subjects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        {err && <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{err}</div>}
      </div>

      {filtered.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(summary).map(([st, n]) => (
            <div key={st} className={`rounded-xl border p-3 text-center ${STATUS_STYLE[st] || "bg-slate-100 text-slate-700"}`}>
              <div className="text-lg font-semibold">{n}</div>
              <div className="capitalize text-xs mt-0.5">{st}</div>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3 text-center">Week</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-900">{r.subject_name}</td>
                  <td className="px-4 py-3 text-center text-slate-700">Week {r.week_number ?? "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLE[r.status] || "bg-slate-100 text-slate-600"}`}>
                      {r.status || "—"}
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-500">No attendance records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
