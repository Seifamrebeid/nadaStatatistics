import { useEffect, useState } from "react";
import api from "../services/api";
import { useChildren } from "../context/ChildContext";

const v = (x) => (Array.isArray(x) ? x[0] : x);
const flatIds = (x) => {
  if (!Array.isArray(x)) return x ? [x] : [];
  if (x.length > 0 && Array.isArray(x[0])) return x[0];
  return x;
};

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
        const [cRes, wRes, lRes] = await Promise.all([
          api.get("/api/classes"),
          api.get("/api/weeks"),
          api.get("/api/lectures"),
        ]);
        const allClasses = (Array.isArray(cRes.data) ? cRes.data : []).map((c) => ({
          id: v(c.id),
          name: v(c.name),
          enrolled: flatIds(c.enrolled_student_ids),
        }));
        const allWeeks = (Array.isArray(wRes.data) ? wRes.data : []).map((w) => ({
          id: v(w.id),
          class_id: v(w.class_id),
          week_number: v(w.week_number),
          title: v(w.title),
        }));
        const lectures = (Array.isArray(lRes.data) ? lRes.data : []).map((l) => ({
          week_id: v(l.week_id),
          enrolled: flatIds(l.enrolled_student_ids),
        }));

        // Reachable classes for this kid: direct enrollment OR via a lecture
        // (lecture -> week -> class) they're enrolled in.
        const weekToClass = Object.fromEntries(
          allWeeks.map((w) => [w.id, w.class_id]),
        );
        const reachableViaLectures = new Set(
          lectures
            .filter((l) => l.enrolled.includes(selected.id))
            .map((l) => weekToClass[l.week_id])
            .filter(Boolean),
        );
        const myClassIds = new Set(
          allClasses
            .filter(
              (c) =>
                c.enrolled.includes(selected.id) || reachableViaLectures.has(c.id),
            )
            .map((c) => c.id),
        );

        if (cancelled) return;
        setClasses(allClasses.filter((c) => myClassIds.has(c.id)));
        setWeeks(allWeeks.filter((w) => myClassIds.has(w.class_id)));
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
          No weeks yet for this child.
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
