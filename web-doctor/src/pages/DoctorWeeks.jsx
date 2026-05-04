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

export default function DoctorWeeks() {
  const [rows, setRows] = useState([]);
  const [classes, setClasses] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [err, setErr] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});

  async function loadAll() {
    try {
      const [weeksRes, classesRes, lecturesRes] = await Promise.all([
        api.get("/api/weeks"),
        api.get("/api/classes"),
        api.get("/api/lectures"),
      ]);
      setRows(
        (Array.isArray(weeksRes.data) ? weeksRes.data : []).map(normalise),
      );
      setClasses(
        (Array.isArray(classesRes.data) ? classesRes.data : []).map(normalise),
      );
      setLectures(
        (Array.isArray(lecturesRes.data) ? lecturesRes.data : []).map(
          normalise,
        ),
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
      class_id: classes[0]?.id || "",
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
        week_number: Number(form.week_number),
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
      await loadAll();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  }

  async function remove(row) {
    if (!confirm(`Soft-delete week ${row.week_number}?`)) return;
    try {
      await api.delete(`/api/weeks/${row.id}`);
      await loadAll();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">My weeks</h1>
        <button
          onClick={openCreate}
          className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded"
        >
          + New week
        </button>
      </div>
      {err && (
        <div className="mb-4 px-3 py-2 bg-red-100 text-red-900 text-sm rounded">
          {err}
        </div>
      )}

      <CrudTable
        rows={rows}
        columns={[
          {
            key: "class_id",
            label: "Class",
            render: (r) =>
              classes.find((c) => c.id === r.class_id)?.name || "-",
          },
          { key: "week_number", label: "Week #" },
          { key: "title", label: "Title" },
          {
            key: "date",
            label: "Date",
            render: (r) =>
              r.date ? new Date(r.date).toLocaleDateString() : "-",
          },
          {
            key: "lecture_id",
            label: "Lecture",
            render: (r) => (r.lecture_id ? "linked" : "-"),
          },
          { key: "status", label: "Status" },
          {
            key: "active",
            label: "Active",
            render: (r) => (r.active === false ? "no" : "yes"),
          },
        ]}
        actions={(r) => (
          <div className="flex gap-2 justify-end">
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
        )}
      />

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={
          modal === "create"
            ? "Create week"
            : `Edit week ${modal?.row?.week_number || ""}`
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
            <span className="text-sm text-slate-600">Class</span>
            <select
              value={form.class_id ?? ""}
              onChange={(e) => setForm({ ...form, class_id: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
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
            label="Week number"
            type="number"
            value={form.week_number ?? 1}
            onChange={(v2) => setForm({ ...form, week_number: v2 })}
          />
          <Field
            label="Title"
            value={form.title ?? ""}
            onChange={(v2) => setForm({ ...form, title: v2 })}
          />
          <Field
            label="Date"
            type="date"
            value={toDateOnly(form.date)}
            onChange={(v2) => setForm({ ...form, date: fromDateOnly(v2) })}
          />
          <label className="block">
            <span className="text-sm text-slate-600">
              Linked lecture (optional)
            </span>
            <select
              value={form.lecture_id ?? ""}
              onChange={(e) => setForm({ ...form, lecture_id: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
            >
              <option value="">No lecture linked</option>
              {lectures.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title || l.id}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">Status</span>
            <select
              value={form.status ?? "planned"}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
            >
              <option value="planned">planned</option>
              <option value="recording">recording</option>
              <option value="finished">finished</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">Notes</span>
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
              rows={3}
            />
          </label>
          {modal?.mode === "edit" && (
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
      </Modal>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label className="block">
      <span className="text-sm text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border rounded px-3 py-2"
      />
    </label>
  );
}

function toDateOnly(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromDateOnly(v) {
  if (!v) return "";
  return new Date(`${v}T00:00:00`).toISOString();
}
