import { useEffect, useState } from "react";
import api from "../services/api";
import CrudTable from "../components/CrudTable";
import Modal from "../components/Modal";

const v = (x) => (Array.isArray(x) ? x[0] : x);
const normalise = (row) => {
  const out = {};
  for (const [k, val] of Object.entries(row || {})) {
    // enrolled_student_ids comes through as [["id1"],["id2"]] — flatten.
    if (k === "enrolled_student_ids" && Array.isArray(val)) {
      out[k] = val.flat(2).filter(Boolean);
    } else {
      out[k] = v(val);
    }
  }
  return out;
};

export default function AdminLectures() {
  const [rows, setRows] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [students, setStudents] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [err, setErr] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [filterSubject, setFilterSubject] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterWeek, setFilterWeek] = useState("");
  const [filterDoctor, setFilterDoctor] = useState("");

  // Resolve a week_id back to its subject's owning doctor — so a lecture's
  // doctor stays consistent with the subject the week belongs to.
  function doctorForWeek(weekId) {
    const wk = weeks.find((w) => w.id === weekId);
    if (!wk) return "";
    const cls = classes.find((c) => c.id === wk.class_id);
    if (!cls) return "";
    const subj = subjects.find((s) => s.id === cls.subject_id);
    return subj?.doctor_id || "";
  }

  async function loadAll() {
    try {
      const [l, d, s, w, c, subj] = await Promise.all([
        api.get("/api/lectures"),
        api.get("/api/doctors"),
        api.get("/api/students"),
        api.get("/api/weeks"),
        api.get("/api/classes"),
        api.get("/api/subjects"),
      ]);
      setRows((Array.isArray(l.data) ? l.data : []).map(normalise));
      setDoctors((Array.isArray(d.data) ? d.data : []).map(normalise));
      setStudents((Array.isArray(s.data) ? s.data : []).map(normalise));
      setWeeks((Array.isArray(w.data) ? w.data : []).map(normalise));
      setClasses((Array.isArray(c.data) ? c.data : []).map(normalise));
      setSubjects((Array.isArray(subj.data) ? subj.data : []).map(normalise));
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    }
  }
  useEffect(() => {
    loadAll();
  }, []);

  function openCreate() {
    setForm({
      title: "",
      doctor_id: doctors[0]?.id || "",
      week_id: "",
      status: "scheduled",
      scheduled_at: "",
      enrolled_student_ids: [],
    });
    setModal("create");
  }
  function openEdit(row) {
    setForm({
      title: row.title || "",
      doctor_id: row.doctor_id || "",
      week_id: row.week_id || "",
      status: row.status || "scheduled",
      scheduled_at: row.scheduled_at || "",
      enrolled_student_ids: row.enrolled_student_ids || [],
    });
    setModal({ mode: "edit", row });
  }

  async function save() {
    try {
      if (modal === "create") {
        await api.post("/api/lectures", form);
      } else {
        await api.put(`/api/lectures/${modal.row.id}`, form);
      }
      setModal(null);
      await loadAll();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  }

  async function remove(row) {
    if (!confirm(`Delete lecture "${row.title}"?`)) return;
    try {
      await api.delete(`/api/lectures/${row.id}`);
      await loadAll();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  }

  async function regenerateReport(row) {
    try {
      await api.post(`/api/lectures/${row.id}/generate-report`);
      const { data } = await api.get(`/api/lectures/${row.id}/report`);
      const url = v(data.url);
      if (url) window.open(url, "_blank");
      else alert("Report generated — no URL returned");
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  }

  const doctorName = (id) => doctors.find((d) => d.id === id)?.name || id;
  const weekLabel = (id) => {
    const wk = weeks.find((w) => w.id === id);
    if (!wk) return id || "-";
    return `Week ${wk.week_number || "?"}${wk.title ? ` - ${wk.title}` : ""}`;
  };

  const columns = [
    { key: "id", label: "ID" },
    { key: "title", label: "Title" },
    {
      key: "doctor",
      label: "Doctor",
      render: (r) => {
        const expected = doctorForWeek(r.week_id);
        const mismatch = expected && expected !== r.doctor_id;
        return (
          <span className={mismatch ? "text-red-700" : ""} title={mismatch ? `Subject is owned by ${doctorName(expected)}` : ""}>
            {doctorName(r.doctor_id)}
            {mismatch ? " ⚠" : ""}
          </span>
        );
      },
    },
    { key: "week", label: "Week", render: (r) => weekLabel(r.week_id) },
    {
      key: "scheduled",
      label: "Scheduled",
      render: (r) =>
        r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : "-",
    },
    { key: "status", label: "Status" },
    {
      key: "finalized",
      label: "Finalized",
      render: (r) =>
        r.finalized_at ? new Date(r.finalized_at).toLocaleString() : "-",
    },
    {
      key: "count",
      label: "Enrolled",
      render: (r) => r.enrolled_student_ids?.length ?? 0,
    },
  ];

  const actions = (r) => (
    <div className="flex gap-2 justify-end">
      <button
        onClick={() => regenerateReport(r)}
        className="text-brand hover:underline"
      >
        Report
      </button>
      <button
        onClick={() => openEdit(r)}
        className="text-slate-700 hover:underline"
      >
        Edit
      </button>
      <button
        onClick={() => remove(r)}
        className="text-red-600 hover:underline"
      >
        Delete
      </button>
    </div>
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Lectures</h1>
        <button
          onClick={openCreate}
          className="btn-primary"
        >
          + New lecture
        </button>
      </div>
      {err && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg">
          {err}
        </div>
      )}
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded p-3">
        <label className="block">
          <span className="text-xs text-slate-600">Subject</span>
          <select
            value={filterSubject}
            onChange={(e) => {
              setFilterSubject(e.target.value);
              setFilterClass("");
              setFilterWeek("");
            }}
            className="mt-1 block w-full border rounded px-3 py-2 text-sm"
          >
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-600">Class</span>
          <select
            value={filterClass}
            onChange={(e) => { setFilterClass(e.target.value); setFilterWeek(""); }}
            className="mt-1 block w-full border rounded px-3 py-2 text-sm"
          >
            <option value="">All classes</option>
            {(filterSubject ? classes.filter((c) => c.subject_id === filterSubject) : classes).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-600">Week</span>
          <select
            value={filterWeek}
            onChange={(e) => setFilterWeek(e.target.value)}
            className="mt-1 block w-full border rounded px-3 py-2 text-sm"
          >
            <option value="">All weeks</option>
            {Array.from({ length: 16 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={String(n)}>Week {n}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-600">Doctor</span>
          <select
            value={filterDoctor}
            onChange={(e) => setFilterDoctor(e.target.value)}
            className="mt-1 block w-full border rounded px-3 py-2 text-sm"
          >
            <option value="">All doctors</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
      </div>
      <CrudTable
        rows={rows.filter((r) => {
          const wk = weeks.find((w) => w.id === r.week_id);
          const cls = wk ? classes.find((c) => c.id === wk.class_id) : null;
          if (filterSubject && (!cls || cls.subject_id !== filterSubject)) return false;
          if (filterClass && (!cls || cls.id !== filterClass)) return false;
          if (filterWeek && (!wk || String(wk.week_number) !== String(filterWeek))) return false;
          if (filterDoctor && r.doctor_id !== filterDoctor) return false;
          return true;
        })}
        columns={columns}
        actions={actions}
      />

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={
          modal === "create"
            ? "Create lecture"
            : `Edit ${modal?.row?.title || ""}`
        }
        footer={
          <>
            <button
              onClick={() => setModal(null)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="btn-primary"
            >
              Save
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm text-slate-600">Title</span>
            <input
              value={form.title ?? ""}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">Doctor</span>
            <select
              value={form.doctor_id ?? ""}
              onChange={(e) => setForm({ ...form, doctor_id: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.id})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">Week</span>
            <select
              value={form.week_id ?? ""}
              onChange={(e) => {
                const week_id = e.target.value;
                const auto = doctorForWeek(week_id);
                setForm({
                  ...form,
                  week_id,
                  doctor_id: auto || form.doctor_id,
                });
              }}
              className="mt-1 w-full border rounded px-3 py-2"
            >
              <option value="">Select week...</option>
              {weeks.map((w) => {
                const cls = classes.find((c) => c.id === w.class_id);
                const subj = subjects.find((s) => s.id === cls?.subject_id);
                const ctx = subj && cls ? `${subj.name} / ${cls.name} — ` : "";
                return (
                  <option key={w.id} value={w.id}>
                    {ctx}Week {w.week_number || "?"}
                    {w.title ? ` - ${w.title}` : ""}
                  </option>
                );
              })}
            </select>
            {form.week_id && (
              <span className="text-xs text-slate-500 mt-1 block">
                Doctor auto-set from this week's subject. Override below if needed.
              </span>
            )}
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">Status</span>
            <select
              value={form.status ?? ""}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
            >
              <option value="scheduled">scheduled</option>
              <option value="recording">recording</option>
              <option value="finished">finished</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">Scheduled at</span>
            <input
              type="datetime-local"
              value={toDateTimeLocal(form.scheduled_at)}
              onChange={(e) =>
                setForm({
                  ...form,
                  scheduled_at: fromDateTimeLocal(e.target.value),
                })
              }
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </label>
          <div>
            <div className="text-sm text-slate-600 mb-1">Enrolled students</div>
            <div className="border rounded p-2 max-h-40 overflow-auto space-y-1">
              {students.map((s) => {
                const checked = (form.enrolled_student_ids || []).includes(
                  s.id,
                );
                return (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const cur = new Set(form.enrolled_student_ids || []);
                        if (e.target.checked) cur.add(s.id);
                        else cur.delete(s.id);
                        setForm({
                          ...form,
                          enrolled_student_ids: Array.from(cur),
                        });
                      }}
                    />
                    {s.name} <span className="text-slate-400">({s.id})</span>
                  </label>
                );
              })}
              {students.length === 0 && (
                <div className="text-slate-500 text-sm">
                  No students yet — create one on the Students tab.
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function toDateTimeLocal(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDateTimeLocal(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}
