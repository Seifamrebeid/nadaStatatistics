import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import PageHeader from "../components/PageHeader";

function arrayToCSV(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = r[h] ?? "";
          const s = String(v).replace(/"/g, '""');
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s}"`
            : s;
        })
        .join(","),
    ),
  ];
  return lines.join("\n");
}

function downloadCSV(rows, filename) {
  const csv = arrayToCSV(rows);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminAnalytics() {
  const [engagement, setEngagement] = useState([]);
  const [sleep, setSleep] = useState([]);
  const [gestures, setGestures] = useState([]);
  const [rawEmotions, setRawEmotions] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDocs(collection(db, "emotions"));
        const emotions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRawEmotions(emotions);

        // Group by lecture_id
        const byLecture = {};
        emotions.forEach((e) => {
          const lid = e.lecture_id || "unknown";
          if (!byLecture[lid]) byLecture[lid] = [];
          byLecture[lid].push(e);
        });

        // Engagement per lecture
        const engagementRows = Object.entries(byLecture).map(
          ([lid, records]) => ({
            lecture_id: lid,
            mean_engagement:
              records.reduce(
                (a, e) => a + (Number(e.engagement_score) || 0),
                0,
              ) / records.length,
            count: records.length,
          }),
        );
        setEngagement(engagementRows);

        // Sleep rate per lecture
        const sleepRows = Object.entries(byLecture).map(([lid, records]) => ({
          lecture_id: lid,
          sleep_rate:
            records.filter((e) => e.state === "sleeping").length /
            records.length,
          count: records.length,
        }));
        setSleep(sleepRows);

        // Gesture counts
        const gestureCounts = {};
        emotions.forEach((e) => {
          if (e.gesture) {
            gestureCounts[e.gesture] =
              (gestureCounts[e.gesture] || 0) + 1;
          }
        });
        setGestures(
          Object.entries(gestureCounts).map(([gesture, count]) => ({
            gesture,
            count,
          })),
        );
      } catch (e) {
        setErr(e.message);
      }
    }
    load();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">System analytics</h1>
      {err && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg">
          {err}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => downloadCSV(rawEmotions, "emotions.csv")}
          className="px-3 py-1.5 bg-white border rounded shadow-sm hover:bg-slate-50"
        >
          Export emotions (CSV)
        </button>
        <button
          onClick={() => downloadCSV(engagement, "engagement.csv")}
          className="px-3 py-1.5 bg-white border rounded shadow-sm hover:bg-slate-50"
        >
          Export engagement (CSV)
        </button>
        <button
          onClick={() => downloadCSV(sleep, "sleep_rate.csv")}
          className="px-3 py-1.5 bg-white border rounded shadow-sm hover:bg-slate-50"
        >
          Export sleep rate (CSV)
        </button>
        <button
          onClick={() => downloadCSV(gestures, "gestures.csv")}
          className="px-3 py-1.5 bg-white border rounded shadow-sm hover:bg-slate-50"
        >
          Export gestures (CSV)
        </button>
      </div>

      <Section title="Engagement per lecture">
        {engagement.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={engagement}>
              <XAxis dataKey="lecture_id" />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Bar dataKey="mean_engagement" fill="#2a7ae2" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      <Section title="Sleep rate per lecture">
        {sleep.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={sleep}>
              <XAxis dataKey="lecture_id" />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Bar dataKey="sleep_rate" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      <Section title="Gesture counts">
        {gestures.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={gestures}>
              <XAxis dataKey="gesture" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#6a51a3" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <h2 className="font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Empty() {
  return (
    <div className="text-slate-500 text-sm">
      No data yet. Record a lecture first.
    </div>
  );
}
