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
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [err, setErr] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});

  async function loadAll() {
    try {
      const [l, s] = await Promise.all([
        api.get("/api/lectures"),
        api.get("/api/students"),
      ]);
      const [subRes, classRes, weekRes] = await Promise.all([
        api.get("/api/subjects"),
        api.get("/api/classes"),
        api.get("/api/weeks"),
      ]);
      setRows((Array.isArray(l.data) ? l.data : []).map(normalise));
      setStudents((Array.isArray(s.data) ? s.data : []).map(normalise));
      setSubjects(
        (Array.isArray(subRes.data) ? subRes.data : []).map(normalise),
      );
      setClasses(
        (Array.isArray(classRes.data) ? classRes.data : []).map(normalise),
      );
      setWeeks(
        (Array.isArray(weekRes.data) ? weekRes.data : []).map(normalise),
      );
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    }
  }
  useEffect(() => {
    loadAll();
  }, []);

  function openCreate() {
    setForm({
      week_id: "",
      title: "",
      status: "scheduled",
      enrolled_student_ids: [],
    });
    setModal("create");
  }
  function openEdit(row) {
    setForm({
      week_id: row.week_id || "",
      title: row.title || "",
      status: row.status || "scheduled",
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

  const columns = [
    { key: "id", label: "ID" },
    {
      key: "subject",
      label: "Subject",
      render: (r) => {
        const week = weeks.find((w) => w.id === r.week_id);
        const cls = classes.find((c) => c.id === week?.class_id);
        const subject = subjects.find((s) => s.id === cls?.subject_id);
        return subject?.name || "—";
      },
    },
    {
      key: "class",
      label: "Class",
      render: (r) => {
        const week = weeks.find((w) => w.id === r.week_id);
        const cls = classes.find((c) => c.id === week?.class_id);
        return cls?.name || "—";
      },
    },
    {
      key: "week",
      label: "Week",
      render: (r) => {
        const week = weeks.find((w) => w.id === r.week_id);
        return week ? `Week ${week.week_number || "?"}` : "—";
      },
    },
    { key: "title", label: "Title" },
    { key: "status", label: "Status" },
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
        <h1 className="text-2xl font-semibold">My lectures</h1>
        <button
          onClick={openCreate}
          className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded"
        >
          + New lecture
        </button>
      </div>
      {err && (
        <div className="mb-4 px-3 py-2 bg-red-100 text-red-900 text-sm rounded">
          {err}
        </div>
      )}
      <CrudTable rows={rows} columns={columns} actions={actions} />

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
              className="px-3 py-1.5 border rounded"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="px-3 py-1.5 bg-brand text-white rounded"
            >
              Save
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm text-slate-600">Week</span>
            <select
              required
              value={form.week_id ?? ""}
              onChange={(e) => setForm({ ...form, week_id: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
            >
              <option value="">Select week</option>
              {weeks.map((w) => {
                const cls = classes.find((c) => c.id === w.class_id);
                const subject = subjects.find((s) => s.id === cls?.subject_id);
                return (
                  <option key={w.id} value={w.id}>
                    {subject?.name || "Subject"} · {cls?.name || "Class"} · Week{" "}
                    {w.week_number || "?"}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">Title</span>
            <input
              value={form.title ?? ""}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
            />
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
                  No students found. Ask admin to create students first.
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
