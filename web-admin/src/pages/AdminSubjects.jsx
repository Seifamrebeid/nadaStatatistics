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

export default function AdminSubjects() {
  const [rows, setRows] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [err, setErr] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});

  async function load() {
    try {
      const [subjectsRes, doctorsRes] = await Promise.all([
        api.get("/api/subjects"),
        api.get("/api/doctors"),
      ]);
      const subjectsList = Array.isArray(subjectsRes.data)
        ? subjectsRes.data
        : [];
      const doctorsList = Array.isArray(doctorsRes.data) ? doctorsRes.data : [];
      setRows(subjectsList.map(normalise));
      setDoctors(doctorsList.map(normalise));
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setForm({ doctor_id: "", name: "", code: "", description: "" });
    setModal("create");
  }

  function openEdit(row) {
    setForm({
      doctor_id: row.doctor_id || "",
      name: row.name || "",
      code: row.code || "",
      description: row.description || "",
      active: row.active !== false,
    });
    setModal({ mode: "edit", row });
  }

  async function save() {
    try {
      if (modal === "create") {
        await api.post("/api/subjects", {
          doctor_id: form.doctor_id,
          name: form.name,
          code: form.code,
          description: form.description,
        });
      } else {
        await api.put(`/api/subjects/${modal.row.id}`, {
          doctor_id: form.doctor_id,
          name: form.name,
          code: form.code,
          description: form.description,
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
    if (!confirm(`Soft-delete subject "${row.name}"?`)) return;
    try {
      await api.delete(`/api/subjects/${row.id}`);
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  }

  const columns = [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    {
      key: "doctor_id",
      label: "Doctor",
      render: (r) => {
        const doctor = doctors.find((d) => d.id === r.doctor_id);
        return doctor?.name || "—";
      },
    },
    { key: "description", label: "Description" },
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

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Subjects</h1>
        <button
          onClick={openCreate}
          className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded"
        >
          + New subject
        </button>
      </div>
      {err && (
        <div className="mb-4 px-3 py-2 bg-red-100 text-red-900 text-sm rounded">
          {err}
        </div>
      )}
      <CrudTable rows={rows} columns={columns} actions={actions} />

      <Modal
        open={modal === "create"}
        onClose={() => setModal(null)}
        title="Create subject"
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
              Create
            </button>
          </>
        }
      >
        <SubjectForm form={form} setForm={setForm} doctors={doctors} />
      </Modal>

      <Modal
        open={modal?.mode === "edit"}
        onClose={() => setModal(null)}
        title={`Edit ${modal?.row?.name || ""}`}
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
        <SubjectForm
          form={form}
          setForm={setForm}
          doctors={doctors}
          showActive
        />
      </Modal>
    </div>
  );
}

function SubjectForm({ form, setForm, doctors, showActive }) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-sm text-slate-600">Doctor</span>
        <select
          value={form.doctor_id ?? ""}
          onChange={(e) => setForm({ ...form, doctor_id: e.target.value })}
          className="mt-1 block w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="">Select doctor...</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <Field
        label="Name"
        value={form.name ?? ""}
        onChange={(v) => setForm({ ...form, name: v })}
      />
      <Field
        label="Code"
        value={form.code ?? ""}
        onChange={(v) => setForm({ ...form, code: v })}
      />
      <Field
        label="Description"
        value={form.description ?? ""}
        onChange={(v) => setForm({ ...form, description: v })}
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

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label className="block">
      <span className="text-sm text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
      />
    </label>
  );
}
