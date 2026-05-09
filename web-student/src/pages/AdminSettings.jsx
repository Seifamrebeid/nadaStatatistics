import { useAuth } from "../context/AuthContext";

export default function AdminSettings() {
  const { profile } = useAuth();

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Settings</h1>
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <h2 className="font-semibold mb-2">Environment</h2>
        <table className="text-sm">
          <tbody>
            <Row k="Email" v={profile?.email} />
            <Row k="Student app URL" v={import.meta.env.VITE_STUDENT_URL} />
            <Row k="Doctor app URL" v={import.meta.env.VITE_DOCTOR_URL} />
            <Row
              k="Firebase project ID"
              v={import.meta.env.VITE_FIREBASE_PROJECT_ID}
            />
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-lg shadow p-4 text-sm text-slate-600">
        <p>
          Engagement and sleep thresholds, CSV backup path, and live-capture
          tuning live in the classroom app's <code>.env</code>. Change them
          there and restart the Python capture app.
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
