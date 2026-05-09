import { useEffect, useMemo, useState } from "react";
import {
  collection, getDocs, addDoc, updateDoc, doc,
  serverTimestamp, query, where,
} from "firebase/firestore";
import { RefreshCw } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import Modal from "../components/Modal";

const STATUS_COLOR = {
  scheduled: "bg-slate-100 text-slate-700",
  recording:  "bg-red-100 text-red-700",
  finished:   "bg-green-100 text-green-700",
};

function fmtDate(v) {
  if (!v) return "—";
  try {
    const d = v?.toDate ? v.toDate() : new Date(v);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch { return "—"; }
}

export default function DoctorLectures() {
  const { profile } = useAuth();

  const [lectures, setLectures]   = useState([]);
  const [weeks, setWeeks]         = useState([]);
  const [classes, setClasses]     = useState([]);
  const [subjects, setSubjects]   = useState([]);
  const [students, setStudents]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState(null);
  const [busy, setBusy]           = useState(false);
  const [modal, setModal]         = useState(null);
  const [form, setForm]           = useState({});

  // filters
  const [fSubject, setFSubject] = useState("");
  const [fClass,   setFClass]   = useState("");
  const [fWeek,    setFWeek]    = useState("");
  const [fStatus,  setFStatus]  = useState("");
  const [fSearch,  setFSearch]  = useState("");

  const doctorId = profile?.linked_id;

  async function fetchData() {
    setLoading(true); setErr(null);
    try {
      const [lecSnap, weeksSnap, classesSnap, subjectsSnap, studSnap] = await Promise.all([
        doctorId
          ? getDocs(query(collection(db, "lectures"), where("doctor_id", "==", doctorId)))
          : getDocs(collection(db, "lectures")),
        getDocs(collection(db, "weeks")),
        getDocs(collection(db, "classes")),
        getDocs(collection(db, "subjects")),
        getDocs(collection(db, "students")),
      ]);
      setLectures(lecSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setWeeks(weeksSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setClasses(classesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setSubjects(subjectsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setStudents(studSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [doctorId]);

  // lookup maps
  const weekById    = useMemo(() => Object.fromEntries(weeks.map((w) => [w.id, w])), [weeks]);
  const classById   = useMemo(() => Object.fromEntries(classes.map((c) => [c.id, c])), [classes]);
  const subjectById = useMemo(() => Object.fromEntries(subjects.map((s) => [s.id, s])), [subjects]);

  // filter cascades
  const mySubjects = useMemo(
    () => doctorId ? subjects.filter((s) => s.doctor_id === doctorId) : subjects,
    [subjects, doctorId],
  );
  const classesForSubject = useMemo(
    () => fSubject ? classes.filter((c) => c.subject_id === fSubject) : [],
    [classes, fSubject],
  );
  const weekNumbers = useMemo(() => {
    const nums = [...new Set(weeks.map((w) => w.week_number).filter(Boolean))].sort((a, b) => a - b);
    return nums;
  }, [weeks]);

  // filtered rows
  const filtered = useMemo(() => {
    let list = lectures;
    if (fSubject) list = list.filter((l) => l.subject_id === fSubject);
    if (fClass)   list = list.filter((l) => l.class_id   === fClass);
    if (fWeek)    list = list.filter((l) => {
      const w = weekById[l.week_id];
      return w && String(w.week_number) === fWeek;
    });
    if (fStatus)  list = list.filter((l) => l.status === fStatus);
    if (fSearch)  list = list.filter((l) =>
      (l.title || "").toLowerCase().includes(fSearch.toLowerCase()),
    );
    return list.sort((a, b) => {
      const wa = weekById[a.week_id]?.week_number ?? 0;
      const wb = weekById[b.week_id]?.week_number ?? 0;
      return wa - wb;
    });
  }, [lectures, fSubject, fClass, fWeek, fStatus, fSearch, weekById]);

  function resetFilters() {
    setFSubject(""); setFClass(""); setFWeek(""); setFStatus(""); setFSearch("");
  }

  // ── modal helpers ────────────────────────────────────────────────────────────
  function openCreate() {
    setForm({ title: "", week_id: "", status: "scheduled", enrolled_student_ids: [] });
    setModal("create");
  }
  function openEdit(row) {
    setForm({
      title:                row.title || "",
      week_id:              row.week_id || "",
      status:               row.status || "scheduled",
      enrolled_student_ids: row.enrolled_student_ids || [],
    });
    setModal({ mode: "edit", row });
  }
  async function save() {
    try {
      if (modal === "create") {
        await addDoc(collection(db, "lectures"), {
          ...form, doctor_id: doctorId || null, created_at: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, "lectures", modal.row.id), form);
      }
      setModal(null);
      await fetchData();
    } catch (e) { alert(e.message); }
  }
  async function handleDelete(id) {
    if (!window.confirm("Delete this lecture?")) return;
    try {
      setBusy(true);
      await updateDoc(doc(db, "lectures", id), { active: false });
      setLectures((prev) => prev.filter((l) => l.id !== id));
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  // weeks for the modal select — group nicely
  const modalWeeks = useMemo(
    () => weeks
      .filter((w) => {
        if (!form.week_id) return true;
        const cls = classById[w.class_id];
        return cls && cls.subject_id === (form.subject_id || cls.subject_id);
      })
      .sort((a, b) => (a.week_number ?? 0) - (b.week_number ?? 0)),
    [weeks, classById, form.subject_id, form.week_id],
  );

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Lectures</h1>
            <p className="mt-1 text-sm text-slate-500">
              {filtered.length} of {lectures.length} lectures
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={fetchData} disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              + New lecture
            </button>
          </div>
        </div>

        {/* filter row */}
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Search title…"
            value={fSearch}
            onChange={(e) => setFSearch(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-44"
          />
          <select value={fSubject} onChange={(e) => { setFSubject(e.target.value); setFClass(""); }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">All subjects</option>
            {mySubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={fClass} onChange={(e) => setFClass(e.target.value)}
            disabled={!fSubject}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400">
            <option value="">All classes</option>
            {classesForSubject.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={fWeek} onChange={(e) => setFWeek(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">All weeks</option>
            {weekNumbers.map((n) => <option key={n} value={String(n)}>Week {n}</option>)}
          </select>
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="recording">Recording</option>
            <option value="finished">Finished</option>
          </select>
          {(fSubject || fClass || fWeek || fStatus || fSearch) && (
            <button onClick={resetFilters}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
              Clear filters
            </button>
          )}
        </div>

        {err && <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{err}</div>}
      </div>

      {/* table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3 text-center">Week</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Students</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lec) => {
                const week = weekById[lec.week_id];
                const cls  = classById[lec.class_id];
                const subj = subjectById[lec.subject_id];
                return (
                  <tr key={lec.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{lec.title || "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{subj?.name || "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{cls?.name || "—"}</td>
                    <td className="px-4 py-3 text-center text-slate-700">
                      {week ? `Week ${week.week_number}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(lec.scheduled_start || lec.date)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[lec.status] || "bg-slate-100 text-slate-600"}`}>
                        {lec.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-700">
                      {(lec.enrolled_student_ids || []).length}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button onClick={() => openEdit(lec)} className="text-slate-600 hover:underline text-xs">Edit</button>
                      <button onClick={() => handleDelete(lec.id)} disabled={busy}
                        className="text-red-600 hover:underline text-xs disabled:opacity-50">Delete</button>
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No lectures match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* edit / create modal */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === "create" ? "New lecture" : `Edit — ${modal?.row?.title || ""}`}
        footer={
          <>
            <button onClick={() => setModal(null)} className="px-3 py-1.5 border rounded text-sm">Cancel</button>
            <button onClick={save} className="px-3 py-1.5 bg-brand-600 text-white rounded text-sm">Save</button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-slate-600">Title</span>
            <input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Week</span>
            <select value={form.week_id ?? ""} onChange={(e) => setForm({ ...form, week_id: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2 text-sm">
              <option value="">Select week…</option>
              {modalWeeks.map((w) => {
                const cls  = classById[w.class_id];
                const subj = subjectById[cls?.subject_id];
                return (
                  <option key={w.id} value={w.id}>
                    Week {w.week_number} — {subj?.name || "?"} ({cls?.section || cls?.name || "?"})
                  </option>
                );
              })}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Status</span>
            <select value={form.status ?? "scheduled"} onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2 text-sm">
              <option value="scheduled">Scheduled</option>
              <option value="recording">Recording</option>
              <option value="finished">Finished</option>
            </select>
          </label>
          <div>
            <div className="mb-1 text-sm text-slate-600">Enrolled students</div>
            <div className="border rounded p-2 max-h-40 overflow-auto space-y-1">
              {students.map((s) => {
                const checked = (form.enrolled_student_ids || []).includes(s.id);
                return (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={checked}
                      onChange={(e) => {
                        const cur = new Set(form.enrolled_student_ids || []);
                        if (e.target.checked) cur.add(s.id); else cur.delete(s.id);
                        setForm({ ...form, enrolled_student_ids: Array.from(cur) });
                      }} />
                    {s.name || s.id}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
