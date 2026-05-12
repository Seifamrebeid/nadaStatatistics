import { useEffect, useMemo, useState } from "react";
import { Trophy, Crown, Medal, Sparkles, Flame, Star, RefreshCw, Search } from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { buildLeaderboard } from "../lib/gamification";

async function fetchStudentRaw(studentId) {
  const [attendance, emotions, grades] = await Promise.all([
    getDocs(query(collection(db, "attendance"), where("student_id", "==", studentId))).then((s) => s.docs.map((d) => d.data())),
    getDocs(query(collection(db, "emotions"),   where("student_id", "==", studentId))).then((s) => s.docs.map((d) => d.data())),
    getDocs(query(collection(db, "grades"),     where("student_id", "==", studentId))).then((s) => s.docs.map((d) => d.data())),
  ]);
  return { attendance, emotions, grades };
}

export default function AdminLeaderboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true); setErr(null);
    try {
      const studentsSnap = await getDocs(collection(db, "students"));
      const students = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const byStudent = {};
      const BATCH = 8;
      for (let i = 0; i < students.length; i += BATCH) {
        const slice = students.slice(i, i + BATCH);
        const results = await Promise.all(slice.map((s) => fetchStudentRaw(s.id)));
        slice.forEach((s, k) => { byStudent[s.id] = results[k]; });
      }
      const board = buildLeaderboard(byStudent);
      setRows(board.map((r) => ({
        ...r,
        name: students.find((s) => s.id === r.studentId)?.name || r.studentId,
        email: students.find((s) => s.id === r.studentId)?.email || "",
      })));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.name || "").toLowerCase().includes(q) ||
      (r.email || "").toLowerCase().includes(q) ||
      r.studentId.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const top3 = useMemo(() => rows.slice(0, 3), [rows]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
              <Trophy className="h-6 w-6 text-amber-500" />
              Global Leaderboard
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              All students ranked by XP. {rows.length ? `${rows.length} student${rows.length === 1 ? "" : "s"}.` : ""}
            </p>
          </div>
          <button onClick={load} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        {err && <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{err}</div>}
      </div>

      <Top3Podium entries={top3} />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or ID..."
            className="flex-1 bg-transparent text-sm placeholder:text-slate-400 outline-none"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 w-16">Rank</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3 text-center">Level</th>
                <th className="px-4 py-3 text-center">XP</th>
                <th className="px-4 py-3 text-center">Streak</th>
                <th className="px-4 py-3 text-center">Badges</th>
                <th className="px-4 py-3 text-center">Perfect weeks</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.studentId} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-bold text-slate-900">#{r.rank}</td>
                  <td className="px-4 py-3">
                    <div className="text-slate-900">{r.name}</div>
                    <div className="text-xs text-slate-500">{r.email || r.studentId}</div>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-700">{r.stats.level}</td>
                  <td className="px-4 py-3 text-center font-semibold text-slate-900">{r.stats.xp}</td>
                  <td className="px-4 py-3 text-center text-slate-700">
                    <span className="inline-flex items-center gap-1">
                      <Flame className="h-3.5 w-3.5 text-orange-500" />
                      {r.stats.streakDays}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-700">
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 text-amber-500" />
                      {r.stats.badges.length}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-700">{r.stats.perfectWeeks}</td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">No students to rank.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Top3Podium({ entries }) {
  const [first, second, third] = entries;
  const item = (entry, rank) => {
    if (!entry) return null;
    const tones = {
      1: { ring: "ring-amber-400 bg-gradient-to-br from-amber-50 to-amber-100", icon: <Crown className="h-6 w-6 text-amber-500" />, h: "h-32" },
      2: { ring: "ring-slate-300 bg-gradient-to-br from-slate-50 to-slate-100", icon: <Medal className="h-6 w-6 text-slate-400" />, h: "h-24" },
      3: { ring: "ring-orange-300 bg-gradient-to-br from-orange-50 to-orange-100", icon: <Medal className="h-6 w-6 text-orange-400" />, h: "h-20" },
    };
    const t = tones[rank];
    return (
      <div className="flex flex-1 flex-col items-center">
        <div className={`mb-2 rounded-full ring-4 ${t.ring} h-16 w-16 flex items-center justify-center text-xl font-bold text-slate-700`}>
          {(entry.name || "?").slice(0, 2).toUpperCase()}
        </div>
        <div className="text-sm font-semibold text-slate-900 truncate max-w-[10rem]">{entry.name || "—"}</div>
        <div className="text-xs text-slate-500">{entry.stats.xp} XP</div>
        <div className={`mt-2 w-full rounded-t-xl border-x border-t border-slate-200 ${t.h} flex items-start justify-center pt-2`}>
          {t.icon}
        </div>
      </div>
    );
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Sparkles className="h-4 w-4 text-amber-500" />
        Top 3
      </div>
      {entries.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500">Not enough data to rank yet.</div>
      ) : (
        <div className="flex items-end gap-3">
          {item(second, 2)}
          {item(first, 1)}
          {item(third, 3)}
        </div>
      )}
    </div>
  );
}
