import { useEffect, useState } from "react";
import api from "../services/api";
import StatCard from "../components/StatCard";
import {
  GraduationCap,
  Stethoscope,
  Presentation,
  Activity,
  Smile,
  Moon,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

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

  if (err) {
    return (
      <div className="card p-6 text-red-700 bg-red-50 border-red-200">
        Failed to load stats: {err}
      </div>
    );
  }
  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5 animate-pulse">
            <div className="h-3 w-20 bg-slate-200 rounded" />
            <div className="h-8 w-24 bg-slate-200 rounded mt-3" />
          </div>
        ))}
      </div>
    );
  }

  const sleepPct = (v(stats.sleep_rate) * 100).toFixed(1);
  const meanEng  = Number(v(stats.mean_engagement)).toFixed(2);

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
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">System overview</h1>
        <p className="mt-1 text-sm text-slate-500">
          Snapshot of platform-wide activity and engagement signals.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total students"  value={v(stats.total_students)}     accent="brand" icon={GraduationCap} />
        <StatCard label="Total doctors"   value={v(stats.total_doctors)}      accent="slate" icon={Stethoscope} />
        <StatCard label="Total lectures"  value={v(stats.total_lectures)}     accent="slate" icon={Presentation} />
        <StatCard label="Observations"    value={v(stats.total_observations)} accent="slate" icon={Activity} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <StatCard
          label="Mean engagement"
          value={meanEng}
          accent={meanEng >= 0.5 ? "green" : meanEng >= 0.3 ? "amber" : "red"}
          icon={Smile}
          hint={meanEng >= 0.5 ? "Healthy" : meanEng >= 0.3 ? "Watch" : "Needs attention"}
        />
        <StatCard
          label="Sleep rate"
          value={`${sleepPct}%`}
          accent={sleepPct < 5 ? "green" : sleepPct < 15 ? "amber" : "red"}
          icon={Moon}
          hint={sleepPct < 5 ? "Low" : sleepPct < 15 ? "Moderate" : "Elevated"}
        />
      </div>

      {gestures.length > 0 && (
        <div className="card p-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-900">Top gestures observed</h2>
              <p className="text-xs text-slate-500 mt-0.5">Aggregated across all sessions</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={gestures} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="gesture" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "#f1f5f9" }}
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
              />
              <Bar dataKey="n" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
