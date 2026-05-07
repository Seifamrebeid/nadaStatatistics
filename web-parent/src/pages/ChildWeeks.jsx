import { useEffect, useState } from "react";
import api from "../services/api";
import { useChildren } from "../context/ChildContext";

const v = (x) => (Array.isArray(x) ? x[0] : x);

export default function ChildWeeks() {
  const { selected } = useChildren();
  const [weeks, setWeeks] = useState([]);
  const [classes, setClasses] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    (async () => {
      try {
        setBusy(true);
        const [wRes, cRes] = await Promise.all([
          api.get("/api/weeks"),
          api.get("/api/classes"),
        ]);
        const cls = (Array.isArray(cRes.data) ? cRes.data : [])
          .map((c) => ({
            id: v(c.id),
            name: v(c.name),
            enrolled: Array.isArray(c.enrolled_student_ids)
              ? c.enrolled_student_ids
              : c.enrolled_student_ids
              ? [c.enrolled_student_ids]
              : [],
          }))
          .filter((c) => c.enrolled.includes(selected.id));
        const classIds = new Set(cls.map((c) => c.id));
        const ws = (Array.isArray(wRes.data) ? wRes.data : [])
          .map((w) => ({
            id: v(w.id),
            class_id: v(w.class_id),
            week_number: v(w.week_number),
            title: v(w.title),
          }))
          .filter((w) => classIds.has(w.class_id));
        if (cancelled) return;
        setClasses(cls);
        setWeeks(ws);
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

  const classNameById = Object.fromEntries(classes.map((c) => [c.id, c.name]));
  const grouped = {};
  for (const w of weeks) {
    if (!grouped[w.class_id]) grouped[w.class_id] = [];
    grouped[w.class_id].push(w);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
          Weeks
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Weekly breakdown for {selected.name || selected.id}.
        </p>
      </div>

      {busy ? (
        <div className="card p-6 animate-pulse">
          <div className="h-4 w-32 bg-slate-200 rounded" />
        </div>
      ) : weeks.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">
          No weeks visible yet.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([cid, items]) => (
            <div key={cid} className="card p-5">
              <div className="font-semibold text-slate-900 mb-3">
                {classNameById[cid] || cid}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {items
                  .sort(
                    (a, b) =>
                      Number(a.week_number || 0) - Number(b.week_number || 0),
                  )
                  .map((w) => (
                    <div
                      key={w.id}
                      className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    >
                      <div className="font-medium text-slate-900">
                        Week {w.week_number || "?"}
                      </div>
                      {w.title && (
                        <div className="text-xs text-slate-500 truncate">
                          {w.title}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
