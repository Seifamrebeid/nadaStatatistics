import { useEffect, useState } from "react";
import api from "../services/api";

const v = (x) => (Array.isArray(x) ? x[0] : x);

export default function StudentLectures() {
  const [lectures, setLectures] = useState([]);
  const [doctorMap, setDoctorMap] = useState({});
  const [err, setErr] = useState(null);

  useEffect(() => {
    Promise.all([api.get("/api/lectures"), api.get("/api/doctors")])
      .then(([l, d]) => {
        const lectureRows = (Array.isArray(l.data) ? l.data : []).map(
          normalise,
        );
        const doctorRows = (Array.isArray(d.data) ? d.data : []).map(normalise);
        const map = {};
        for (const doc of doctorRows) map[doc.id] = doc.name || doc.id;
        setDoctorMap(map);
        setLectures(lectureRows);
      })
      .catch((e) => setErr(e.response?.data?.error || e.message));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">My lectures</h1>
      {err && (
        <div className="mb-4 px-3 py-2 bg-red-100 text-red-900 rounded text-sm">
          {err}
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-3">Title</th>
              <th className="text-left px-4 py-3">Doctor</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Lecture ID</th>
            </tr>
          </thead>
          <tbody>
            {lectures.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="px-4 py-3">{l.title || l.id}</td>
                <td className="px-4 py-3">
                  {doctorMap[l.doctor_id] || l.doctor_id || "-"}
                </td>
                <td className="px-4 py-3">{l.status || "scheduled"}</td>
                <td className="px-4 py-3 font-mono text-xs">{l.id}</td>
              </tr>
            ))}
            {lectures.length === 0 && (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={4}>
                  No enrolled lectures found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function normalise(row) {
  const out = {};
  for (const [k, val] of Object.entries(row || {})) out[k] = v(val);
  return out;
}
