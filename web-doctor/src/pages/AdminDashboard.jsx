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
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function average(values) {
  const nums = values.filter((n) => Number.isFinite(n));
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState(null);
  const [lectureSeries, setLectureSeries] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const doctorId = profile?.linked_id;

        // Lectures
        let lecturesSnap;
        if (doctorId) {
          lecturesSnap = await getDocs(
            query(collection(db, "lectures"), where("doctor_id", "==", doctorId))
          );
        } else {
          lecturesSnap = await getDocs(collection(db, "lectures"));
        }
        const lectures = lecturesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const lectureIds = lectures.map((l) => l.id);

        // Notifications
        let notifSnap;
        if (doctorId) {
          notifSnap = await getDocs(
            query(collection(db, "notifications"), where("sender_doctor_id", "==", doctorId))
          );
        } else {
          notifSnap = await getDocs(collection(db, "notifications"));
        }

        // Emotions — fetch all for this doctor's lectures
        let allEmotions = [];
        if (lectureIds.length > 0) {
          const chunks = [];
          for (let i = 0; i < lectureIds.length; i += 30) {
            chunks.push(lectureIds.slice(i, i + 30));
          }
          for (const chunk of chunks) {
            const snap = await getDocs(
              query(collection(db, "emotions"), where("lecture_id", "in", chunk))
            );
            allEmotions.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          }
        }

        // Aggregate engagement per lecture
        const byLecture = {};
        allEmotions.forEach((e) => {
          if (!byLecture[e.lecture_id]) byLecture[e.lecture_id] = [];
          byLecture[e.lecture_id].push(e.engagement_score || 0);
        });

        const engagement = Object.entries(byLecture).map(([lecture_id, scores]) => ({
          lecture_id,
          mean_engagement: average(scores.map(Number)),
        }));

        const sleepRows = allEmotions.filter((e) => e.state === "sleeping");
        const sleepRate =
          allEmotions.length > 0 ? sleepRows.length / allEmotions.length : 0;
        const engagementMean = average(allEmotions.map((e) => Number(e.engagement_score || 0)));

        setStats({
          total_lectures: lectures.length,
          finished_lectures: lectures.filter((l) => l.status === "finished").length,
          scheduled_lectures: lectures.filter((l) => l.status === "scheduled").length,
          notifications_sent: notifSnap.docs.length,
          mean_engagement: engagementMean,
          sleep_rate: sleepRate,
        });
        setLectureSeries(engagement);
      } catch (e) {
        setErr(e.message);
      }
    };

    fetchAll();
  }, [profile]);

  if (err)
    return <div className="text-red-600">Failed to load stats: {err}</div>;
  if (!stats) return <div className="text-slate-500">Loading…</div>;

  const sleepPct = (Number(stats.sleep_rate) * 100).toFixed(1);
  const meanEng = Number(stats.mean_engagement).toFixed(2);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Doctor overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="My lectures" value={stats.total_lectures} accent="slate" />
        <StatCard label="Finished lectures" value={stats.finished_lectures} accent="slate" />
        <StatCard label="Scheduled lectures" value={stats.scheduled_lectures} accent="slate" />
        <StatCard label="Notifications sent" value={stats.notifications_sent} accent="slate" />
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
