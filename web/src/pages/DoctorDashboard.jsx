import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  getCountFromServer,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import StatCard from "../components/StatCard";
import { Presentation, Radio, Smile, Hand, Bath } from "lucide-react";

const RECENT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes for live attendance
const SAMPLE_LIMIT = 300;                 // max emotion docs to read for stats
const REFRESH_INTERVAL_MS = 30_000;      // refresh every 30 s (not 5 s)

export default function DoctorDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const doctorId = profile?.linked_id;

        // 1. Lectures for this doctor
        const lecturesSnap = doctorId
          ? await getDocs(query(collection(db, "lectures"), where("doctor_id", "==", doctorId)))
          : await getDocs(collection(db, "lectures"));
        const lectures = lecturesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        const today = new Date().toDateString();
        const todayLectures = lectures.filter((l) => {
          if (!l.date) return false;
          const d = l.date?.toDate ? l.date.toDate() : new Date(l.date);
          return d.toDateString() === today;
        });
        const recordingLectures = lectures.filter((l) => l.status === "recording");

        // 2. Recent emotions only — scoped to the last 15 minutes to detect live presence
        //    Read at most SAMPLE_LIMIT docs to protect quota.
        const cutoff = Timestamp.fromMillis(Date.now() - RECENT_WINDOW_MS);
        const recentEmotionsSnap = await getDocs(
          query(
            collection(db, "emotions"),
            where("timestamp", ">=", cutoff),
            orderBy("timestamp", "desc"),
            limit(SAMPLE_LIMIT),
          )
        );
        const recentEmotions = recentEmotionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // Filter to this doctor's lectures only
        const lectureIdSet = new Set(lectures.map((l) => l.id));
        const myEmotions = recentEmotions.filter((e) => !lectureIdSet.size || lectureIdSet.has(e.lecture_id));

        const avgEngagement =
          myEmotions.length > 0
            ? (myEmotions.reduce((s, e) => s + (Number(e.engagement_score) || 0), 0) / myEmotions.length).toFixed(1)
            : "—";

        // Live attendance: unique students seen in the window
        const recentStudentIds = new Set(myEmotions.map((e) => e.student_id).filter(Boolean));
        const presentCount = recentStudentIds.size;

        // Total enrolled estimate from attendance collection (count only)
        const attendanceCountSnap = await getCountFromServer(collection(db, "attendance"));
        const totalEnrolled = attendanceCountSnap.data().count || presentCount;
        const absentCount = Math.max(0, totalEnrolled - presentCount);
        const attendanceRate = totalEnrolled > 0 ? presentCount / totalEnrolled : 0;

        setStats({
          todayCount: todayLectures.length,
          recordingCount: recordingLectures.length,
          avgEngagement,
          raisedHandsCount: myEmotions.filter((e) => e.gesture === "hand_raised").length,
          toiletRequestsCount: myEmotions.filter((e) => e.gesture === "toilet_request").length,
          attentionAlertsCount: myEmotions.filter((e) => (Number(e.engagement_score) || 100) < 45).length,
          cheatAlertsCount: 0,
        });
        setAttendance({ present: presentCount, absent: absentCount, attendanceRate });
      } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        setErr(error.message);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, REFRESH_INTERVAL_MS);
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
            Live snapshot — last 15 min of activity. Refreshes every 30 seconds.
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
