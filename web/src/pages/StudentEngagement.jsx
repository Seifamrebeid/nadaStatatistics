import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
} from "recharts";

export default function StudentEngagement() {
  const { profile } = useAuth();
  const [engagement, setEngagement] = useState([]);
  const [sleep, setSleep] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!profile?.linked_id) return;

    const fetchEngagement = async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, "emotions"),
            where("student_id", "==", profile.linked_id),
          ),
        );
        const rows = snap.docs.map((d) => d.data());

        // Group by lecture
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

        setEngagement(engagementData);
        setSleep(sleepData);
      } catch (e) {
        setErr(e.message);
      }
    };

    fetchEngagement();
  }, [profile?.linked_id]);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">My engagement history</h1>
      {err && (
        <div className="mb-4 px-3 py-2 bg-red-100 text-red-900 rounded text-sm">
          {err}
        </div>
      )}

      <Section title="Engagement by lecture">
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

      <Section title="Sleep trend by lecture">
        {sleep.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={sleep}>
              <XAxis dataKey="lecture_id" />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="sleep_rate"
                stroke="#ef4444"
                strokeWidth={2}
              />
            </LineChart>
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
  return <div className="text-slate-500 text-sm">No engagement data yet.</div>;
}
