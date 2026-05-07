import { useEffect, useState } from "react";
import api from "../services/api";
import CrudTable from "../components/CrudTable";
import Modal from "../components/Modal";

const v = (x) => (Array.isArray(x) ? x[0] : x);
const normalise = (row) => {
  const out = {};
  for (const [k, val] of Object.entries(row || {})) out[k] = v(val);
  return out;
};

export default function AdminWeeks() {
  const [rows, setRows] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [err, setErr] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});

  // Filters — required so the table never renders all 240 weeks at once.
  const [filterSubject, setFilterSubject] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterWeek, setFilterWeek] = useState("1");

  async function load() {
    try {
      const [weeksRes, classesRes, subjectsRes, lecturesRes] = await Promise.all([
        api.get("/api/weeks"),
        api.get("/api/classes"),
        api.get("/api/subjects"),
        api.get("/api/lectures"),
      ]);
      const weeksList = Array.isArray(weeksRes.data) ? weeksRes.data : [];
      const classesList = Array.isArray(classesRes.data) ? classesRes.data : [];
      const subjectsList = Array.isArray(subjectsRes.data) ? subjectsRes.data : [];
      const lecturesList = Array.isArray(lecturesRes.data)
        ? lecturesRes.data
        : [];
      setRows(weeksList.map(normalise));
      setClasses(classesList.map(normalise));
      setSubjects(subjectsList.map(normalise));
      setLectures(lecturesList.map(normalise));
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setForm({
      class_id: "",
      week_number: 1,
      title: "",
      date: "",
      lecture_id: "",
      status: "planned",
      notes: "",
    });
    setModal("create");
  }

  function openEdit(row) {
    setForm({
      class_id: row.class_id || "",
      week_number: row.week_number || 1,
      title: row.title || "",
      date: row.date || "",
      lecture_id: row.lecture_id || "",
      status: row.status || "planned",
      notes: row.notes || "",
      active: row.active !== false,
    });
    setModal({ mode: "edit", row });
  }

  async function save() {
    try {
      const payload = {
        class_id: form.class_id,
        week_number: parseInt(form.week_number, 10),
        title: form.title,
        date: form.date,
        lecture_id: form.lecture_id,
        status: form.status,
        notes: form.notes,
      };

      if (modal === "create") {
        await api.post("/api/weeks", payload);
      } else {
        await api.put(`/api/weeks/${modal.row.id}`, {
          ...payload,
          active: !!form.active,
        });
        setModal(null);
      }
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  }

  async function remove(row) {
    if (!confirm(`Soft-delete week ${row.week_number}?`)) return;
    try {
      await api.delete(`/api/weeks/${row.id}`);
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  }

  const columns = [
    {
      key: "class_id",
      label: "Class",
      render: (r) => {
        const cls = classes.find((c) => c.id === r.class_id);
        return cls?.name || "—";
      },
    },
    { key: "week_number", label: "Week #" },
    { key: "title", label: "Title" },
    {
      key: "date",
      label: "Scheduled Date",
      render: (r) => (r.date ? new Date(r.date).toLocaleDateString() : "—"),
    },
    {
      key: "lecture_id",
      label: "Lecture",
      render: (r) => (r.lecture_id ? "✓" : "—"),
    },
    { key: "status", label: "Status" },
    {
      key: "active",
      label: "Active",
      render: (r) => (r.active === false ? "no" : "yes"),
    },
  ];

  const actions = (r) => (
    <div className="flex gap-2 justify-end items-center">
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

  // Classes filtered by selected subject — drives the class dropdown.
  const classesForSubject = filterSubject
    ? classes.filter((c) => c.subject_id === filterSubject)
    : classes;

  // Weeks visible after all filters applied. Subject + class + week-number must
  // narrow to at most one week per class so the table never shows >1 week.
  const filteredRows = rows.filter((r) => {
    if (filterClass && r.class_id !== filterClass) return false;
    if (!filterClass && filterSubject) {
      const cls = classes.find((c) => c.id === r.class_id);
      if (!cls || cls.subject_id !== filterSubject) return false;
    }
    if (filterWeek && String(r.week_number) !== String(filterWeek)) return false;
    return true;
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Weeks</h1>
        <button
          onClick={openCreate}
          className="btn-primary"
        >
          + New week
        </button>
      </div>
      {err && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg">
          {err}
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded p-3">
        <label className="block">
          <span className="text-xs text-slate-600">Subject</span>
          <select
            value={filterSubject}
            onChange={(e) => {
              setFilterSubject(e.target.value);
              setFilterClass("");
            }}
            className="mt-1 block w-full border rounded px-3 py-2 text-sm"
          >
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-600">Class</span>
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="mt-1 block w-full border rounded px-3 py-2 text-sm"
          >
            <option value="">All classes</option>
            {classesForSubject.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
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
            {Array.from({ length: 16 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={String(n)}>
                Week {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <CrudTable rows={filteredRows} columns={columns} actions={actions} />

      <Modal
        open={modal === "create"}
        onClose={() => setModal(null)}
        title="Create week"
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
              Create
            </button>
          </>
        }
      >
        <WeekForm
          form={form}
          setForm={setForm}
          classes={classes}
          lectures={lectures}
        />
      </Modal>

      <Modal
        open={modal?.mode === "edit"}
        onClose={() => setModal(null)}
        title={`Edit Week ${modal?.row?.week_number || ""}`}
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
        <WeekForm
          form={form}
          setForm={setForm}
          classes={classes}
          lectures={lectures}
          showActive
        />
      </Modal>
    </div>
  );
}

function WeekForm({ form, setForm, classes, lectures, showActive }) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-sm text-slate-600">Class</span>
        <select
          value={form.class_id ?? ""}
          onChange={(e) => setForm({ ...form, class_id: e.target.value })}
          className="mt-1 block w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="">Select class...</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <Field
        label="Week Number"
        value={form.week_number ?? 1}
        onChange={(v) => setForm({ ...form, week_number: v })}
        type="number"
        min="1"
        max="16"
      />
      <Field
        label="Title"
        value={form.title ?? ""}
        onChange={(v) => setForm({ ...form, title: v })}
      />
      <Field
        label="Scheduled Date"
        value={form.date ?? ""}
        onChange={(v) => setForm({ ...form, date: v })}
        type="date"
      />
      <label className="block">
        <span className="text-sm text-slate-600">
          Linked Lecture (optional)
        </span>
        <select
          value={form.lecture_id ?? ""}
          onChange={(e) => setForm({ ...form, lecture_id: e.target.value })}
          className="mt-1 block w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="">No lecture linked</option>
          {lectures.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title || `Lecture ${l.id}`}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">Status</span>
        <select
          value={form.status ?? "planned"}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
          className="mt-1 block w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="planned">Planned</option>
          <option value="recording">Recording</option>
          <option value="finished">Finished</option>
        </select>
      </label>
      <Field
        label="Notes (optional)"
        value={form.notes ?? ""}
        onChange={(v) => setForm({ ...form, notes: v })}
      />
      {showActive && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Active
        </label>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", min, max }) {
  return (
    <label className="block">
      <span className="text-sm text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        className="mt-1 block w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
      />
    </label>
  );
}
