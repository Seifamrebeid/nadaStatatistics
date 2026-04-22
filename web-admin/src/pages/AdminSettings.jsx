import { useState } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

// Admin settings: mostly config the backend owns. Showing what we can
// inspect via /health + letting the admin regenerate reports globally.
export default function AdminSettings() {
  const { profile } = useAuth();
  const [health, setHealth] = useState(null);
  const [err, setErr] = useState(null);

  async function refresh() {
    try { setHealth((await api.get("/health")).data); }
    catch (e) { setErr(e.response?.data?.error || e.message); }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Settings</h1>
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <h2 className="font-semibold mb-2">Environment</h2>
        <table className="text-sm">
          <tbody>
            <Row k="Admin" v={profile?.email}/>
            <Row k="API base URL" v={import.meta.env.VITE_API_URL}/>
            <Row k="Student app URL" v={import.meta.env.VITE_STUDENT_URL}/>
            <Row k="Doctor app URL" v={import.meta.env.VITE_DOCTOR_URL}/>
            <Row k="Firebase project ID" v={import.meta.env.VITE_FIREBASE_PROJECT_ID}/>
          </tbody>
        </table>
        <button onClick={refresh}
          className="mt-3 px-3 py-1.5 bg-brand text-white rounded hover:bg-brand-dark">
          Fetch backend /health
        </button>
        {health && (
          <pre className="mt-3 bg-slate-100 p-2 rounded text-xs overflow-auto">
            {JSON.stringify(health, null, 2)}
          </pre>
        )}
        {err && <div className="mt-2 text-red-600 text-sm">{err}</div>}
      </div>

      <div className="bg-white rounded-lg shadow p-4 text-sm text-slate-600">
        <p>Engagement + sleep thresholds, CSV backup path, and live-capture tuning live
           in the classroom app's <code>.env</code> (not in the backend config). Change
           them there and restart the Python capture app.</p>
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <tr>
      <td className="pr-4 py-1 text-slate-500">{k}</td>
      <td className="py-1 font-mono">{v || "—"}</td>
    </tr>
  );
}
