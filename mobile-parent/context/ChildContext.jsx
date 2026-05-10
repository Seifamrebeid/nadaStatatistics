/**
 * ChildContext — mirrors the web-parent ChildContext.
 *
 * Resolves the signed-in parent's linked children:
 *   1. Read users/{uid} → linked_id (the parent doc id)
 *   2. Read parents/{linked_id} → linked_student_ids array
 *   3. Load each students/{sid} doc
 * Persists the currently-selected child via AsyncStorage so the choice survives
 * navigation and app reloads.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

const ChildContext = createContext(null);
const STORAGE_KEY = "mobile-parent.selectedChildId";

export function ChildProvider({ children }) {
  const [parentId, setParentId] = useState(null);
  const [list, setList] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Restore last-picked child id on mount.
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) setSelectedId(stored);
      } catch {
        // ignore
      }
    })();
  }, []);

  // Resolve parent id from auth.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setParentId(null);
        setList([]);
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        setParentId(snap.exists() ? snap.data().linked_id || null : null);
      } catch (e) {
        setErr(e.message);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // Load children when parentId resolves.
  const load = useCallback(async () => {
    if (!parentId) {
      setList([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const parentDoc = await getDoc(doc(db, "parents", parentId));
      const linkedIds = parentDoc.exists() ? (parentDoc.data().linked_student_ids || []) : [];
      const childDocs = await Promise.all(
        linkedIds.map(async (sid) => {
          const s = await getDoc(doc(db, "students", sid));
          return s.exists() ? { id: s.id, ...s.data() } : null;
        }),
      );
      const items = childDocs.filter(Boolean);
      setList(items);

      // Snap selection to first child if previous selection is gone.
      const stillThere = selectedId && items.find((s) => s.id === selectedId);
      if (!stillThere && items.length > 0) {
        setSelectedId(items[0].id);
        try { await AsyncStorage.setItem(STORAGE_KEY, items[0].id); } catch {}
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [parentId, selectedId]);

  useEffect(() => { load(); }, [parentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = useCallback(async (id) => {
    setSelectedId(id);
    try { await AsyncStorage.setItem(STORAGE_KEY, id); } catch {}
  }, []);

  const value = useMemo(() => {
    const selected = list.find((s) => s.id === selectedId) || list[0] || null;
    return {
      children: list,
      selected,
      selectedId: selected ? selected.id : null,
      setSelected: pick,
      reload: load,
      loading,
      err,
    };
  }, [list, selectedId, loading, err, pick, load]);

  return <ChildContext.Provider value={value}>{children}</ChildContext.Provider>;
}

export function useChildren() {
  const ctx = useContext(ChildContext);
  if (!ctx) throw new Error("useChildren must be used within ChildProvider");
  return ctx;
}
