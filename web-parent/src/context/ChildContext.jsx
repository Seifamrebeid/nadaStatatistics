import { createContext, useContext, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";

const ChildContext = createContext(null);
const STORAGE_KEY = "web-parent.selectedChildId";

export function ChildProvider({ children }) {
  const { profile } = useAuth();
  const [list, setList] = useState([]);
  const [selectedId, setSelectedId] = useState(
    () => localStorage.getItem(STORAGE_KEY) || null,
  );
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!profile?.linked_id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // 1. Get parent doc to find linked_student_ids
        const parentDoc = await getDoc(doc(db, "parents", profile.linked_id));
        const linkedIds = parentDoc.data()?.linked_student_ids || [];

        // 2. Load each child's student doc
        const childDocs = await Promise.all(
          linkedIds.map(async (sid) => {
            const snap = await getDoc(doc(db, "students", sid));
            return snap.exists() ? { id: snap.id, ...snap.data() } : null;
          }),
        );
        const items = childDocs.filter(Boolean);

        if (cancelled) return;
        setList(items);
        if (items.length > 0) {
          const stillThere = items.find((s) => s.id === selectedId);
          if (!stillThere) {
            setSelectedId(items[0].id);
            localStorage.setItem(STORAGE_KEY, items[0].id);
          }
        }
      } catch (e) {
        if (!cancelled) setErr(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.linked_id]);

  function pick(id) {
    setSelectedId(id);
    localStorage.setItem(STORAGE_KEY, id);
  }

  const selected = list.find((s) => s.id === selectedId) || null;

  return (
    <ChildContext.Provider
      value={{ children: list, selected, selectedId, setSelected: pick, loading, err }}
    >
      {children}
    </ChildContext.Provider>
  );
}

export function useChildren() {
  const ctx = useContext(ChildContext);
  if (!ctx) throw new Error("useChildren must be used within ChildProvider");
  return ctx;
}
