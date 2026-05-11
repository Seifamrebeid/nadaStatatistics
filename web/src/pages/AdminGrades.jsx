import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { RefreshCw } from "lucide-react";

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

export default function AdminGrades() {
  const [rows, setRows]         = useState([]);
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [doctors, setDoctors]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [gradesSnap, studentsSnap, subjectsSnap, doctorsSnap] = await Promise.all([
        getDocs(collection(db, "grades")),
        getDocs(collection(db, "students")),
        getDocs(collection(db, "subjects")),
        getDocs(collection(db, "doctors")),
      ]);
      setRows(gradesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setStudents(studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setSubjects(subjectsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setDoctors(doctorsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const studentById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);
  const subjectById = useMemo(() => Object.fromEntries(subjects.map((s) => [s.id, s])), [subjects]);
  const doctorById  = useMemo(() => Object.fromEntries(doctors.map((d) => [d.id, d])), [doctors]);

  const graded = rows.filter((r) => r.total != null);
  const summary = useMemo(() => ({
    students: new Set(rows.map((r) => r.student_id).filter(Boolean)).size,
    subjects: new Set(rows.map((r) => r.subject_id).filter(Boolean)).size,
    avgTotal: graded.length
      ? (graded.reduce((a, r) => a + (Number(r.total) || 0), 0) / graded.length).toFixed(1)
      : "—",
  }), [rows]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">All Student Grades</h1>
            <p className="mt-1 text-sm text-slate-600">
              Week 7 (/30) + Week 12 (/20) + Classwork (/10) + Final (/40) = Total (/100). Passing ≥ 40.
            </p>
          </div>
          <button onClick={load} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            Students graded: <span className="font-semibold">{summary.students}</span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            Subjects: <span className="font-semibold">{summary.subjects}</span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            Average total: <span className="font-semibold">{summary.avgTotal} / 100</span>
          </div>
        </div>
        {error && <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Student</th>
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
                <tr key={`${r.student_id}-${r.subject_id}-${i}`} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-900">{studentById[r.student_id]?.name || r.student_id || "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{subjectById[r.subject_id]?.name || r.subject_id || "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{doctorById[r.doctor_id]?.name || r.doctor_id || "-"}</td>
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
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">No grade records available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
