import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { Search, RefreshCw } from "lucide-react";

export default function AdminStudentSearch() {
  const [query, setQuery] = useState("");
  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(collection(db, "students"));
      setAllRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Client-side search: filter by student doc id or name, case-insensitive.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(
      (r) =>
        (r.id || "").toLowerCase().includes(q) ||
        (r.name || "").toLowerCase().includes(q) ||
        (r.email || "").toLowerCase().includes(q),
    );
  }, [allRows, query]);

  const summary = useMemo(() => {
    const total = allRows.length;
    const active = allRows.filter((r) => r.active !== false).length;
    return { total, active, inactive: total - active };
  }, [allRows]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Student Search
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Search across the full student directory by student ID or name
              with no missing records.
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
              Search by student ID or name
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Try: 211014850 or Marwan"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <div>
              Total: <span className="font-semibold">{summary.total}</span>
            </div>
            <div>
              Active:{" "}
              <span className="font-semibold text-emerald-700">
                {summary.active}
              </span>
            </div>
            <div>
              Inactive:{" "}
              <span className="font-semibold text-amber-700">
                {summary.inactive}
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
                <th className="px-4 py-3">Student ID</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const active = r.active !== false;
                return (
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
                      {r.email || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          active
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {active ? "active" : "inactive"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No students matched your search.
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
