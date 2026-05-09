import { useEffect, useState } from "react";
import api from "../services/api";
import StatCard from "../components/StatCard";
import { Presentation, Radio, Smile, Hand, Bath } from "lucide-react";

const v = (x) => (Array.isArray(x) ? x[0] : x);

export default function DoctorDashboard() {
  const [stats, setStats] = useState(null);
  const [attendance, setAttendance] = useState(null);
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
        const attendanceRes = await api.get("/api/attendance/current");
        const attendanceData = attendanceRes.data || {};
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
          attentionAlertsCount: emotions.filter(
            (e) =>
              Number(v(e.attention_warning)) === 1 ||
              v(e.attention_warning) === true ||
              (Number(v(e.attention_score)) || 0) < 45,
          ).length,
          cheatAlertsCount: emotions.filter(
            (e) =>
              Number(v(e.cheat_warning)) === 1 ||
              v(e.cheat_warning) === true ||
              (Number(v(e.cheat_score)) || 0) >= 60,
          ).length,
        });
        setAttendance({
          present: v(attendanceData.summary?.present) || 0,
          absent: v(attendanceData.summary?.absent) || 0,
          attendanceRate: Number(
            v(attendanceData.summary?.attendance_rate) || 0,
          ),
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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label="Today's Lectures"
          value={stats.todayCount}
          accent="brand"
          icon={Presentation}
        />
        <StatCard
          label="Currently Recording"
          value={stats.recordingCount}
          accent={recording ? "red" : "slate"}
          icon={Radio}
        />
        <StatCard
          label="Avg Engagement"
          value={`${stats.avgEngagement}%`}
          accent="green"
          icon={Smile}
        />
        <StatCard
          label="Hands Raised"
          value={stats.raisedHandsCount}
          accent="amber"
          icon={Hand}
        />
        <StatCard
          label="Toilet Requests"
          value={stats.toiletRequestsCount}
          accent="slate"
          icon={Bath}
        />
        <StatCard
          label="Attendance"
          value={
            attendance ? `${Math.round(attendance.attendanceRate * 100)}%` : "—"
          }
          accent="brand"
          icon={Presentation}
        />
      </div>

      {attendance && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <StatCard
            label="Present now"
            value={attendance.present}
            accent="green"
            icon={Presentation}
          />
          <StatCard
            label="Absent now"
            value={attendance.absent}
            accent="red"
            icon={Radio}
          />
          <StatCard
            label="Attendance rate"
            value={`${Math.round(attendance.attendanceRate * 100)}%`}
            accent={
              attendance.attendanceRate >= 0.8
                ? "green"
                : attendance.attendanceRate >= 0.6
                  ? "amber"
                  : "red"
            }
            icon={Smile}
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <StatCard
          label="Attention alerts"
          value={stats.attentionAlertsCount}
          accent={stats.attentionAlertsCount > 0 ? "amber" : "green"}
          icon={Smile}
          hint="Students below the attention threshold"
        />
        <StatCard
          label="Cheat alerts"
          value={stats.cheatAlertsCount}
          accent={stats.cheatAlertsCount > 0 ? "red" : "green"}
          icon={Radio}
          hint="Exam-mode suspicious activity"
        />
      </div>
    </div>
  );
}
