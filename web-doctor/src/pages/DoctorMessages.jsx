import { useEffect, useMemo, useState } from "react";
import api from "../services/api";

const v = (x) => (Array.isArray(x) ? x[0] : x);

function normalise(row) {
  const out = {};
  for (const [k, val] of Object.entries(row || {})) out[k] = v(val);
  return out;
}

export default function DoctorMessages() {
  const [lectures, setLectures] = useState([]);
  const [students, setStudents] = useState([]);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(null);
  const [form, setForm] = useState({
    lecture_id: "",
    subject: "",
    body: "",
    selected_students: [],
  });

  // Fetch lectures and notifications history
  useEffect(() => {
    const fetch = async () => {
      try {
        const lecturesRes = await api.get("/api/lectures");
        const historyRes = await api.get("/api/notifications");
        setLectures(lecturesRes.data || []);
        setHistory((historyRes.data || []).map(normalise));
      } catch (err) {
        setErr(err.message);
      }
    };
    fetch();
  }, []);

  // Fetch students for selected lecture
  useEffect(() => {
    if (!form.lecture_id) return;
    const fetch = async () => {
      try {
        const res = await api.get(`/api/lectures/${form.lecture_id}`);
        const lecture = normalise(res.data);
        // Assume lecture has enrolled_student_ids; fetch them
        const studentsRes = await api.get("/api/students");
        setStudents((studentsRes.data || []).map(normalise));
      } catch (err) {
        setErr(err.message);
      }
    };
    fetch();
  }, [form.lecture_id]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!form.lecture_id || !form.subject || !form.body) {
      setErr("Please fill in all fields");
      return;
    }

    try {
      setBusy(true);
      const payload = {
        lecture_id: form.lecture_id,
        subject: form.subject,
        body: form.body,
      };
      if (form.selected_students.length > 0) {
        payload.student_ids = form.selected_students;
      }

      await api.post("/api/notifications", payload);
      setOk("Message sent successfully!");
      setForm({
        lecture_id: form.lecture_id,
        subject: "",
        body: "",
        selected_students: [],
      });

      // Refresh history
      const historyRes = await api.get("/api/notifications");
      setHistory((historyRes.data || []).map(normalise));
    } catch (err) {
      setErr(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Messages</h1>

      {err && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
          {err}
        </div>
      )}
      {ok && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded">
          {ok}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Compose */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Compose Message</h2>
          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Lecture:</label>
              <select
                value={form.lecture_id}
                onChange={(e) =>
                  setForm({
                    ...form,
                    lecture_id: e.target.value,
                    selected_students: [],
                  })
                }
                className="w-full border rounded px-3 py-2"
              >
                <option value="">-- Select Lecture --</option>
                {lectures.map((lec) => (
                  <option key={v(lec.id)} value={v(lec.id)}>
                    {v(lec.title)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Subject:</label>
              <input
                type="text"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className="w-full border rounded px-3 py-2"
                placeholder="Email subject"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Message:</label>
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                className="w-full border rounded px-3 py-2 h-32"
                placeholder="Message body"
              />
            </div>

            {students.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Select Students (leave blank to send to all):
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto border rounded p-2">
                  {students.map((student) => (
                    <label key={v(student.id)} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={form.selected_students.includes(v(student.id))}
                        onChange={(e) => {
                          const id = v(student.id);
                          setForm({
                            ...form,
                            selected_students: e.target.checked
                              ? [...form.selected_students, id]
                              : form.selected_students.filter(
                                  (sid) => sid !== id,
                                ),
                          });
                        }}
                        className="mr-2"
                      />
                      {v(student.name)}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send Message"}
            </button>
          </form>
        </div>

        {/* History */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Sent Messages</h2>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {history.length > 0 ? (
              history.map((notif) => (
                <div
                  key={v(notif.id)}
                  className="border-l-4 border-blue-400 pl-3 py-2"
                >
                  <div className="font-medium text-sm">{v(notif.subject)}</div>
                  <div className="text-xs text-gray-600">
                    {new Date(v(notif.created_at)).toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">
                    Status: {v(notif.status)}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-gray-500">No sent messages yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
