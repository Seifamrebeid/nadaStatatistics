import { useEffect, useState } from "react";
import api from "../services/api";
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
        const userId = v(me.data.uid);

        // Get student's comparison data (includes per-lecture data)
        const compRes = await api.get(
          `/api/analytics/student/${userId}/comparison`,
        );
        const comparison = compRes.data;

        if (comparison?.per_lecture) {
          const chartData = comparison.per_lecture.map((item, idx) => ({
            name: `Lecture ${idx + 1}`,
            lecture_id: item.lecture_id,
            self: item.self || 0,
            class_mean: item.class_mean || 0,
          }));
          setHistoryData(chartData);
        }

        setStats({
          averageEngagement: comparison?.self_mean?.toFixed(2) || 0,
          lectureCount: comparison?.per_lecture?.length || 0,
          classAverage: comparison?.class_mean?.toFixed(2) || 0,
        });
      } catch (error) {
        console.error("Error fetching engagement history:", error);
        setErr(error.response?.data?.error || error.message);
      }
    };

    fetchHistory();
  }, []);

  if (err) {
    return <div className="text-red-600 p-4">Error: {err}</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Engagement History</h1>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-gray-600 text-sm">Lectures Attended</div>
            <div className="text-3xl font-bold text-blue-600">
              {stats.lectureCount}
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-gray-600 text-sm">Average Engagement</div>
            <div className="text-3xl font-bold text-green-600">
              {stats.averageEngagement}%
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-gray-600 text-sm">Class Average</div>
            <div className="text-3xl font-bold text-purple-600">
              {stats.classAverage}%
            </div>
          </div>
        </div>
      )}

      {historyData.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Engagement Over Time</h2>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={historyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis
                yAxisId="left"
                label={{
                  value: "Engagement Score",
                  angle: -90,
                  position: "insideLeft",
                }}
              />
              <Tooltip
                formatter={(value) => value?.toFixed(2) || 0}
                labelFormatter={(label) => `${label}`}
              />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="self"
                stroke="#3b82f6"
                name="Your Engagement"
                connectNulls
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="class_mean"
                stroke="#9ca3af"
                strokeDasharray="5 5"
                name="Class Average"
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {historyData.length === 0 && !err && (
        <div className="bg-white p-6 rounded-lg shadow text-center text-gray-500">
          No lecture history yet.
        </div>
      )}
    </div>
  );
}
