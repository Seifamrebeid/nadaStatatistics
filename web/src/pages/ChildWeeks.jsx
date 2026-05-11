import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useChildren } from "../context/ChildContext";

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

        // Determine which class IDs belong to this child:
        // 1. Direct class enrollment
        const directSnap = await getDocs(
          query(
            collection(db, "classes"),
            where("enrolled_student_ids", "array-contains", selected.id),
          ),
        );
        const directClassIds = new Set(directSnap.docs.map((d) => d.id));

        // 2. Via lecture enrollment: lecture -> week_id -> class_id
        const lectSnap = await getDocs(
          query(
            collection(db, "lectures"),
            where("enrolled_student_ids", "array-contains", selected.id),
          ),
        );
        const lectWeekIds = new Set(
          lectSnap.docs.map((d) => d.data().week_id).filter(Boolean),
        );

        // Load all weeks once, derive class_ids from weeks matching lectWeekIds
        const allWeeksSnap = await getDocs(collection(db, "weeks"));
        const allWeekDocs = allWeeksSnap.docs.map((d) => ({
          id: d.id,
          class_id: d.data().class_id,
          week_number: d.data().week_number,
          title: d.data().title,
        }));

        // Collect class_ids reached via lectures
        allWeekDocs.forEach((w) => {
          if (lectWeekIds.has(w.id)) directClassIds.add(w.class_id);
        });

        const myClassIds = directClassIds;

        // Filter weeks belonging to child's classes
        const myWeeks = allWeekDocs.filter((w) => myClassIds.has(w.class_id));

        // Load the class docs for display names
        const myClassDocs = directSnap.docs.map((d) => ({
          id: d.id,
          name: d.data().name,
        }));
        // Add any extra classes not in the direct snap
        const extraClassIds = [...myClassIds].filter(
          (id) => !directSnap.docs.find((d) => d.id === id),
        );
        const extraClassDocs = await Promise.all(
          extraClassIds.map(async (cid) => {
            const snap = await getDocs(
              query(collection(db, "classes"), where("__name__", "==", cid)),
            );
            if (snap.empty) return { id: cid, name: cid };
            return { id: snap.docs[0].id, name: snap.docs[0].data().name };
          }),
        );

        if (!cancelled) {
          setClasses([...myClassDocs, ...extraClassDocs]);
          setWeeks(myWeeks);
        }
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
