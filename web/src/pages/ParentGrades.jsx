import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useChildren } from "../context/ChildContext";

const LETTER_COLOR = {
  "A+": "bg-emerald-100 text-emerald-800",
  "A":  "bg-emerald-100 text-emerald-800",
  "A-": "bg-emerald-100 text-emerald-800",
  "B+": "bg-blue-100 text-blue-800",
  "B":  "bg-blue-100 text-blue-800",
  "B-": "bg-blue-100 text-blue-800",
  "C+": "bg-amber-100 text-amber-800",
  "C":  "bg-amber-100 text-amber-800",
  "C-": "bg-amber-100 text-amber-800",
  "D+": "bg-orange-100 text-orange-800",
  "D":  "bg-orange-100 text-orange-800",
  "D-": "bg-orange-100 text-orange-800",
  "F":  "bg-red-100 text-red-800",
  "W":  "bg-slate-100 text-slate-600",
};

export default function ParentGrades() {
  const { selectedId, selected } = useChildren();
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  async function load() {
    if (!selectedId) { setRows([]); return; }
    setLoading(true); setError(null);
    try {
      const snap = await getDocs(
        query(collection(db, "grades"), where("student_id", "==", selectedId)),
      );
      const grades = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const subjectCache = {};
      const doctorCache  = {};
      const enriched = await Promise.all(
        grades.map(async (g) => {
          let subject_name = g.subject_id;
          if (g.subject_id) {
            if (!subjectCache[g.subject_id]) {
              const s = await getDoc(doc(db, "subjects", g.subject_id));
              subjectCache[g.subject_id] = s.exists() ? (s.data().name || g.subject_id) : g.subject_id;
            }
            subject_name = subjectCache[g.subject_id];
          }
          let doctor_name = g.doctor_id;
          if (g.doctor_id) {
            if (!doctorCache[g.doctor_id]) {
              const d = await getDoc(doc(db, "doctors", g.doctor_id));
              doctorCache[g.doctor_id] = d.exists() ? (d.data().name || g.doctor_id) : g.doctor_id;
            }
            doctor_name = doctorCache[g.doctor_id];
          }
          return { ...g, subject_name, doctor_name };
        }),
      );
      setRows(enriched);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [selectedId]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Child Grades</h1>
            <p className="mt-1 text-sm text-slate-600">
              Week 7 (/30) + Week 12 (/20) + Classwork (/10) + Final (/40) = Total (/100) for{" "}
              {selected?.name || "the selected child"}. Passing ≥ 40.
            </p>
          </div>
          <button onClick={load} disabled={loading || !selectedId}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        {!selectedId && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Select a child first from the header switcher.
          </div>
        )}
        {error && <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Doctor</th>
                <th className="px-4 py-3 text-center">Week 7<br/><span className="normal-case font-normal">/30</span></th>
                <th className="px-4 py-3 text-center">Week 12<br/><span className="normal-case font-normal">/20</span></th>
                <th className="px-4 py-3 text-center">Classwork<br/><span className="normal-case font-normal">/10</span></th>
                <th className="px-4 py-3 text-center">Final<br/><span className="normal-case font-normal">/40</span></th>
                <th className="px-4 py-3 text-center">Total<br/><span className="normal-case font-normal">/100</span></th>
                <th className="px-4 py-3 text-center">Letter</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.subject_id}-${i}`} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-900">{r.subject_name || r.subject_id || "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{r.doctor_name || r.doctor_id || "-"}</td>
                  <td className="px-4 py-3 text-center text-slate-700">{r.week7 ?? "-"}</td>
                  <td className="px-4 py-3 text-center text-slate-700">{r.week12 ?? "-"}</td>
                  <td className="px-4 py-3 text-center text-slate-700">{r.classwork ?? "-"}</td>
                  <td className="px-4 py-3 text-center text-slate-700">{r.final ?? "-"}</td>
                  <td className="px-4 py-3 text-center font-semibold text-slate-900">{r.total ?? "-"}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${LETTER_COLOR[r.letter] || "bg-slate-100 text-slate-600"}`}>
                      {r.letter || "-"}
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">No grades found for this child.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
