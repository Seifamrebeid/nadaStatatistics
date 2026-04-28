import { useEffect, useMemo, useState } from "react";
import api from "../services/api";

const v = (x) => (Array.isArray(x) ? x[0] : x);

function normalise(row) {
  const out = {};
  for (const [k, val] of Object.entries(row || {})) out[k] = v(val);
  return out;
}

export default function DoctorNotifications() {
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
    student_ids: [],
  });

  async function loadAll() {
    setErr(null);
    try {
      const [l, s, h] = await Promise.all([
        api.get("/api/lectures"),
        api.get("/api/students"),
        api.get("/api/notifications"),
      ]);
      const lectureRows = (Array.isArray(l.data) ? l.data : []).map(normalise);
      const studentRows = (Array.isArray(s.data) ? s.data : []).map(normalise);
      const historyRows = (Array.isArray(h.data) ? h.data : []).map(normalise);

      setLectures(lectureRows);
      setStudents(studentRows);
      setHistory(historyRows);
      if (!form.lecture_id && lectureRows.length > 0) {
        setForm((cur) => ({ ...cur, lecture_id: lectureRows[0].id }));
      }
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const selectedLecture = useMemo(
    () => lectures.find((l) => l.id === form.lecture_id),
    [lectures, form.lecture_id],
  );

  const enrolledIds = useMemo(() => {
    const raw = selectedLecture?.enrolled_student_ids;
    if (!Array.isArray(raw)) return [];
    return raw.flat(2).filter(Boolean);
  }, [selectedLecture]);

  const recipients = useMemo(
    () => students.filter((s) => enrolledIds.includes(s.id)),
    [students, enrolledIds],
  );

  async function sendMessage(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const payload = {
        lecture_id: form.lecture_id,
        subject: form.subject,
        body: form.body,
      };
      if (form.student_ids.length > 0) payload.student_ids = form.student_ids;
      const { data } = await api.post("/api/notifications", payload);
      setOk(`Sent to ${v(data.recipients)} recipient(s).`);
      setForm((cur) => ({ ...cur, subject: "", body: "", student_ids: [] }));
      await loadAll();
    } catch (e2) {
      setErr(e2.response?.data?.error || e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Student notifications</h1>

      <form
        onSubmit={sendMessage}
        className="bg-white rounded-lg shadow p-4 space-y-3 mb-4"
      >
        <label className="block">
          <span className="text-sm text-slate-600">Lecture</span>
          <select
            required
            value={form.lecture_id}
            onChange={(e) =>
              setForm({ ...form, lecture_id: e.target.value, student_ids: [] })
            }
            className="mt-1 w-full border rounded px-3 py-2"
          >
            {lectures.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title || l.id}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">Recipients</span>
          <div className="mt-1 border rounded p-2 max-h-44 overflow-auto space-y-1">
            {recipients.map((s) => {
              const checked = form.student_ids.includes(s.id);
              return (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const set = new Set(form.student_ids);
                      if (e.target.checked) set.add(s.id);
                      else set.delete(s.id);
                      setForm({ ...form, student_ids: Array.from(set) });
                    }}
                  />
                  {s.name || s.id}
                </label>
              );
            })}
            {recipients.length === 0 && (
              <div className="text-sm text-slate-500">
                No enrolled students found in this lecture.
              </div>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Leave all unchecked to notify all enrolled students.
          </p>
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">Subject</span>
          <input
            required
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">Message</span>
          <textarea
            required
            rows={5}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </label>

        <button
          type="submit"
          disabled={busy || !form.lecture_id}
          className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded disabled:opacity-60"
        >
          {busy ? "Sending..." : "Send notification"}
        </button>

        {ok && (
          <div className="text-sm text-green-700 bg-green-100 border border-green-200 rounded px-3 py-2">
            {ok}
          </div>
        )}
        {err && (
          <div className="text-sm text-red-700 bg-red-100 border border-red-200 rounded px-3 py-2">
            {err}
          </div>
        )}
      </form>

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="font-semibold mb-2">Recent sends</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2">When</th>
                <th className="py-2">Lecture</th>
                <th className="py-2">Subject</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b last:border-0">
                  <td className="py-2">{h.sent_at || "-"}</td>
                  <td className="py-2">{h.lecture_id || "-"}</td>
                  <td className="py-2">{h.subject || "-"}</td>
                  <td className="py-2">{h.status || "-"}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={4}>
                    No notifications sent yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
