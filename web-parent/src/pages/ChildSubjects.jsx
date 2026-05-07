import { useEffect, useState } from "react";
import api from "../services/api";
import { useChildren } from "../context/ChildContext";

const v = (x) => (Array.isArray(x) ? x[0] : x);

export default function ChildSubjects() {
  const { selected } = useChildren();
  const [classes, setClasses] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    (async () => {
      try {
        setBusy(true);
        const { data } = await api.get("/api/classes");
        const list = (Array.isArray(data) ? data : [])
          .map((c) => ({
            id: v(c.id),
            name: v(c.name),
            term: v(c.term),
            section: v(c.section),
            subject_id: v(c.subject_id),
            enrolled: Array.isArray(c.enrolled_student_ids)
              ? c.enrolled_student_ids
              : c.enrolled_student_ids
              ? [c.enrolled_student_ids]
              : [],
          }))
          .filter((c) => c.enrolled.includes(selected.id));
        if (!cancelled) setClasses(list);
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
          Subjects
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Classes {selected.name || selected.id} is enrolled in.
        </p>
      </div>

      {busy ? (
        <div className="card p-6 animate-pulse">
          <div className="h-4 w-32 bg-slate-200 rounded" />
        </div>
      ) : classes.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">
          Not enrolled in any classes.
        </div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {classes.map((c) => (
            <div key={c.id} className="px-5 py-4">
              <div className="font-medium text-slate-900">{c.name}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {c.section ? `Section ${c.section} · ` : ""}
                {c.term || "—"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
