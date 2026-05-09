import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import api from "../services/api";

const normalise = (row) => {
  const v = (x) => (Array.isArray(x) ? x[0] : x);
  const out = {};
  for (const [k, val] of Object.entries(row || {})) out[k] = v(val);
  return out;
};

export default function AdminGrades() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/api/grades");
      const list = Array.isArray(data) ? data : [];
      setRows(list.map(normalise));
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(
    () => ({
      students: new Set(rows.map((r) => r.student_id).filter(Boolean)).size,
      subjects: new Set(rows.map((r) => r.subject_id).filter(Boolean)).size,
      avgMark: rows.length
        ? (
            rows.reduce((a, r) => a + (Number(r.mark) || 0), 0) / rows.length
          ).toFixed(1)
        : "0.0",
    }),
    [rows],
  );

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              All Student Grades
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Complete gradebook for all students across all subjects. Marks are
              out of 100 with letter grades.
            </p>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            Students: <span className="font-semibold">{summary.students}</span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            Subjects: <span className="font-semibold">{summary.subjects}</span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            Average mark:{" "}
            <span className="font-semibold">{summary.avgMark}</span>
          </div>
        </div>
        {error && (
          <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Doctor</th>
                <th className="px-4 py-3">Mark / 100</th>
                <th className="px-4 py-3">Grade</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={`${r.student_id}-${r.subject_id}-${i}`}
                  className="border-t border-slate-100"
                >
                  <td className="px-4 py-3 text-slate-900">
                    {r.student_name || r.student_id || "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {r.subject_name || r.subject_id || "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {r.doctor_name || r.doctor_id || "-"}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {r.mark ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700">
                      {r.grade || "-"}
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No grade records available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
