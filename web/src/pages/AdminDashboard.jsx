import { useEffect, useState } from "react";
import {
  collection, getDocs, getCountFromServer, query, orderBy, limit,
} from "firebase/firestore";
import { db } from "../firebase";
import StatCard from "../components/StatCard";
import {
  GraduationCap,
  Stethoscope,
  Presentation,
  Activity,
  Smile,
  Moon,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const SAMPLE_SIZE = 500; // read only the latest N emotion records for analytics

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        // Use count queries for totals (1 read each, no quota burn)
        const [studentsSnap, doctorsSnap, lecturesSnap, emotionsCountSnap, emotionsSampleSnap] =
          await Promise.all([
            getCountFromServer(collection(db, "students")),
            getCountFromServer(collection(db, "doctors")),
            getCountFromServer(collection(db, "lectures")),
            getCountFromServer(collection(db, "emotions")),
            getDocs(query(collection(db, "emotions"), orderBy("timestamp", "desc"), limit(SAMPLE_SIZE))),
          ]);

        const totalObservations = emotionsCountSnap.data().count;
        const emotions = emotionsSampleSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // Mean engagement score (from sample)
        const meanEngagement =
          emotions.length > 0
            ? emotions.reduce((a, e) => a + (Number(e.engagement_score) || 0), 0) / emotions.length
            : 0;

        // Sleep rate (from sample)
        const sleepCount = emotions.filter((e) => e.state === "sleeping").length;
        const sleepRate = emotions.length > 0 ? sleepCount / emotions.length : 0;

        // Top gestures (from sample)
        const gestureCounts = {};
        emotions.forEach((e) => {
          if (e.gesture) {
            gestureCounts[e.gesture] = (gestureCounts[e.gesture] || 0) + 1;
          }
        });
        const topGestures = Object.entries(gestureCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([gesture, n]) => ({ gesture, n }));

        setStats({
          total_students: studentsSnap.data().count,
          total_doctors: doctorsSnap.data().count,
          total_lectures: lecturesSnap.data().count,
          total_observations: totalObservations,
          mean_engagement: meanEngagement,
          sleep_rate: sleepRate,
          top_gestures: topGestures,
          sample_size: emotions.length,
        });
      } catch (e) {
        setErr(e.message);
      }
    }
    load();
  }, []);

  if (err) {
    return (
      <div className="card p-6 text-red-700 bg-red-50 border-red-200">
        Failed to load stats: {err}
      </div>
    );
  }
  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5 animate-pulse">
            <div className="h-3 w-20 bg-slate-200 rounded" />
            <div className="h-8 w-24 bg-slate-200 rounded mt-3" />
          </div>
        ))}
      </div>
    );
  }

  const sleepPct = (stats.sleep_rate * 100).toFixed(1);
  const meanEng = Number(stats.mean_engagement).toFixed(2);
  const gestures = stats.top_gestures || [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
          System overview
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Snapshot of platform-wide activity and engagement signals.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total students"
          value={stats.total_students}
          accent="brand"
          icon={GraduationCap}
        />
        <StatCard
          label="Total doctors"
          value={stats.total_doctors}
          accent="slate"
          icon={Stethoscope}
        />
        <StatCard
          label="Total lectures"
          value={stats.total_lectures}
          accent="slate"
          icon={Presentation}
        />
        <StatCard
          label="Observations"
          value={stats.total_observations}
          accent="slate"
          icon={Activity}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <StatCard
          label="Mean engagement"
          value={meanEng}
          accent={meanEng >= 0.5 ? "green" : meanEng >= 0.3 ? "amber" : "red"}
          icon={Smile}
          hint={
            meanEng >= 0.5
              ? "Healthy"
              : meanEng >= 0.3
                ? "Watch"
                : "Needs attention"
          }
        />
        <StatCard
          label="Sleep rate"
          value={`${sleepPct}%`}
          accent={sleepPct < 5 ? "green" : sleepPct < 15 ? "amber" : "red"}
          icon={Moon}
          hint={sleepPct < 5 ? "Low" : sleepPct < 15 ? "Moderate" : "Elevated"}
        />
      </div>

      {gestures.length > 0 && (
        <div className="card p-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-900">
                Top gestures observed
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Based on latest {stats.sample_size} observations
              </p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={gestures}
              margin={{ top: 5, right: 10, bottom: 5, left: -10 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e2e8f0"
                vertical={false}
              />
              <XAxis
                dataKey="gesture"
                tick={{ fill: "#64748b", fontSize: 12 }}
                axisLine={{ stroke: "#e2e8f0" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "#f1f5f9" }}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="n" fill="#7c3aed" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
