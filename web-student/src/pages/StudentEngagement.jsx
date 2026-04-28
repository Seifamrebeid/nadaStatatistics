import { useEffect, useState } from "react";
import api from "../services/api";
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
  const [engagement, setEngagement] = useState([]);
  const [sleep, setSleep] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get("/api/analytics/engagement"),
      api.get("/api/analytics/sleep"),
    ])
      .then(([e, s]) => {
        setEngagement(columnsToRows(e.data));
        setSleep(columnsToRows(s.data));
      })
      .catch((e) => setErr(e.response?.data?.error || e.message));
  }, []);

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

function columnsToRows(obj) {
  if (!obj) return [];
  const keys = Object.keys(obj).filter((k) => Array.isArray(obj[k]));
  if (keys.length === 0) return [];
  const n = obj[keys[0]].length;
  return Array.from({ length: n }, (_, i) => {
    const row = {};
    for (const k of keys) row[k] = obj[k][i];
    return row;
  });
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
