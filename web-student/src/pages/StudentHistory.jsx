import { useEffect, useState } from "react";
import api from "../services/api";
import StatCard from "../components/StatCard";
import { CalendarCheck, Smile, Users } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const v = (x) => (Array.isArray(x) ? x[0] : x);

export default function StudentHistory() {
  const [historyData, setHistoryData] = useState([]);
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        // Get current user
        const me = await api.get("/api/me");
        const studentId = v(me.data.linked_id);
        if (!studentId) {
          setStats({ averageEngagement: 0, lectureCount: 0, classAverage: 0 });
          return;
        }

        const compRes = await api.get(
          `/api/analytics/student/${studentId}/comparison`,
        );
        const comparison = compRes.data;

        const perLecture = Array.isArray(comparison?.per_lecture)
          ? comparison.per_lecture
          : [];
        if (perLecture.length > 0) {
          const chartData = perLecture.map((item, idx) => ({
            name: `Lecture ${idx + 1}`,
            lecture_id: v(item.lecture_id),
            self: Number(v(item.self) || 0),
            class_mean: Number(v(item.class_mean) || 0),
          }));
          setHistoryData(chartData);
        }

        setStats({
          averageEngagement: Number(v(comparison?.self_mean) ?? 0).toFixed(2),
          lectureCount: perLecture.length,
          classAverage: Number(v(comparison?.class_mean) ?? 0).toFixed(2),
        });
      } catch (error) {
        console.error("Error fetching engagement history:", error);
        setErr(error.response?.data?.error || error.message);
      }
    };

    fetchHistory();
  }, []);

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
          Engagement History
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Your engagement across past lectures vs. the class average.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard label="Lectures Attended" value={stats.lectureCount}      accent="brand" icon={CalendarCheck} />
          <StatCard label="Your Average"      value={`${stats.averageEngagement}%`} accent="green" icon={Smile} />
          <StatCard label="Class Average"     value={`${stats.classAverage}%`}      accent="slate" icon={Users} />
        </div>
      )}

      {historyData.length > 0 && (
        <div className="card p-6 mt-6">
          <h2 className="font-semibold text-slate-900">Engagement over time</h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">
            Per-lecture comparison against the class mean.
          </p>
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={historyData} margin={{ top: 5, right: 16, bottom: 5, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value) => Number(value).toFixed(2)}
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="self"       stroke="#0ea5e9" strokeWidth={2.5} name="Your Engagement" dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="class_mean" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" name="Class Average" dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {historyData.length === 0 && !err && (
        <div className="card p-10 mt-6 text-center text-sm text-slate-500">
          No lecture history yet.
        </div>
      )}
    </div>
  );
}
