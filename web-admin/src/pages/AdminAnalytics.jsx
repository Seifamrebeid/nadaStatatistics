import { useEffect, useState } from "react";
import api from "../services/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
         LineChart, Line } from "recharts";

const v = (x) => (Array.isArray(x) ? x[0] : x);

// Normalise Plumber's column-oriented payloads {colA: [...], colB: [...]} into
// row-oriented [{colA: x, colB: y}, ...] for Recharts.
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

export default function AdminAnalytics() {
  const [engagement, setEngagement] = useState([]);
  const [sleep, setSleep] = useState([]);
  const [gestures, setGestures] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get("/api/analytics/engagement"),
      api.get("/api/analytics/sleep"),
      api.get("/api/analytics/gestures"),
    ]).then(([e, s, g]) => {
      setEngagement(columnsToRows(e.data));
      setSleep(columnsToRows(s.data));
      setGestures(columnsToRows(g.data));
    }).catch((e) => setErr(e.response?.data?.error || e.message));
  }, []);

  async function download(path, filename) {
    try {
      const { data } = await api.get(path, { responseType: "blob" });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert(e.message); }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">System analytics</h1>
      {err && <div className="mb-4 px-3 py-2 bg-red-100 text-red-900 text-sm rounded">{err}</div>}

      <div className="flex flex-wrap gap-2 mb-6">
        <button onClick={() => download("/api/exports/emotions.csv",   "emotions.csv")}
                className="px-3 py-1.5 bg-white border rounded shadow-sm hover:bg-slate-50">
          Export emotions (CSV)
        </button>
        <button onClick={() => download("/api/exports/emotions.xlsx",  "emotions.xlsx")}
                className="px-3 py-1.5 bg-white border rounded shadow-sm hover:bg-slate-50">
          Export emotions (Excel)
        </button>
        <button onClick={() => download("/api/exports/engagement.csv", "engagement.csv")}
                className="px-3 py-1.5 bg-white border rounded shadow-sm hover:bg-slate-50">
          Export engagement (CSV)
        </button>
        <button onClick={() => download("/api/exports/attendance.csv", "attendance.csv")}
                className="px-3 py-1.5 bg-white border rounded shadow-sm hover:bg-slate-50">
          Export attendance (CSV)
        </button>
      </div>

      <Section title="Engagement per lecture">
        {engagement.length === 0 ? <Empty/> : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={engagement}>
              <XAxis dataKey="lecture_id"/>
              <YAxis domain={[0, 1]}/>
              <Tooltip/>
              <Bar dataKey="mean_engagement" fill="#2a7ae2"/>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      <Section title="Sleep rate per lecture">
        {sleep.length === 0 ? <Empty/> : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={sleep}>
              <XAxis dataKey="lecture_id"/>
              <YAxis domain={[0, 1]}/>
              <Tooltip/>
              <Bar dataKey="sleep_rate" fill="#ef4444"/>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      <Section title="Gesture counts">
        {gestures.length === 0 ? <Empty/> : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={gestures}>
              <XAxis dataKey="gesture"/>
              <YAxis/>
              <Tooltip/>
              <Bar dataKey="count" fill="#6a51a3"/>
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
  return <div className="text-slate-500 text-sm">No data yet. Record a lecture first.</div>;
}
