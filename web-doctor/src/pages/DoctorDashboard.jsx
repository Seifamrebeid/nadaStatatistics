import { useEffect, useState } from "react";
import api from "../services/api";
import StatCard from "../components/StatCard";
import { Presentation, Radio, Smile, Hand, Bath } from "lucide-react";

const v = (x) => (Array.isArray(x) ? x[0] : x);

export default function DoctorDashboard() {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const lecturesRes = await api.get("/api/lectures");
        const lectures = lecturesRes.data || [];

        const todayLectures = lectures.filter((l) => {
          const lecDate = new Date(v(l.scheduled_at)).toDateString();
          return lecDate === new Date().toDateString();
        });

        const recordingLectures = lectures.filter(
          (l) => v(l.status) === "recording",
        );

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
    return (
      <div className="card p-6 text-red-700 bg-red-50 border-red-200">
        Error: {err}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card p-5 animate-pulse">
            <div className="h-3 w-20 bg-slate-200 rounded" />
            <div className="h-8 w-24 bg-slate-200 rounded mt-3" />
          </div>
        ))}
      </div>
    );
  }

  const recording = stats.recordingCount > 0;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Doctor Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Live snapshot of your teaching activity. Refreshes every 5 seconds.
          </p>
        </div>
        {recording && (
          <span className="badge bg-red-50 text-red-700 ring-1 ring-red-100 gap-1.5 px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            {stats.recordingCount} live now
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Today's Lectures" value={stats.todayCount} accent="brand" icon={Presentation} />
        <StatCard label="Currently Recording" value={stats.recordingCount} accent={recording ? "red" : "slate"} icon={Radio} />
        <StatCard label="Avg Engagement" value={`${stats.avgEngagement}%`} accent="green" icon={Smile} />
        <StatCard label="Hands Raised" value={stats.raisedHandsCount} accent="amber" icon={Hand} />
        <StatCard label="Toilet Requests" value={stats.toiletRequestsCount} accent="slate" icon={Bath} />
      </div>
    </div>
  );
}
