import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import StatCard from "../components/StatCard";
import { Presentation, Radio, Smile, Hand, Bath } from "lucide-react";

export default function DoctorDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const doctorId = profile?.linked_id;

        // Fetch lectures for this doctor
        let lecturesSnap;
        if (doctorId) {
          lecturesSnap = await getDocs(
            query(collection(db, "lectures"), where("doctor_id", "==", doctorId))
          );
        } else {
          lecturesSnap = await getDocs(collection(db, "lectures"));
        }
        const lectures = lecturesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        const today = new Date().toDateString();
        const todayLectures = lectures.filter((l) => {
          if (!l.date) return false;
          const d = l.date?.toDate ? l.date.toDate() : new Date(l.date);
          return d.toDateString() === today;
        });
        const recordingLectures = lectures.filter((l) => l.status === "recording");

        // Fetch all emotions for this doctor's lectures
        const lectureIds = lectures.map((l) => l.id);
        let emotions = [];
        if (lectureIds.length > 0) {
          // Firestore 'in' query supports up to 30 items; chunk if needed
          const chunks = [];
          for (let i = 0; i < lectureIds.length; i += 30) {
            chunks.push(lectureIds.slice(i, i + 30));
          }
          for (const chunk of chunks) {
            const snap = await getDocs(
              query(collection(db, "emotions"), where("lecture_id", "in", chunk))
            );
            emotions.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          }
        }

        const avgEngagement =
          emotions.length > 0
            ? (
                emotions.reduce((sum, e) => sum + (e.engagement_score || 0), 0) /
                emotions.length
              ).toFixed(2)
            : 0;

        // Attendance: students with emotion record in last 10 minutes are present
        const tenMinAgo = Date.now() - 10 * 60 * 1000;
        const recentStudents = new Set();
        emotions.forEach((e) => {
          const ts = e.timestamp?.toMillis
            ? e.timestamp.toMillis()
            : e.timestamp
              ? new Date(e.timestamp).getTime()
              : 0;
          if (ts > tenMinAgo) recentStudents.add(e.student_id);
        });
        const allStudentIds = new Set(emotions.map((e) => e.student_id).filter(Boolean));
        const presentCount = recentStudents.size;
        const absentCount = allStudentIds.size - presentCount;
        const attendanceRate =
          allStudentIds.size > 0 ? presentCount / allStudentIds.size : 0;

        setStats({
          todayCount: todayLectures.length,
          recordingCount: recordingLectures.length,
          avgEngagement,
          raisedHandsCount: emotions.filter((e) => e.gesture === "hand_raised").length,
          toiletRequestsCount: emotions.filter((e) => e.gesture === "toilet_request").length,
          attentionAlertsCount: emotions.filter(
            (e) => (Number(e.engagement_score) || 0) < 45
          ).length,
          cheatAlertsCount: 0,
        });
        setAttendance({
          present: presentCount,
          absent: absentCount,
          attendanceRate,
        });
      } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        setErr(error.message);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [profile]);

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
