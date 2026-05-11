import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { FileText, RefreshCw } from "lucide-react";

const STATUS_STYLE = {
  recording: "bg-red-100 text-red-700",
  finished:  "bg-emerald-100 text-emerald-700",
  scheduled: "bg-slate-100 text-slate-600",
};

function fmtDate(val) {
  if (!val) return "—";
  const d = val?.toDate ? val.toDate() : new Date(val);
  return isNaN(d) ? "—" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function StudentTranscripts() {
  const { profile } = useAuth();
  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function load() {
    if (!profile?.linked_id) return;
    setLoading(true); setErr(null);
    try {
      const snap = await getDocs(
        query(collection(db, "lectures"), where("enrolled_student_ids", "array-contains", profile.linked_id)),
      );
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => {
        const ta = a.scheduled_at?.toMillis?.() ?? 0;
        const tb = b.scheduled_at?.toMillis?.() ?? 0;
        return tb - ta;
      });
      setLectures(rows);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [profile?.linked_id]);

  const withTranscript = lectures.filter((l) => l.transcript_id);
  const withoutTranscript = lectures.filter((l) => !l.transcript_id);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Transcripts</h1>
            <p className="mt-1 text-sm text-slate-500">
              Live and completed lecture transcripts. New segments appear automatically while the lecture is recording.
            </p>
          </div>
          <button onClick={load} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        {err && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}
      </div>

      {/* Lectures with transcripts */}
      {withTranscript.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">Available Transcripts</span>
            <span className="ml-auto text-xs text-slate-400">{withTranscript.length} lecture{withTranscript.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {withTranscript.map((lec) => (
              <div key={lec.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-900 truncate">{lec.title || lec.id}</span>
                    {lec.status === "recording" && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                        LIVE
                      </span>
                    )}
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ${STATUS_STYLE[lec.status] || STATUS_STYLE.scheduled}`}>
                      {lec.status || "scheduled"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">{fmtDate(lec.scheduled_at)}</p>
                </div>
                <Link
                  to={`/live/${lec.id}`}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {lec.status === "recording" ? "Watch Live" : "View Transcript"}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lectures without transcripts yet */}
      {withoutTranscript.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3">
            <span className="text-sm font-semibold text-slate-700">No Transcript Yet</span>
          </div>
          <div className="divide-y divide-slate-100">
            {withoutTranscript.map((lec) => (
              <div key={lec.id} className="flex items-center justify-between gap-4 px-5 py-4 opacity-60">
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-slate-700 truncate">{lec.title || lec.id}</span>
                  <p className="mt-0.5 text-xs text-slate-400">{fmtDate(lec.scheduled_at)}</p>
                </div>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[lec.status] || STATUS_STYLE.scheduled}`}>
                  {lec.status || "scheduled"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && lectures.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <FileText className="mx-auto h-8 w-8 text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No enrolled lectures found.</p>
        </div>
      )}
    </div>
  );
}
