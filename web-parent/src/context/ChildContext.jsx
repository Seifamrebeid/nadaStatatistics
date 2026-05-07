import { createContext, useContext, useEffect, useState } from "react";
import api from "../services/api";

const v = (x) => (Array.isArray(x) ? x[0] : x);
const ChildContext = createContext(null);
const STORAGE_KEY = "web-parent.selectedChildId";

export function ChildProvider({ children }) {
  const [list, setList] = useState([]);
  const [selectedId, setSelectedId] = useState(
    () => localStorage.getItem(STORAGE_KEY) || null,
  );
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/api/students");
        const items = (Array.isArray(data) ? data : []).map((s) => ({
          id: v(s.id),
          name: v(s.name),
          email: v(s.email),
        }));
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
        if (!cancelled) setErr(e.response?.data?.error || e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
