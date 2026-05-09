import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

export default function DoctorNotifications() {
  const [lectures, setLectures] = useState([]);
  const [students, setStudents] = useState([]);
  const [err, setErr] = useState(null);
  const [selectedLectureId, setSelectedLectureId] = useState("");

  async function loadAll() {
    setErr(null);
    try {
      const [lSnap, sSnap] = await Promise.all([
        getDocs(collection(db, "lectures")),
        getDocs(collection(db, "students")),
      ]);
      const lectureRows = lSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const studentRows = sSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      setLectures(lectureRows);
      setStudents(studentRows);
      if (!selectedLectureId && lectureRows.length > 0) {
        setSelectedLectureId(lectureRows[0].id);
      }
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const selectedLecture = useMemo(
    () => lectures.find((l) => l.id === selectedLectureId),
    [lectures, selectedLectureId],
  );

  const enrolledIds = useMemo(() => {
    const raw = selectedLecture?.enrolled_student_ids;
    if (!Array.isArray(raw)) return [];
    return raw.filter(Boolean);
  }, [selectedLecture]);

  const recipients = useMemo(
    () => students.filter((s) => enrolledIds.includes(s.id)),
    [students, enrolledIds],
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Student notifications</h1>

      {err && (
        <div className="text-sm text-red-700 bg-red-100 border border-red-200 rounded px-3 py-2 mb-4">
          {err}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4 space-y-3 mb-4">
        <label className="block">
          <span className="text-sm text-slate-600">Lecture</span>
          <select
            value={selectedLectureId}
            onChange={(e) => setSelectedLectureId(e.target.value)}
            className="mt-1 w-full border rounded px-3 py-2"
          >
            {lectures.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title || l.id}
              </option>
            ))}
          </select>
        </label>

        <div>
          <div className="text-sm text-slate-600 mb-1">Enrolled students</div>
          <div className="border rounded p-2 max-h-44 overflow-auto space-y-1">
            {recipients.map((s) => (
              <div key={s.id} className="text-sm text-slate-700 py-0.5">
                {s.name || s.id}
              </div>
            ))}
            {recipients.length === 0 && (
              <div className="text-sm text-slate-500">
                No enrolled students found in this lecture.
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Notifications are sent via the backend classroom app. This view shows
          enrolled students for reference.
        </p>
      </div>
    </div>
  );
}
