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

export default function DoctorSubjects() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});

  async function load() {
    try {
      const { data } = await api.get("/api/subjects");
      setRows((Array.isArray(data) ? data : []).map(normalise));
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setForm({ name: "", code: "", description: "" });
    setModal("create");
  }

  function openEdit(row) {
    setForm({
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
          name: form.name,
          code: form.code,
          description: form.description,
        });
      } else {
        await api.put(`/api/subjects/${modal.row.id}`, {
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

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">My subjects</h1>
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

      <CrudTable
        rows={rows}
        columns={[
          { key: "code", label: "Code" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
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
            ? "Create subject"
            : `Edit ${modal?.row?.name || ""}`
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
          <Field
            label="Name"
            value={form.name ?? ""}
            onChange={(v2) => setForm({ ...form, name: v2 })}
          />
          <Field
            label="Code"
            value={form.code ?? ""}
            onChange={(v2) => setForm({ ...form, code: v2 })}
          />
          <Field
            label="Description"
            value={form.description ?? ""}
            onChange={(v2) => setForm({ ...form, description: v2 })}
          />
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

function Field({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="text-sm text-slate-600">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border rounded px-3 py-2"
      />
    </label>
  );
}
