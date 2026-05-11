import { useEffect, useMemo, useState } from "react";
import { Search, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Lightbulb, Brain } from "lucide-react";
import {
  collection, getDocs, query, where, orderBy, limit,
} from "firebase/firestore";
import { db } from "../firebase";

function ago(ts) {
  if (!ts) return "";
  const ms = ts?.toMillis ? ts.toMillis() : new Date(ts).getTime();
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StudentDetail({ studentId }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [recSnap, warnSnap, emotSnap] = await Promise.all([
          getDocs(query(
            collection(db, "recommendations"),
            where("student_id", "==", studentId),
            orderBy("generated_at", "desc"),
            limit(1),
          )),
          getDocs(query(
            collection(db, "warnings"),
            where("student_id", "==", studentId),
            orderBy("timestamp", "desc"),
            limit(8),
          )),
          getDocs(query(
            collection(db, "emotions"),
            where("student_id", "==", studentId),
          )),
        ]);

        const rec = recSnap.empty ? null : recSnap.docs[0].data();
        const warnings = warnSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const emotions = emotSnap.docs.map((d) => d.data());

        const avgAtt = emotions.length
          ? (emotions.reduce((s, e) => s + (e.attention_score || 0), 0) / emotions.length).toFixed(1)
          : null;
        const avgEng = emotions.length
          ? (emotions.reduce((s, e) => s + (e.engagement_score || 0), 0) / emotions.length).toFixed(1)
          : null;
        const attWarnCount = emotions.filter((e) => e.attention_warning).length;
        const cheatWarnCount = emotions.filter((e) => e.cheat_warning).length;

        if (!cancelled) setDetail({ rec, warnings, avgAtt, avgEng, attWarnCount, cheatWarnCount, total: emotions.length });
      } catch (e) {
        if (!cancelled) setDetail({ error: e.message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [studentId]);

  if (loading) return <div className="px-6 py-4 text-sm text-slate-400 animate-pulse">Loading student data…</div>;
  if (!detail || detail.error) return <div className="px-6 py-4 text-sm text-red-500">{detail?.error || "No data."}</div>;

  const attColor = detail.avgAtt === null ? "text-slate-400"
    : detail.avgAtt >= 70 ? "text-emerald-600"
    : detail.avgAtt >= 45 ? "text-amber-600"
    : "text-red-600";

  return (
    <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 space-y-4">
      {/* Quick stats */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-center min-w-[100px]">
          <div className={`text-xl font-bold ${attColor}`}>{detail.avgAtt ?? "—"}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Avg Attention</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-center min-w-[100px]">
          <div className="text-xl font-bold text-brand-600">{detail.avgEng ?? "—"}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Avg Engagement</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-center min-w-[100px]">
          <div className="text-xl font-bold text-amber-600">{detail.attWarnCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Attn Warnings</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-center min-w-[100px]">
          <div className="text-xl font-bold text-red-600">{detail.cheatWarnCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Cheat Flags</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-center min-w-[100px]">
          <div className="text-xl font-bold text-slate-700">{detail.total}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Observations</div>
        </div>
      </div>

      {/* Recommendations */}
      {detail.rec && (
        <div>
          <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Lightbulb className="h-3.5 w-3.5" /> Smart Recommendations
          </div>
          <div className="space-y-1.5">
            {(detail.rec.items || []).map((item, i) => (
              <div key={i} className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-slate-700">
                {item}
              </div>
            ))}
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            Attention score: {detail.rec.attention_score} · Generated {ago(detail.rec.generated_at)}
          </div>
        </div>
      )}

      {/* Warnings */}
      {detail.warnings.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <AlertTriangle className="h-3.5 w-3.5" /> Recent Warnings
          </div>
          <div className="space-y-1">
            {detail.warnings.map((w) => (
              <div key={w.id} className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium ${w.type === "cheating" ? "bg-red-50 text-red-700 border border-red-100" : "bg-amber-50 text-amber-700 border border-amber-100"}`}>
                <span className="capitalize">{w.type === "cheating" ? "Cheating risk" : "Low attention"}</span>
                <span className="flex items-center gap-2">
                  <span>score: {w.score}</span>
                  <span className="text-[10px] opacity-70">{ago(w.timestamp)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!detail.rec && detail.warnings.length === 0 && (
        <p className="text-sm text-slate-400">No recommendations or warnings recorded yet for this student.</p>
      )}
    </div>
  );
}

export default function DoctorStudentSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(collection(db, "students"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRows(list);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.name || "").toLowerCase().includes(q) ||
        (r.id || "").toLowerCase().includes(q) ||
        (r.email || "").toLowerCase().includes(q),
    );
  }, [rows, searchQuery]);

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const active = filteredRows.filter((r) => r.active !== false).length;
    return { total, active, inactive: total - active };
  }, [filteredRows]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Student Search</h1>
            <p className="mt-1 text-sm text-slate-600">
              Click a student row to view their attention analytics, warnings, and smart recommendations.
            </p>
          </div>
          <button onClick={load}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            disabled={loading}>
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
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Try: stu_001 or Nada"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <div>Total: <span className="font-semibold">{summary.total}</span></div>
            <div>Active: <span className="font-semibold text-emerald-700">{summary.active}</span></div>
            <div>Inactive: <span className="font-semibold text-amber-700">{summary.inactive}</span></div>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div>
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
                <th className="px-4 py-3 text-center">Analytics</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => {
                const sid = r.id || "-";
                const active = r.active !== false;
                const isExpanded = expanded === sid;
                return [
                  <tr key={sid} onClick={() => setExpanded(isExpanded ? null : sid)}
                    className="border-t border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-700">{sid}</td>
                    <td className="px-4 py-3 text-slate-900">{r.name || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{r.email || "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${active ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                        {active ? "active" : "inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-xs text-brand-600">
                        <Brain className="h-3.5 w-3.5" />
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </span>
                    </td>
                  </tr>,
                  isExpanded && (
                    <tr key={`${sid}-detail`}>
                      <td colSpan={5} className="p-0">
                        <StudentDetail studentId={sid} />
                      </td>
                    </tr>
                  ),
                ];
              })}
              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
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
