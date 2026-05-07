import { useEffect, useState } from "react";
import api from "../services/api";
import StatCard from "../components/StatCard";
import { Users, Presentation, Smile } from "lucide-react";
import { useChildren } from "../context/ChildContext";

const v = (x) => (Array.isArray(x) ? x[0] : x);

export default function ParentDashboard() {
  const { children: kids, loading, err } = useChildren();
  const [perChild, setPerChild] = useState([]);
  const [lecturesCount, setLecturesCount] = useState(0);
  const [busy, setBusy] = useState(true);
  const [pageErr, setPageErr] = useState(null);

  useEffect(() => {
    if (loading) return;
    if (kids.length === 0) {
      setBusy(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const lecturesRes = await api.get("/api/lectures");
        const lectures = Array.isArray(lecturesRes.data) ? lecturesRes.data : [];
        const summaries = await Promise.all(
          kids.map(async (c) => {
            try {
              const { data } = await api.get(
                `/api/analytics/student/${c.id}/comparison`,
              );
              return {
                id: c.id,
                name: c.name,
                self: Number(v(data?.self_mean) || 0),
                classMean: Number(v(data?.class_mean) || 0),
                lectures: Array.isArray(data?.per_lecture)
                  ? data.per_lecture.length
                  : 0,
              };
            } catch {
              return { id: c.id, name: c.name, self: 0, classMean: 0, lectures: 0 };
            }
          }),
        );
        if (cancelled) return;
        setPerChild(summaries);
        setLecturesCount(lectures.length);
      } catch (e) {
        if (!cancelled) setPageErr(e.response?.data?.error || e.message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, kids]);

  if (err || pageErr) {
    return (
      <div className="card p-6 text-red-700 bg-red-50 border-red-200">
        Error: {err || pageErr}
      </div>
    );
  }

  if (loading || busy) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-5 animate-pulse">
            <div className="h-3 w-20 bg-slate-200 rounded" />
            <div className="h-8 w-24 bg-slate-200 rounded mt-3" />
          </div>
        ))}
      </div>
    );
  }

  if (kids.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-slate-500">
        No children are linked to your account yet. Please contact the admin.
      </div>
    );
  }

  const overallSelf =
    perChild.length > 0
      ? perChild.reduce((s, c) => s + c.self, 0) / perChild.length
      : 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
          Welcome
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          A snapshot of your {kids.length === 1 ? "child" : "children"}'s
          engagement.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Children"
          value={kids.length}
          accent="brand"
          icon={Users}
        />
        <StatCard
          label="Visible Lectures"
          value={lecturesCount}
          accent="slate"
          icon={Presentation}
        />
        <StatCard
          label="Average Engagement"
          value={`${overallSelf.toFixed(2)}%`}
          accent="green"
          icon={Smile}
        />
      </div>

      <div className="card p-6 mt-6">
        <h2 className="font-semibold text-slate-900 mb-4">Per-child summary</h2>
        <div className="divide-y divide-slate-100">
          {perChild.map((c) => (
            <div
              key={c.id}
              className="py-3 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="font-medium text-slate-900 truncate">
                  {c.name || c.id}
                </div>
                <div className="text-xs text-slate-500">
                  {c.lectures} lecture{c.lectures === 1 ? "" : "s"} tracked
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-right">
                  <div className="text-[11px] text-slate-500">Self</div>
                  <div className="font-semibold text-emerald-600">
                    {c.self.toFixed(2)}%
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-500">Class</div>
                  <div className="font-semibold text-brand-600">
                    {c.classMean.toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
