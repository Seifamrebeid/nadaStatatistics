import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import StatCard from "../components/StatCard";

const v = (x) => (Array.isArray(x) ? x[0] : x);

export default function StudentDashboard() {
  const [lectures, setLectures] = useState([]);
  const [engagementRows, setEngagementRows] = useState([]);
  const [sleepRows, setSleepRows] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get("/api/lectures"),
      api.get("/api/analytics/engagement"),
      api.get("/api/analytics/sleep"),
    ])
      .then(([l, e, s]) => {
        setLectures((Array.isArray(l.data) ? l.data : []).map(normalise));
        setEngagementRows(columnsToRows(e.data));
        setSleepRows(columnsToRows(s.data));
      })
      .catch((e) => setErr(e.response?.data?.error || e.message));
  }, []);

  const stats = useMemo(() => {
    const meanEng = average(
      engagementRows.map((r) => Number(r.mean_engagement)),
    );
    const meanSleep = average(sleepRows.map((r) => Number(r.sleep_rate)));
    return {
      lectureCount: lectures.length,
      finished: lectures.filter((l) => v(l.status) === "finished").length,
      meanEngagement: meanEng,
      sleepRate: meanSleep,
    };
  }, [lectures, engagementRows, sleepRows]);

  if (err)
    return <div className="text-red-600">Failed to load dashboard: {err}</div>;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">My dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Enrolled lectures"
          value={stats.lectureCount}
          accent="slate"
        />
        <StatCard
          label="Finished lectures"
          value={stats.finished}
          accent="slate"
        />
        <StatCard
          label="Mean engagement"
          value={stats.meanEngagement.toFixed(2)}
          accent={
            stats.meanEngagement >= 0.5
              ? "green"
              : stats.meanEngagement >= 0.3
                ? "amber"
                : "red"
          }
        />
        <StatCard
          label="Sleep rate"
          value={`${(stats.sleepRate * 100).toFixed(1)}%`}
          accent={
            stats.sleepRate < 0.05
              ? "green"
              : stats.sleepRate < 0.15
                ? "amber"
                : "red"
          }
        />
      </div>

      <div className="bg-white rounded-lg shadow p-4 mt-4">
        <h2 className="font-semibold mb-2">Recent enrolled lectures</h2>
        <ul className="divide-y">
          {lectures.slice(0, 6).map((l) => (
            <li key={l.id} className="py-2 text-sm flex justify-between">
              <span>{l.title || l.id}</span>
              <span className="text-slate-500">{l.status || "scheduled"}</span>
            </li>
          ))}
          {lectures.length === 0 && (
            <li className="py-2 text-sm text-slate-500">
              No enrolled lectures yet.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function normalise(row) {
  const out = {};
  for (const [k, val] of Object.entries(row || {})) out[k] = v(val);
  return out;
}

function columnsToRows(obj) {
  if (!obj) return [];
  const keys = Object.keys(obj).filter((k) => Array.isArray(obj[k]));
  if (keys.length === 0) return [];
  const n = obj[keys[0]].length;
  return Array.from({ length: n }, (_, i) => {
    const row = {};
    for (const k of keys) row[k] = obj[k][i];
    return row;
  });
}

function average(values) {
  const nums = values.filter((n) => Number.isFinite(n));
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
