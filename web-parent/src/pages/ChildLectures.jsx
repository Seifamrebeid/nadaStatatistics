import { useEffect, useState } from "react";
import api from "../services/api";
import { useChildren } from "../context/ChildContext";
import { CalendarClock } from "lucide-react";

const v = (x) => (Array.isArray(x) ? x[0] : x);
const flatIds = (x) => {
  if (!Array.isArray(x)) return x ? [x] : [];
  if (x.length > 0 && Array.isArray(x[0])) return x[0];
  return x;
};

export default function ChildLectures() {
  const { selected } = useChildren();
  const [lectures, setLectures] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    (async () => {
      try {
        setBusy(true);
        const [lRes, wRes, cRes] = await Promise.all([
          api.get("/api/lectures"),
          api.get("/api/weeks"),
          api.get("/api/classes"),
        ]);
        const lectures = (Array.isArray(lRes.data) ? lRes.data : []).map((l) => ({
          id: v(l.id),
          title: v(l.title),
          status: v(l.status) || "scheduled",
          scheduled_at: v(l.scheduled_at),
          week_id: v(l.week_id),
          enrolled: flatIds(l.enrolled_student_ids),
        }));
        const weeks = (Array.isArray(wRes.data) ? wRes.data : []).map((w) => ({
          id: v(w.id),
          class_id: v(w.class_id),
        }));
        const classes = (Array.isArray(cRes.data) ? cRes.data : []).map((c) => ({
          id: v(c.id),
          enrolled: flatIds(c.enrolled_student_ids),
        }));

        // Lecture is for this kid if directly enrolled, OR if its week
        // belongs to a class the kid is enrolled in.
        const weekToClass = Object.fromEntries(weeks.map((w) => [w.id, w.class_id]));
        const kidClassIds = new Set(
          classes.filter((c) => c.enrolled.includes(selected.id)).map((c) => c.id),
        );
        const list = lectures.filter(
          (l) =>
            l.enrolled.includes(selected.id) ||
            kidClassIds.has(weekToClass[l.week_id]),
        );
        if (!cancelled) setLectures(list);
      } catch (e) {
        if (!cancelled) setErr(e.response?.data?.error || e.message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  if (!selected) {
    return (
      <div className="card p-10 text-center text-sm text-slate-500">
        Select a child first.
      </div>
    );
  }

  if (err) {
    return (
      <div className="card p-6 text-red-700 bg-red-50 border-red-200">
        Error: {err}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
          Lectures
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Lectures {selected.name || selected.id} is enrolled in.
        </p>
      </div>

      {busy ? (
        <div className="card p-6 animate-pulse">
          <div className="h-4 w-32 bg-slate-200 rounded" />
        </div>
      ) : lectures.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">
          No lectures enrolled yet.
        </div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {lectures.map((l) => {
            const styleByStatus = {
              recording: "bg-red-50 text-red-700 ring-red-100",
              finished: "bg-emerald-50 text-emerald-700 ring-emerald-100",
            };
            const cls =
              styleByStatus[l.status] ||
              "bg-slate-100 text-slate-600 ring-slate-200";
            return (
              <div
                key={l.id}
                className="flex justify-between items-center px-5 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center ring-1 ring-brand-100 flex-shrink-0">
                    <CalendarClock className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">
                      {l.title}
                    </div>
                    <div className="text-xs text-slate-500">
                      {l.scheduled_at
                        ? new Date(l.scheduled_at).toLocaleDateString()
                        : "—"}
                    </div>
                  </div>
                </div>
                <span className={`badge ring-1 ${cls}`}>
                  {l.status === "recording" && (
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 mr-1.5 animate-pulse" />
                  )}
                  {l.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
