import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  doc,
  getDoc,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import FilterBar, { makeFilter } from "../components/FilterBar";

const messageFilter = makeFilter({
  search: { fields: ["subject", "body", "lecture_id"] },
  selects: [{ key: "status", field: "status" }],
  dateRange: { key: "sent_at" },
});

export default function DoctorMessages() {
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
    selected_students: [],
  });
  const [historyFilters, setHistoryFilters] = useState({
    search: "",
    status: "",
    dateFrom: "",
    dateTo: "",
  });

  const filteredHistory = useMemo(
    () => history.filter(messageFilter(historyFilters)),
    [history, historyFilters],
  );

  const statusOptions = useMemo(
    () =>
      Array.from(new Set(history.map((h) => h.status).filter(Boolean))).sort(),
    [history],
  );

  async function loadLecturesAndHistory() {
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
      setHistory(historyRows);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    loadLecturesAndHistory();
  }, [profile]);

  // Fetch students for the selected lecture
  useEffect(() => {
    if (!form.lecture_id) return;
    const fetchStudents = async () => {
      try {
        const lectureDoc = await getDoc(doc(db, "lectures", form.lecture_id));
        const lectureData = lectureDoc.exists() ? lectureDoc.data() : {};
        const enrolledIds = lectureData.enrolled_student_ids || [];

        if (enrolledIds.length > 0) {
          // Fetch only enrolled students
          const snap = await getDocs(collection(db, "students"));
          const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setStudents(all.filter((s) => enrolledIds.includes(s.id)));
        } else {
          const snap = await getDocs(collection(db, "students"));
          setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      } catch (e) {
        setErr(e.message);
      }
    };
    fetchStudents();
  }, [form.lecture_id]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!form.lecture_id || !form.subject || !form.body) {
      setErr("Please fill in all fields");
      return;
    }

    try {
      setBusy(true);
      const doctorId = profile?.linked_id;
      const selectedStudentIds =
        form.selected_students.length > 0
          ? form.selected_students
          : students.map((s) => s.id);
      const selectedStudents = students.filter((s) =>
        selectedStudentIds.includes(s.id)
      );

      await addDoc(collection(db, "notifications"), {
        sender_doctor_id: doctorId || null,
        lecture_id: form.lecture_id || null,
        recipient_student_ids: selectedStudentIds,
        recipient_emails: selectedStudents.map((s) => s.email),
        subject: form.subject,
        body: form.body,
        sent_at: serverTimestamp(),
        status: "sent",
      });

      setOk("Notification saved. Email delivery requires R backend.");
      setForm({
        lecture_id: form.lecture_id,
        subject: "",
        body: "",
        selected_students: [],
      });

      await loadLecturesAndHistory();
    } catch (e) {
      setErr(e.message);
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
                  <option key={lec.id} value={lec.id}>
                    {lec.title}
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
                    <label key={student.id} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={form.selected_students.includes(student.id)}
                        onChange={(e) => {
                          const id = student.id;
                          setForm({
                            ...form,
                            selected_students: e.target.checked
                              ? [...form.selected_students, id]
                              : form.selected_students.filter((sid) => sid !== id),
                          });
                        }}
                        className="mr-2"
                      />
                      {student.name}
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
              {busy ? "Saving…" : "Send Message"}
            </button>
          </form>
        </div>

        {/* History */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Sent Messages</h2>
          <FilterBar
            value={historyFilters}
            onChange={setHistoryFilters}
            onReset={() =>
              setHistoryFilters({ search: "", status: "", dateFrom: "", dateTo: "" })
            }
            searchPlaceholder="Search subject or body..."
            selects={[{ key: "status", label: "Status", options: statusOptions }]}
            dateRange={{ key: "sent_at" }}
            total={history.length}
            shown={filteredHistory.length}
          />
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {filteredHistory.length > 0 ? (
              filteredHistory.map((notif) => {
                const sentAt = notif.sent_at?.toDate
                  ? notif.sent_at.toDate().toLocaleString()
                  : notif.sent_at
                    ? new Date(notif.sent_at).toLocaleString()
                    : "-";
                return (
                  <div
                    key={notif.id}
                    className="border-l-4 border-blue-400 pl-3 py-2"
                  >
                    <div className="font-medium text-sm">{notif.subject}</div>
                    <div className="text-xs text-gray-600">{sentAt}</div>
                    <div className="text-xs text-gray-500">
                      Status: {notif.status}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-gray-500">
                {history.length === 0
                  ? "No sent messages yet."
                  : "No messages match the current filters."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
