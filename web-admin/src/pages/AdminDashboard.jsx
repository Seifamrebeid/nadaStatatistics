import { useEffect, useState } from "react";
import api from "../services/api";
import StatCard from "../components/StatCard";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// Plumber wraps scalars as length-1 arrays; unwrap for display.
const v = (x) => (Array.isArray(x) ? x[0] : x);

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get("/api/admin/stats")
      .then((r) => setStats(r.data))
      .catch((e) => setErr(e.response?.data?.error || e.message));
  }, []);

  if (err) return <div className="text-red-600">Failed to load stats: {err}</div>;
  if (!stats) return <div className="text-slate-500">Loading…</div>;

  const sleepPct = (v(stats.sleep_rate) * 100).toFixed(1);
  const meanEng  = Number(v(stats.mean_engagement)).toFixed(2);

  // top_gestures may come back as either {gesture, n} (unboxed) or as an
  // object with named arrays. Normalise to [{gesture, n}, ...].
  const gestures = (() => {
    const g = stats.top_gestures;
    if (!g) return [];
    if (Array.isArray(g?.gesture) && Array.isArray(g?.n)) {
      return g.gesture.map((name, i) => ({ gesture: name, n: g.n[i] }));
    }
    return [];
  })();

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">System overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total students"     value={v(stats.total_students)}     accent="slate"/>
        <StatCard label="Total doctors"      value={v(stats.total_doctors)}      accent="slate"/>
        <StatCard label="Total lectures"     value={v(stats.total_lectures)}     accent="slate"/>
        <StatCard label="Observations"       value={v(stats.total_observations)} accent="slate"/>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <StatCard label="Mean engagement"
          value={meanEng}
          accent={meanEng >= 0.5 ? "green" : meanEng >= 0.3 ? "amber" : "red"}/>
        <StatCard label="Sleep rate"
          value={`${sleepPct}%`}
          accent={sleepPct < 5 ? "green" : sleepPct < 15 ? "amber" : "red"}/>
      </div>

      {gestures.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4 mt-4">
          <h2 className="font-semibold mb-3">Top gestures observed</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={gestures}>
              <XAxis dataKey="gesture" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="n" fill="#2a7ae2" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
