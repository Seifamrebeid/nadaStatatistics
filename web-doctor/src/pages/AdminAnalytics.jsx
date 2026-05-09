import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
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

export default function AdminAnalytics() {
  const { profile } = useAuth();
  const [engagement, setEngagement] = useState([]);
  const [sleep, setSleep] = useState([]);
  const [gestures, setGestures] = useState([]);
  const [allEmotions, setAllEmotions] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const doctorId = profile?.linked_id;

        let lecturesSnap;
        if (doctorId) {
          lecturesSnap = await getDocs(
            query(collection(db, "lectures"), where("doctor_id", "==", doctorId))
          );
        } else {
          lecturesSnap = await getDocs(collection(db, "lectures"));
        }
        const lectureIds = lecturesSnap.docs.map((d) => d.id);

        let emotions = [];
        if (lectureIds.length > 0) {
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

        setAllEmotions(emotions);

        // Engagement per lecture
        const byLecture = {};
        emotions.forEach((e) => {
          if (!byLecture[e.lecture_id]) byLecture[e.lecture_id] = [];
          byLecture[e.lecture_id].push(Number(e.engagement_score || 0));
        });
        setEngagement(
          Object.entries(byLecture).map(([lecture_id, scores]) => ({
            lecture_id,
            mean_engagement: Number(average(scores).toFixed(3)),
          }))
        );

        // Sleep rate per lecture
        const sleepByLecture = {};
        const totalByLecture = {};
        emotions.forEach((e) => {
          if (!totalByLecture[e.lecture_id]) {
            totalByLecture[e.lecture_id] = 0;
            sleepByLecture[e.lecture_id] = 0;
          }
          totalByLecture[e.lecture_id]++;
          if (e.state === "sleeping") sleepByLecture[e.lecture_id]++;
        });
        setSleep(
          Object.entries(totalByLecture).map(([lecture_id, total]) => ({
            lecture_id,
            sleep_rate: Number((sleepByLecture[lecture_id] / total).toFixed(3)),
          }))
        );

        // Gestures
        const gestureCounts = {};
        emotions.forEach((e) => {
          const g = e.gesture || "";
          if (g && g !== "none") {
            gestureCounts[g] = (gestureCounts[g] || 0) + 1;
          }
        });
        setGestures(
          Object.entries(gestureCounts).map(([gesture, count]) => ({ gesture, count }))
        );
      } catch (e) {
        setErr(e.message);
      }
    };
    fetchAll();
  }, [profile]);

  function downloadCSV() {
    if (!allEmotions.length) return;
    const headers = ["student_id", "lecture_id", "timestamp", "emotion", "state", "engagement_score", "gesture", "sleep_reason"];
    const rows = allEmotions.map((e) => {
      const ts = e.timestamp?.toDate
        ? e.timestamp.toDate().toISOString()
        : e.timestamp || "";
      return [
        e.student_id || "",
        e.lecture_id || "",
        ts,
        e.emotion || "",
        e.state || "",
        e.engagement_score ?? "",
        e.gesture || "",
        e.sleep_reason || "",
      ].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "emotions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadEngagementCSV() {
    if (!engagement.length) return;
    const rows = engagement.map((r) => `${r.lecture_id},${r.mean_engagement}`);
    const csv = ["lecture_id,mean_engagement", ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "engagement.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Lecture analytics</h1>
      {err && (
        <div className="mb-4 px-3 py-2 bg-red-100 text-red-900 text-sm rounded">
          {err}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={downloadCSV}
          className="px-3 py-1.5 bg-white border rounded shadow-sm hover:bg-slate-50"
        >
          Export emotions (CSV)
        </button>
        <button
          onClick={downloadEngagementCSV}
          className="px-3 py-1.5 bg-white border rounded shadow-sm hover:bg-slate-50"
        >
          Export engagement (CSV)
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
