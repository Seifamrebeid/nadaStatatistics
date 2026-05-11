import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import StatCard from "../components/StatCard";
import { CalendarCheck, Smile, Users } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useChildren } from "../context/ChildContext";

export default function ChildHistory() {
  const { selected } = useChildren();
  const [chart, setChart] = useState([]);
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    (async () => {
      try {
        // Get lectures for this child
        const lectSnap = await getDocs(
          query(
            collection(db, "lectures"),
            where("enrolled_student_ids", "array-contains", selected.id),
          ),
        );
        const childLectures = lectSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // Get this child's emotions
        const mySnap = await getDocs(
          query(collection(db, "emotions"), where("student_id", "==", selected.id)),
        );
        const myEmotions = mySnap.docs.map((d) => d.data());

        // Group child emotions by lecture
        const myByLecture = {};
        myEmotions.forEach((e) => {
          if (!myByLecture[e.lecture_id]) myByLecture[e.lecture_id] = [];
          myByLecture[e.lecture_id].push(e.engagement_score || 0);
        });

        // Get all emotions for each lecture to compute class mean
        const lectureIds = childLectures.map((l) => l.id);
        const classAvgByLecture = {};
        await Promise.all(
          lectureIds.map(async (lid) => {
            const snap = await getDocs(
              query(collection(db, "emotions"), where("lecture_id", "==", lid)),
            );
            const allScores = snap.docs.map((d) => d.data().engagement_score || 0);
            classAvgByLecture[lid] =
              allScores.length > 0
                ? allScores.reduce((a, b) => a + b, 0) / allScores.length
                : 0;
          }),
        );

        // Build chart data
        const chartData = childLectures.map((l, idx) => {
          const myScores = myByLecture[l.id] || [];
          const myAvg =
            myScores.length > 0
              ? myScores.reduce((a, b) => a + b, 0) / myScores.length
              : 0;
          return {
            name: `Lecture ${idx + 1}`,
            lecture_id: l.id,
            self: myAvg,
            class_mean: classAvgByLecture[l.id] || 0,
          };
        });

        if (cancelled) return;
        setChart(chartData);

        const selfMean =
          chartData.length > 0
            ? chartData.reduce((s, l) => s + l.self, 0) / chartData.length
            : 0;
        const classMean =
          chartData.length > 0
            ? chartData.reduce((s, l) => s + l.class_mean, 0) / chartData.length
            : 0;
        setStats({
          self: selfMean,
          classMean,
          count: chartData.length,
        });
      } catch (e) {
        if (!cancelled) setErr(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  if (!selected) {
    return (
      <div className="card p-10 text-center text-sm text-slate-500">
        Select a child first.
      </div>
    );
  }

  if (err) {
    return (
      <div className="card p-6 text-red-700 bg-red-50 border-red-200">
        Error: {err}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
          Engagement History
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {selected.name || selected.id} compared with the class average.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            label="Lectures Attended"
            value={stats.count}
            accent="brand"
            icon={CalendarCheck}
          />
          <StatCard
            label="Their Average"
            value={`${stats.self.toFixed(2)}%`}
            accent="green"
            icon={Smile}
          />
          <StatCard
            label="Class Average"
            value={`${stats.classMean.toFixed(2)}%`}
            accent="slate"
            icon={Users}
          />
        </div>
      )}

      {chart.length > 0 ? (
        <div className="card p-6 mt-6">
          <h2 className="font-semibold text-slate-900">Engagement over time</h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">
            Per-lecture comparison against the class mean.
          </p>
          <ResponsiveContainer width="100%" height={360}>
            <LineChart
              data={chart}
              margin={{ top: 5, right: 16, bottom: 5, left: -10 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e2e8f0"
                vertical={false}
              />
              <XAxis
                dataKey="name"
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
                formatter={(value) => Number(value).toFixed(2)}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="self"
                stroke="#0ea5e9"
                strokeWidth={2.5}
                name="Their Engagement"
                dot={{ r: 3 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="class_mean"
                stroke="#94a3b8"
                strokeWidth={2}
                strokeDasharray="5 5"
                name="Class Average"
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="card p-10 mt-6 text-center text-sm text-slate-500">
          No lecture history yet.
        </div>
      )}
    </div>
  );
}
