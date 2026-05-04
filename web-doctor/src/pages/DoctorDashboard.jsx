import { useEffect, useState } from "react";
import api from "../services/api";
import StatCard from "../components/StatCard";

const v = (x) => (Array.isArray(x) ? x[0] : x);

export default function DoctorDashboard() {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch doctor's own lectures and engagement metrics
        const lecturesRes = await api.get("/api/lectures");
        const lectures = lecturesRes.data || [];

        const todayLectures = lectures.filter((l) => {
          const lecDate = new Date(v(l.scheduled_at)).toDateString();
          return lecDate === new Date().toDateString();
        });

        const recordingLectures = lectures.filter(
          (l) => v(l.status) === "recording",
        );

        // Calculate avg engagement across own lectures
        const emotionsRes = await api.get("/api/emotions");
        const emotions = emotionsRes.data || [];
        const avgEngagement =
          emotions.length > 0
            ? (
                emotions.reduce(
                  (sum, e) => sum + (v(e.engagement_score) || 0),
                  0,
                ) / emotions.length
              ).toFixed(2)
            : 0;

        setStats({
          todayCount: todayLectures.length,
          recordingCount: recordingLectures.length,
          avgEngagement,
          raisedHandsCount: emotions.filter(
            (e) => v(e.gesture) === "hand_raised",
          ).length,
          toiletRequestsCount: emotions.filter(
            (e) => v(e.gesture) === "toilet_request",
          ).length,
        });
      } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        setErr(error.message);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  if (err) {
    return <div className="text-red-600 p-4">Error: {err}</div>;
  }

  if (!stats) {
    return <div className="p-4 text-slate-500">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Doctor Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Today's Lectures" value={stats.todayCount} />
        <StatCard
          label="Currently Recording"
          value={stats.recordingCount}
          color="bg-blue-100"
        />
        <StatCard
          label="Avg Engagement"
          value={`${stats.avgEngagement}%`}
          color="bg-green-100"
        />
        <StatCard
          label="Hands Raised"
          value={stats.raisedHandsCount}
          color="bg-yellow-100"
        />
        <StatCard
          label="Toilet Requests"
          value={stats.toiletRequestsCount}
          color="bg-red-100"
        />
      </div>
    </div>
  );
}
