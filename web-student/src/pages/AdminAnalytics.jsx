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
  LineChart,
  Line,
} from "recharts";

export default function AdminAnalytics() {
  const [engagement, setEngagement] = useState([]);
  const [sleep, setSleep] = useState([]);
  const [gestures, setGestures] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const snap = await getDocs(collection(db, "emotions"));
        const rows = snap.docs.map((d) => d.data());

        // Group by lecture for engagement and sleep
        const byLecture = {};
        rows.forEach((e) => {
          if (!byLecture[e.lecture_id]) {
            byLecture[e.lecture_id] = { scores: [], yawning: 0, total: 0 };
          }
          byLecture[e.lecture_id].scores.push(e.engagement_score || 0);
          byLecture[e.lecture_id].total += 1;
          if (e.yawning) byLecture[e.lecture_id].yawning += 1;
        });

        const engagementData = Object.entries(byLecture).map(([lid, d]) => ({
          lecture_id: lid,
          mean_engagement:
            d.scores.reduce((a, b) => a + b, 0) / d.scores.length,
        }));

        const sleepData = Object.entries(byLecture).map(([lid, d]) => ({
          lecture_id: lid,
          sleep_rate: d.total > 0 ? d.yawning / d.total : 0,
        }));

        // Count gestures
        const gestureCounts = {};
        rows.forEach((e) => {
          if (e.gesture) {
            gestureCounts[e.gesture] = (gestureCounts[e.gesture] || 0) + 1;
          }
        });
        const gestureData = Object.entries(gestureCounts).map(([gesture, count]) => ({
          gesture,
          count,
        }));

        setEngagement(engagementData);
        setSleep(sleepData);
        setGestures(gestureData);
      } catch (e) {
        setErr(e.message);
      }
    };

    fetchAnalytics();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Lecture analytics</h1>
      {err && (
        <div className="mb-4 px-3 py-2 bg-red-100 text-red-900 text-sm rounded">
          {err}
        </div>
      )}

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
