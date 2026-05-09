import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";

export default function StudentLectures() {
  const { profile } = useAuth();
  const [lectures, setLectures] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!profile?.linked_id) return;
    getDocs(
      query(
        collection(db, "lectures"),
        where("enrolled_student_ids", "array-contains", profile.linked_id),
      ),
    )
      .then((snap) =>
        setLectures(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      )
      .catch((e) => setErr(e.message));
  }, [profile?.linked_id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My lectures</h1>
        <p className="text-sm text-slate-500 mt-1">
          Your enrolled lectures, reports, and transcript access.
        </p>
      </div>

      {err && <div className="text-red-600 p-4 bg-red-50 rounded">{err}</div>}

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                Title
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                Date
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                Doctor
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                Status
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lectures.map((lecture) => (
              <tr key={lecture.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm">
                  {lecture.title || lecture.id}
                </td>
                <td className="px-6 py-4 text-sm">
                  {lecture.date
                    ? new Date(lecture.date).toLocaleString()
                    : "-"}
                </td>
                <td className="px-6 py-4 text-sm">
                  {lecture.doctor_id || "—"}
                </td>
                <td className="px-6 py-4 text-sm">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      lecture.status === "recording"
                        ? "bg-red-100 text-red-800"
                        : lecture.status === "finished"
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {lecture.status || "scheduled"}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm space-x-2">
                  {lecture.report_pdf_url && (
                    <a
                      href={lecture.report_pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand hover:underline"
                    >
                      Report
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lectures.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No enrolled lectures yet.
        </div>
      )}
    </div>
  );
}
