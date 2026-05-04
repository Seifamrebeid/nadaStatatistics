import { useEffect, useState } from "react";
import api from "../services/api";
import StatCard from "../components/StatCard";

const v = (x) => (Array.isArray(x) ? x[0] : x);

export default function StudentDashboard() {
  const [stats, setStats] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [lectures, setLectures] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        // Fetch own engagement metrics
        const me = await api.get("/api/me");
        const userId = v(me.data.uid);

        // Get student's analytics vs class average
        const compRes = await api.get(
          `/api/analytics/student/${userId}/comparison`,
        );
        const comp = compRes.data;

        // Fetch enrolled lectures
        const lecturesRes = await api.get("/api/lectures");
        const lecturesList = (
          Array.isArray(lecturesRes.data) ? lecturesRes.data : []
        ).map(normalise);

        const recordingLectures = lecturesList.filter(
          (l) => v(l.status) === "recording",
        );

        setComparison(comp);
        setLectures(lecturesList);
        setStats({
          enrolledCount: lecturesList.length,
          recordingCount: recordingLectures.length,
          averageEngagement: comp?.self_mean?.toFixed(2) || 0,
        });
      } catch (error) {
        console.error("Error fetching dashboard:", error);
        setErr(error.response?.data?.error || error.message);
      }
    };

    fetchDashboard();
  }, []);

  if (err) {
    return <div className="text-red-600 p-4">Error: {err}</div>;
  }

  if (!stats) {
    return <div className="p-4 text-slate-500">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Welcome!</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Enrolled Lectures" value={stats.enrolledCount} />
        <StatCard
          label="Live Now"
          value={stats.recordingCount}
          color="bg-blue-100"
        />
        <StatCard
          label="Your Engagement"
          value={`${stats.averageEngagement}%`}
          color="bg-green-100"
        />
      </div>

      {comparison && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">You vs. Class Average</h2>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span>Your Average Engagement:</span>
              <span className="font-semibold text-green-600">
                {comparison.self_mean?.toFixed(2) || 0}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Class Average:</span>
              <span className="font-semibold text-blue-600">
                {comparison.class_mean?.toFixed(2) || 0}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-4">
              <div
                className="bg-green-600 h-2 rounded-full"
                style={{
                  width: `${Math.min(100, (comparison.self_mean / (comparison.class_mean || 1)) * 100)}%`,
                }}
              ></div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Recent Lectures</h2>
        <div className="space-y-2">
          {lectures.slice(0, 6).map((l) => (
            <div
              key={v(l.id)}
              className="flex justify-between items-center p-3 border-b last:border-b-0"
            >
              <div>
                <div className="font-medium">{v(l.title)}</div>
                <div className="text-sm text-gray-500">
                  {l.scheduled_at
                    ? new Date(v(l.scheduled_at)).toLocaleDateString()
                    : "-"}
                </div>
              </div>
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${
                  v(l.status) === "recording"
                    ? "bg-red-100 text-red-800"
                    : v(l.status) === "finished"
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-800"
                }`}
              >
                {v(l.status) || "scheduled"}
              </span>
            </div>
          ))}
          {lectures.length === 0 && (
            <div className="text-slate-500 text-center py-4">
              No enrolled lectures yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function normalise(row) {
  const out = {};
  for (const [k, val] of Object.entries(row || {})) out[k] = v(val);
  return out;
}
