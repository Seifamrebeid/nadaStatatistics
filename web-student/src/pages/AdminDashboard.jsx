import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import StatCard from "../components/StatCard";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [lectureSeries, setLectureSeries] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [lectureSnap, emotionSnap] = await Promise.all([
          getDocs(collection(db, "lectures")),
          getDocs(collection(db, "emotions")),
        ]);

        const lectures = lectureSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const emotions = emotionSnap.docs.map((d) => d.data());

        // Compute engagement per lecture
        const byLecture = {};
        emotions.forEach((e) => {
          if (!byLecture[e.lecture_id]) byLecture[e.lecture_id] = { scores: [], yawning: 0, total: 0 };
          byLecture[e.lecture_id].scores.push(e.engagement_score || 0);
          byLecture[e.lecture_id].total += 1;
          if (e.yawning) byLecture[e.lecture_id].yawning += 1;
        });

        const engagementRows = Object.entries(byLecture).map(([lid, d]) => ({
          lecture_id: lid,
          mean_engagement: d.scores.reduce((a, b) => a + b, 0) / d.scores.length,
        }));

        const allScores = emotions.map((e) => e.engagement_score || 0);
        const meanEngagement =
          allScores.length > 0
            ? allScores.reduce((a, b) => a + b, 0) / allScores.length
            : 0;

        const totalYawning = emotions.filter((e) => e.yawning).length;
        const sleepRate = emotions.length > 0 ? totalYawning / emotions.length : 0;

        setStats({
          total_lectures: lectures.length,
          finished_lectures: lectures.filter((l) => l.status === "finished").length,
          scheduled_lectures: lectures.filter((l) => l.status === "scheduled").length,
          mean_engagement: meanEngagement,
          sleep_rate: sleepRate,
        });
        setLectureSeries(engagementRows);
      } catch (e) {
        setErr(e.message);
      }
    };

    fetchStats();
  }, []);

  if (err)
    return <div className="text-red-600">Failed to load stats: {err}</div>;
  if (!stats) return <div className="text-slate-500">Loading…</div>;

  const sleepPct = (Number(stats.sleep_rate) * 100).toFixed(1);
  const meanEng = Number(stats.mean_engagement).toFixed(2);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          label="Total lectures"
          value={stats.total_lectures}
          accent="slate"
        />
        <StatCard
          label="Finished lectures"
          value={stats.finished_lectures}
          accent="slate"
        />
        <StatCard
          label="Scheduled lectures"
          value={stats.scheduled_lectures}
          accent="slate"
        />
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
