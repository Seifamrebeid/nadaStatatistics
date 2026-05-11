import { useEffect, useMemo, useState } from "react";
import { Search, RefreshCw } from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";

export default function StudentDoctorSearch() {
  const [searchTerm, setSearchTerm] = useState("");
  const [allDoctors, setAllDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(
        query(collection(db, "doctors"), where("active", "==", true)),
      );
      setAllDoctors(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    if (!searchTerm.trim()) return allDoctors;
    const term = searchTerm.toLowerCase();
    return allDoctors.filter((d) =>
      (d.name || "").toLowerCase().includes(term),
    );
  }, [allDoctors, searchTerm]);

  const summary = useMemo(() => {
    const total = rows.length;
    const byDept = new Set(rows.map((r) => r.department).filter(Boolean)).size;
    return { total, departments: byDept };
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Doctor Search
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Search doctors by name and quickly find their department and
              profile id.
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

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Search by doctor name
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Try: Mona or Saeed"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <div>
              Total doctors:{" "}
              <span className="font-semibold">{summary.total}</span>
            </div>
            <div>
              Departments:{" "}
              <span className="font-semibold text-brand-700">
                {summary.departments}
              </span>
            </div>
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
                <th className="px-4 py-3">Doctor ID</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Department</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-slate-100"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-700">
                    {r.id}
                  </td>
                  <td className="px-4 py-3 text-slate-900">
                    {r.name || "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.department || "-"}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No doctors matched your search.
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
