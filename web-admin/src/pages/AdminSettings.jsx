import { useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";

export default function AdminSettings() {
  const { profile } = useAuth();
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState(null);
  const [checking, setChecking] = useState(false);

  async function checkConnectivity() {
    setChecking(true);
    setStatus(null);
    setErr(null);
    try {
      // Attempt a lightweight Firestore read to verify connectivity.
      await getDoc(doc(db, "_health", "ping"));
      setStatus("Connected to Firebase");
    } catch (e) {
      // A "not-found" error still means we reached Firestore successfully.
      if (e.code === "not-found" || e.message?.includes("No document")) {
        setStatus("Connected to Firebase");
      } else {
        setErr(e.message);
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Settings</h1>
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <h2 className="font-semibold mb-2">Environment</h2>
        <table className="text-sm">
          <tbody>
            <Row k="Admin" v={profile?.email} />
            <Row k="Firebase project ID" v="fridgechef-jt50c" />
            <Row k="Student app URL" v={import.meta.env.VITE_STUDENT_URL} />
            <Row k="Doctor app URL" v={import.meta.env.VITE_DOCTOR_URL} />
          </tbody>
        </table>
        <button
          onClick={checkConnectivity}
          disabled={checking}
          className="mt-3 px-3 py-1.5 bg-brand text-white rounded hover:bg-brand-dark disabled:opacity-50"
        >
          {checking ? "Checking…" : "Check Firebase connectivity"}
        </button>
        {status && (
          <div className="mt-3 px-3 py-2 bg-emerald-50 border border-emerald-300 text-emerald-800 text-sm rounded">
            {status}
          </div>
        )}
        {err && (
          <div className="mt-2 text-red-600 text-sm">{err}</div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-4 text-sm text-slate-600">
        <p>
          Engagement + sleep thresholds, CSV backup path, and live-capture
          tuning live in the classroom app's <code>.env</code> (not in the
          backend config). Change them there and restart the Python capture app.
        </p>
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
