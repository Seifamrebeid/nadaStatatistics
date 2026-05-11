import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useChildren } from "../context/ChildContext";

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

        // Classes where child is directly enrolled
        const directSnap = await getDocs(
          query(
            collection(db, "classes"),
            where("enrolled_student_ids", "array-contains", selected.id),
          ),
        );
        const directClasses = directSnap.docs.map((d) => ({
          id: d.id,
          name: d.data().name,
          term: d.data().term,
          section: d.data().section,
          subject_id: d.data().subject_id,
        }));
        const directClassIds = new Set(directClasses.map((c) => c.id));

        // Also find classes reachable via lecture enrollment:
        // lectures where child is enrolled -> week_id -> class_id
        const lectSnap = await getDocs(
          query(
            collection(db, "lectures"),
            where("enrolled_student_ids", "array-contains", selected.id),
          ),
        );
        const weekIds = [
          ...new Set(
            lectSnap.docs
              .map((d) => d.data().week_id)
              .filter(Boolean),
          ),
        ];

        // Load weeks to get class_ids
        let viaLectureClassIds = new Set();
        if (weekIds.length > 0) {
          const weeksSnap = await getDocs(collection(db, "weeks"));
          weeksSnap.docs.forEach((w) => {
            if (weekIds.includes(w.id)) {
              viaLectureClassIds.add(w.data().class_id);
            }
          });
        }

        // Load extra classes not already in directClasses
        const extraClassIds = [...viaLectureClassIds].filter(
          (id) => !directClassIds.has(id),
        );
        const extraClasses = await Promise.all(
          extraClassIds.map(async (cid) => {
            const snap = await getDocs(
              query(collection(db, "classes"), where("__name__", "==", cid)),
            );
            if (snap.empty) return null;
            const d = snap.docs[0];
            return {
              id: d.id,
              name: d.data().name,
              term: d.data().term,
              section: d.data().section,
              subject_id: d.data().subject_id,
            };
          }),
        );

        if (!cancelled) {
          setClasses([...directClasses, ...extraClasses.filter(Boolean)]);
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
          Subjects
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Classes {selected.name || selected.id} is taking.
        </p>
      </div>

      {busy ? (
        <div className="card p-6 animate-pulse">
          <div className="h-4 w-32 bg-slate-200 rounded" />
        </div>
      ) : classes.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">
          No classes yet for this child.
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
