import { useEffect, useState } from "react";
import api from "../services/api";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const v = (x) => (Array.isArray(x) ? x[0] : x);

const normalise = (row) => {
  const out = {};
  for (const [k, val] of Object.entries(row || {})) out[k] = v(val);
  return out;
};

export default function DoctorAnalytics() {
  const [lectures, setLectures] = useState([]);
  const [selectedLecture, setSelectedLecture] = useState(null);
  const [engagementData, setEngagementData] = useState([]);
  const [sleepData, setSleepData] = useState([]);
  const [gestureData, setGestureData] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const fetchLectures = async () => {
      try {
        const res = await api.get("/api/lectures");
        const lectureList = (Array.isArray(res.data) ? res.data : []).map(
          normalise,
        );
        setLectures(lectureList);
        if (lectureList.length > 0) {
          setSelectedLecture(lectureList[0].id);
        }
      } catch (error) {
        console.error("Error fetching lectures:", error);
        setErr(error.response?.data?.error || error.message);
      }
    };

    fetchLectures();
  }, []);

  useEffect(() => {
    if (!selectedLecture) return;

    const fetchAnalytics = async () => {
      try {
        const { data } = await api.get("/api/emotions", {
          params: { lecture_id: selectedLecture },
        });
        const rows = (Array.isArray(data) ? data : []).map(normalise);

        const byTime = new Map();
        const bySleepReason = new Map();
        const byGesture = new Map();

        for (const row of rows) {
          const ts = row.timestamp
            ? new Date(row.timestamp).toLocaleTimeString()
            : "unknown";
          const current = byTime.get(ts) || { timestamp: ts, total: 0, sum: 0 };
          current.total += 1;
          current.sum += Number(row.engagement_score || 0);
          byTime.set(ts, current);

          const reason =
            row.state === "sleeping" ? row.sleep_reason || "sleeping" : "awake";
          bySleepReason.set(reason, (bySleepReason.get(reason) || 0) + 1);

          const g = row.gesture || "none";
          if (g !== "none") byGesture.set(g, (byGesture.get(g) || 0) + 1);
        }

        setEngagementData(
          Array.from(byTime.values())
            .map((r) => ({
              timestamp: r.timestamp,
              engagement_score: Number((r.sum / r.total).toFixed(3)),
            }))
            .slice(-25),
        );
        setSleepData(
          Array.from(bySleepReason.entries()).map(([sleep_reason, count]) => ({
            sleep_reason,
            count,
          })),
        );
        setGestureData(
          Array.from(byGesture.entries()).map(([gesture, count]) => ({
            gesture,
            count,
          })),
        );
      } catch (error) {
        console.error("Error fetching analytics:", error);
        setErr(error.response?.data?.error || error.message);
      }
    };

    fetchAnalytics();
  }, [selectedLecture]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Analytics</h1>

      {err && <div className="text-red-600 p-4 bg-red-50 rounded">{err}</div>}

      <div>
        <label className="block text-sm font-medium mb-2">
          Select Lecture:
        </label>
        <select
          value={selectedLecture || ""}
          onChange={(e) => setSelectedLecture(e.target.value)}
          className="border rounded px-4 py-2"
        >
          {lectures.map((lec) => (
            <option key={lec.id} value={lec.id}>
              {lec.title || lec.id} (
              {lec.scheduled_at
                ? new Date(lec.scheduled_at).toLocaleDateString()
                : "n/a"}
              )
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {engagementData.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">Engagement Over Time</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={engagementData}>
                <XAxis dataKey="timestamp" />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="engagement_score"
                  stroke="#3b82f6"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {sleepData.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">Sleep Rate by Reason</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sleepData}>
                <XAxis dataKey="sleep_reason" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {gestureData.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">
            Gesture Events Timeline
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={gestureData}>
              <XAxis dataKey="gesture" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="space-y-2">
        <button
          onClick={() => {
            const link = document.createElement("a");
            link.href = `/api/exports/emotions.csv?lecture_id=${selectedLecture}`;
            link.download = `lecture_${selectedLecture}.csv`;
            link.click();
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Download CSV
        </button>
        <button
          onClick={() => {
            const link = document.createElement("a");
            link.href = `/api/exports/emotions.xlsx?lecture_id=${selectedLecture}`;
            link.download = `lecture_${selectedLecture}.xlsx`;
            link.click();
          }}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 ml-2"
        >
          Download Excel
        </button>
      </div>
    </div>
  );
}
