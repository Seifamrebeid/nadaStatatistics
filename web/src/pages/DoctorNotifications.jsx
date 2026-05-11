import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import FilterBar, { makeFilter } from "../components/FilterBar";
import { sendBrevoEmail, brevoConfigured } from "../lib/brevo";

const historyFilter = makeFilter({
  search: { fields: ["subject", "lecture_id"] },
  selects: [
    { key: "status", field: "status" },
    { key: "lecture_id", field: "lecture_id" },
  ],
  dateRange: { key: "sent_at" },
});

export default function DoctorNotifications() {
  const { profile } = useAuth();
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
  const [historyFilters, setHistoryFilters] = useState({
    search: "",
    status: "",
    lecture_id: "",
    dateFrom: "",
    dateTo: "",
  });

  const filteredHistory = useMemo(
    () => history.filter(historyFilter(historyFilters)),
    [history, historyFilters],
  );

  const statusOptions = useMemo(
    () =>
      Array.from(new Set(history.map((h) => h.status).filter(Boolean))).sort(),
    [history],
  );

  async function loadAll() {
    setErr(null);
    try {
      const doctorId = profile?.linked_id;

      let lectureSnap;
      if (doctorId) {
        lectureSnap = await getDocs(
          query(collection(db, "lectures"), where("doctor_id", "==", doctorId))
        );
      } else {
        lectureSnap = await getDocs(collection(db, "lectures"));
      }
      const lectureRows = lectureSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const studentsSnap = await getDocs(collection(db, "students"));
      const studentRows = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      let historySnap;
      if (doctorId) {
        historySnap = await getDocs(
          query(collection(db, "notifications"), where("sender_doctor_id", "==", doctorId))
        );
      } else {
        historySnap = await getDocs(collection(db, "notifications"));
      }
      const historyRows = historySnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      setLectures(lectureRows);
      setStudents(studentRows);
      setHistory(historyRows);
      if (!form.lecture_id && lectureRows.length > 0) {
        setForm((cur) => ({ ...cur, lecture_id: lectureRows[0].id }));
      }
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    loadAll();
  }, [profile]);

  const selectedLecture = useMemo(
    () => lectures.find((l) => l.id === form.lecture_id),
    [lectures, form.lecture_id],
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

  async function sendMessage(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const doctorId = profile?.linked_id;
      const selectedStudentIds =
        form.student_ids.length > 0 ? form.student_ids : enrolledIds;
      const selectedStudents = students.filter((s) =>
        selectedStudentIds.includes(s.id)
      );
      const recipientEmails = selectedStudents
        .map((s) => s.email)
        .filter(Boolean);

      // Fire the actual email via Brevo (browser-side fetch).
      const result = await sendBrevoEmail({
        recipients: "nadasoska2005@gmail.com",
        subject: form.subject,
        body: form.body,
      });

      // Audit row — always written, with the real send status from Brevo.
      await addDoc(collection(db, "notifications"), {
        sender_doctor_id: doctorId || null,
        lecture_id: form.lecture_id || null,
        recipient_student_ids: selectedStudentIds,
        recipient_emails: recipientEmails,
        subject: form.subject,
        body: form.body,
        sent_at: serverTimestamp(),
        status: result.status,                // "sent" | "stub" | "failed"
        brevo_message_id: result.messageId,
        error: result.error,
      });

      if (result.ok) {
        setOk(`Email sent to ${recipientEmails.length} recipient(s) via Brevo.`);
      } else if (result.status === "stub") {
        setOk(`Audit row written. ${result.error}`);
      } else {
        setErr(`Brevo send failed: ${result.error}`);
      }
      setForm((cur) => ({ ...cur, subject: "", body: "", student_ids: [] }));
      await loadAll();
    } catch (e2) {
      setErr(e2.message);
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
          {busy ? "Saving..." : "Send notification"}
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

        <FilterBar
          value={historyFilters}
          onChange={setHistoryFilters}
          onReset={() =>
            setHistoryFilters({ search: "", status: "", lecture_id: "", dateFrom: "", dateTo: "" })
          }
          searchPlaceholder="Search subject..."
          selects={[
            {
              key: "lecture_id",
              label: "Lecture",
              options: lectures.map((l) => ({ value: l.id, label: l.title || l.id })),
            },
            { key: "status", label: "Status", options: statusOptions },
          ]}
          dateRange={{ key: "sent_at" }}
          total={history.length}
          shown={filteredHistory.length}
        />

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
              {filteredHistory.map((h) => {
                const sentAt = h.sent_at?.toDate
                  ? h.sent_at.toDate().toLocaleString()
                  : h.sent_at || "-";
                return (
                  <tr key={h.id} className="border-b last:border-0">
                    <td className="py-2">{sentAt}</td>
                    <td className="py-2">{h.lecture_id || "-"}</td>
                    <td className="py-2">{h.subject || "-"}</td>
                    <td className="py-2">{h.status || "-"}</td>
                  </tr>
                );
              })}
              {filteredHistory.length === 0 && (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={4}>
                    {history.length === 0
                      ? "No notifications sent yet."
                      : "No notifications match the current filters."}
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
