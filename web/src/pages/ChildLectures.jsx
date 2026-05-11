import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useChildren } from "../context/ChildContext";
import { CalendarClock } from "lucide-react";

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

        // Lectures where child is directly enrolled
        const directSnap = await getDocs(
          query(
            collection(db, "lectures"),
            where("enrolled_student_ids", "array-contains", selected.id),
          ),
        );
        const directLectures = directSnap.docs.map((d) => ({
          id: d.id,
          title: d.data().title,
          status: d.data().status || "scheduled",
          scheduled_at: d.data().scheduled_at || d.data().date,
          week_id: d.data().week_id,
        }));

        // Also find lectures via class enrollment:
        // classes where child is enrolled -> weeks in those classes -> lectures in those weeks
        const classSnap = await getDocs(
          query(
            collection(db, "classes"),
            where("enrolled_student_ids", "array-contains", selected.id),
          ),
        );
        const myClassIds = new Set(classSnap.docs.map((d) => d.id));

        // Get all weeks for those classes
        const weeksSnap = await getDocs(collection(db, "weeks"));
        const myWeekIds = new Set(
          weeksSnap.docs
            .filter((w) => myClassIds.has(w.data().class_id))
            .map((w) => w.id),
        );

        // Get all lectures; filter those belonging to my weeks (and not already in direct list)
        const directIds = new Set(directLectures.map((l) => l.id));
        const allLectSnap = await getDocs(collection(db, "lectures"));
        const viaClassLectures = allLectSnap.docs
          .filter((d) => !directIds.has(d.id) && myWeekIds.has(d.data().week_id))
          .map((d) => ({
            id: d.id,
            title: d.data().title,
            status: d.data().status || "scheduled",
            scheduled_at: d.data().scheduled_at || d.data().date,
            week_id: d.data().week_id,
          }));

        if (!cancelled) setLectures([...directLectures, ...viaClassLectures]);
      } catch (e) {
        if (!cancelled) setErr(e.message);
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
