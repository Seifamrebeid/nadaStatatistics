import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { X, Search, Users, MessageCircle } from "lucide-react";
import { db } from "../firebase";
import { getOrCreateDirect, createGroup } from "../lib/chat";

// Modal that lets the current user pick one or many contacts.
// - 1:1 → pick a single contact → getOrCreateDirect → onCreated(convId)
// - Group → pick multiple → createGroup → onCreated(convId)
//
// `myProfile` = { uid, name, email, role }
// `allowGroups` defaults to true (doctor/admin); set false for student/parent.

export default function NewChatModal({ open, onClose, myProfile, allowGroups = true, onCreated }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [mode, setMode] = useState("direct");          // "direct" | "group"
  const [groupTitle, setGroupTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setSearch("");
    setRoleFilter("");
    setMode("direct");
    setGroupTitle("");
    setErr(null);

    (async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, "users"));
        const list = snap.docs.map((d) => {
          const data = d.data() || {};
          // Resolve a display name by looking up the linked entity later if needed.
          return { uid: d.id, role: data.role, linked_id: data.linked_id };
        });
        // Enrich with names from students/doctors/admins/parents collections.
        const [students, doctors, admins, parents] = await Promise.all([
          getDocs(collection(db, "students")),
          getDocs(collection(db, "doctors")),
          getDocs(collection(db, "admins")),
          getDocs(collection(db, "parents")),
        ]);
        const byId = {};
        for (const c of [students, doctors, admins, parents]) {
          c.docs.forEach((doc) => {
            const d = doc.data() || {};
            byId[doc.id] = { name: d.name, email: d.email };
          });
        }
        const enriched = list
          .filter((u) => u.uid !== myProfile.uid)
          .map((u) => ({
            ...u,
            name:  byId[u.linked_id]?.name  || "—",
            email: byId[u.linked_id]?.email || "",
          }))
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setUsers(enriched);
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, myProfile?.uid]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (!term) return true;
      return (u.name || "").toLowerCase().includes(term) ||
             (u.email || "").toLowerCase().includes(term);
    });
  }, [users, search, roleFilter]);

  function toggle(uid) {
    const next = new Set(selected);
    if (next.has(uid)) next.delete(uid); else next.add(uid);
    if (mode === "direct" && next.size > 1) {
      // Keep only the most recent pick in direct mode
      const arr = [...next];
      setSelected(new Set([arr[arr.length - 1]]));
    } else {
      setSelected(next);
    }
  }

  async function startChat() {
    setBusy(true); setErr(null);
    try {
      const picks = [...selected];
      if (picks.length === 0) throw new Error("Pick at least one contact.");
      const myMeta = {
        [myProfile.uid]: { name: myProfile.name || myProfile.email, role: myProfile.role, email: myProfile.email },
      };
      if (mode === "direct" || picks.length === 1) {
        const other = users.find((u) => u.uid === picks[0]);
        const meta = { ...myMeta,
          [other.uid]: { name: other.name, role: other.role, email: other.email } };
        const id = await getOrCreateDirect(myProfile.uid, other.uid, meta);
        onCreated?.(id);
      } else {
        const meta = picks.reduce((acc, uid) => {
          const u = users.find((x) => x.uid === uid);
          if (u) acc[uid] = { name: u.name, role: u.role, email: u.email };
          return acc;
        }, { ...myMeta });
        const title = groupTitle.trim() || `Group with ${picks.length} people`;
        const id = await createGroup(myProfile.uid, picks, title, meta);
        onCreated?.(id);
      }
      onClose?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Start a new chat</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        {allowGroups && (
          <div className="px-5 pt-3 flex gap-2">
            <button
              onClick={() => setMode("direct")}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold border transition ${
                mode === "direct" ? "bg-brand-600 text-white border-brand-600" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <MessageCircle className="h-4 w-4" /> 1:1
            </button>
            <button
              onClick={() => setMode("group")}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold border transition ${
                mode === "group" ? "bg-brand-600 text-white border-brand-600" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <Users className="h-4 w-4" /> Group
            </button>
          </div>
        )}

        <div className="px-5 pt-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
            <input
              autoFocus
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-brand-500"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white"
          >
            <option value="">All roles</option>
            <option value="admin">Admin</option>
            <option value="doctor">Doctor</option>
            <option value="student">Student</option>
            <option value="parent">Parent</option>
          </select>
        </div>

        {mode === "group" && (
          <div className="px-5 pt-2">
            <input
              type="text"
              value={groupTitle}
              onChange={(e) => setGroupTitle(e.target.value)}
              placeholder="Group name (optional)"
              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-brand-500"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading && <div className="px-3 py-4 text-sm text-slate-400">Loading users…</div>}
          {!loading && filtered.length === 0 && (
            <div className="px-3 py-4 text-sm text-slate-400">No matching users.</div>
          )}
          <ul className="space-y-1">
            {filtered.map((u) => {
              const checked = selected.has(u.uid);
              return (
                <li key={u.uid}>
                  <button
                    onClick={() => toggle(u.uid)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition ${
                      checked ? "bg-brand-50 ring-1 ring-brand-300" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                      checked ? "bg-brand-600" : "bg-slate-400"
                    }`}>
                      {(u.name || u.email || "?").split(/[\s@.]/).filter(Boolean).map(s => s[0]).join("").slice(0,2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{u.name || u.email}</div>
                      <div className="text-xs text-slate-500 truncate">{u.role} · {u.email}</div>
                    </div>
                    {checked && (
                      <span className="text-xs font-semibold text-brand-700">picked</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {err && (
          <div className="mx-5 mb-2 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-sm">{err}</div>
        )}

        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {selected.size} picked
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm">
              Cancel
            </button>
            <button
              onClick={startChat}
              disabled={busy || selected.size === 0}
              className="px-4 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {busy ? "Starting…" : (mode === "group" ? "Create group" : "Start chat")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
