import { useEffect, useState } from "react";
import api from "../services/api";
import StatCard from "../components/StatCard";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// Plumber wraps scalars as length-1 arrays; unwrap for display.
const v = (x) => (Array.isArray(x) ? x[0] : x);

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [lectureSeries, setLectureSeries] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get("/api/lectures"),
      api.get("/api/analytics/engagement"),
      api.get("/api/analytics/sleep"),
      api.get("/api/notifications"),
    ])
      .then(([lecturesRes, engagementRes, sleepRes, notificationsRes]) => {
        const lectures = Array.isArray(lecturesRes.data)
          ? lecturesRes.data
          : [];
        const engagement = columnsToRows(engagementRes.data);
        const sleep = columnsToRows(sleepRes.data);
        const notifications = Array.isArray(notificationsRes.data)
          ? notificationsRes.data
          : [];

        const engagementMean = average(
          engagement.map((r) => Number(r.mean_engagement)),
        );
        const sleepRate = average(sleep.map((r) => Number(r.sleep_rate)));

        setStats({
          total_lectures: lectures.length,
          finished_lectures: lectures.filter((l) => v(l.status) === "finished")
            .length,
          scheduled_lectures: lectures.filter(
            (l) => v(l.status) === "scheduled",
          ).length,
          notifications_sent: notifications.length,
          mean_engagement: engagementMean,
          sleep_rate: sleepRate,
        });
        setLectureSeries(engagement);
      })
      .catch((e) => setErr(e.response?.data?.error || e.message));
  }, []);

  if (err)
    return <div className="text-red-600">Failed to load stats: {err}</div>;
  if (!stats) return <div className="text-slate-500">Loading…</div>;

  const sleepPct = (Number(v(stats.sleep_rate)) * 100).toFixed(1);
  const meanEng = Number(v(stats.mean_engagement)).toFixed(2);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Doctor overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="My lectures"
          value={v(stats.total_lectures)}
          accent="slate"
        />
        <StatCard
          label="Finished lectures"
          value={v(stats.finished_lectures)}
          accent="slate"
        />
        <StatCard
          label="Scheduled lectures"
          value={v(stats.scheduled_lectures)}
          accent="slate"
        />
        <StatCard
          label="Notifications sent"
          value={v(stats.notifications_sent)}
          accent="slate"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <StatCard
          label="Mean engagement"
          value={meanEng}
          accent={meanEng >= 0.5 ? "green" : meanEng >= 0.3 ? "amber" : "red"}
        />
        <StatCard
          label="Sleep rate"
          value={`${sleepPct}%`}
          accent={sleepPct < 5 ? "green" : sleepPct < 15 ? "amber" : "red"}
        />
      </div>

      {lectureSeries.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4 mt-4">
          <h2 className="font-semibold mb-3">Engagement by lecture</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={lectureSeries}>
              <XAxis dataKey="lecture_id" />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Bar dataKey="mean_engagement" fill="#2a7ae2" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
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
