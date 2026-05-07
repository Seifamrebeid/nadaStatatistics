import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import CrudTable from "../components/CrudTable";
import Modal from "../components/Modal";

const v = (x) => (Array.isArray(x) ? x[0] : x);
const flatIds = (x) => {
  if (!Array.isArray(x)) return x ? [x] : [];
  if (x.length > 0 && Array.isArray(x[0])) return x[0];
  return x;
};
const normalise = (row) => {
  const out = {};
  for (const [k, val] of Object.entries(row || {})) {
    if (k === "linked_student_ids") {
      out[k] = flatIds(val);
    } else {
      out[k] = v(val);
    }
  }
  return out;
};

export default function AdminParents() {
  const [rows, setRows] = useState([]);
  const [students, setStudents] = useState([]);
  const [err, setErr] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [savedTempPw, setSavedTempPw] = useState(null);

  async function load() {
    try {
      const [{ data: parents }, { data: studs }] = await Promise.all([
        api.get("/api/parents"),
        api.get("/api/students"),
      ]);
      setRows((Array.isArray(parents) ? parents : []).map(normalise));
      setStudents((Array.isArray(studs) ? studs : []).map((s) => ({
        id: v(s.id),
        name: v(s.name),
        email: v(s.email),
      })));
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const studentNameById = useMemo(() => {
    const m = {};
    for (const s of students) m[s.id] = s.name || s.id;
    return m;
  }, [students]);

  function openCreate() {
    setSavedTempPw(null);
    setForm({
      name: "",
      email: "",
      password: "",
      relationship: "",
      linked_student_ids: [],
    });
    setModal("create");
  }

  function openEdit(row) {
    setForm({
      name: row.name || "",
      email: row.email || "",
      relationship: row.relationship || "",
      linked_student_ids: Array.isArray(row.linked_student_ids)
        ? row.linked_student_ids
        : [],
      active: row.active !== false,
    });
    setModal({ mode: "edit", row });
  }

  async function save() {
    try {
      if (modal === "create") {
        const payload = {
          name: form.name,
          email: form.email,
          relationship: form.relationship || undefined,
          linked_student_ids: form.linked_student_ids || [],
        };
        if (form.password) payload.password = form.password;
        const { data } = await api.post("/api/parents", payload);
        const pw = v(data.temporary_password);
        if (typeof pw === "string" && pw.length > 0) setSavedTempPw(pw);
      } else {
        await api.put(`/api/parents/${modal.row.id}`, {
          name: form.name,
          email: form.email,
          relationship: form.relationship || undefined,
          linked_student_ids: form.linked_student_ids || [],
          active: !!form.active,
        });
        setModal(null);
      }
      await load();
    } catch (e) {
      const detail =
        e.response?.data?.error ||
        (typeof e.response?.data === "string" ? e.response.data : null) ||
        e.message;
      alert(`Save failed: ${detail}`);
    }
  }

  async function remove(row) {
    if (!confirm(`Soft-delete parent "${row.name}"?`)) return;
    try {
      await api.delete(`/api/parents/${row.id}`);
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  }

  const columns = [
    { key: "id", label: "ID" },
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "relationship", label: "Relationship" },
    {
      key: "linked_student_ids",
      label: "Children",
      render: (r) => {
        const ids = Array.isArray(r.linked_student_ids) ? r.linked_student_ids : [];
        if (ids.length === 0) return <span className="text-slate-400">none</span>;
        return ids.map((id) => studentNameById[id] || id).join(", ");
      },
    },
    {
      key: "active",
      label: "Active",
      render: (r) => (r.active === false ? "no" : "yes"),
    },
  ];

  const actions = (r) => (
    <div className="flex gap-2 justify-end items-center">
      <button onClick={() => openEdit(r)} className="text-slate-700 hover:underline">
        Edit
      </button>
      <button onClick={() => remove(r)} className="text-red-600 hover:underline">
        Delete
      </button>
    </div>
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Parents</h1>
        <button onClick={openCreate} className="btn-primary">
          + New parent
        </button>
      </div>
      {err && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg">
          {err}
        </div>
      )}
      <CrudTable rows={rows} columns={columns} actions={actions} />

      <Modal
        open={modal === "create"}
        onClose={() => setModal(null)}
        title="Create parent"
        footer={
          <>
            <button onClick={() => setModal(null)} className="btn-secondary">
              Cancel
            </button>
            <button onClick={save} className="btn-primary">
              Create
            </button>
          </>
        }
      >
        <ParentForm
          form={form}
          setForm={setForm}
          students={students}
          showPasswordField
        />
        {savedTempPw && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-300 text-sm rounded">
            Temporary password: <code className="font-mono">{savedTempPw}</code> —
            share with the new parent.
          </div>
        )}
      </Modal>

      <Modal
        open={modal?.mode === "edit"}
        onClose={() => setModal(null)}
        title={`Edit ${modal?.row?.name || ""}`}
        footer={
          <>
            <button onClick={() => setModal(null)} className="btn-secondary">
              Cancel
            </button>
            <button onClick={save} className="btn-primary">
              Save
            </button>
          </>
        }
      >
        <ParentForm form={form} setForm={setForm} students={students} showActive />
      </Modal>
    </div>
  );
}

function ParentForm({ form, setForm, students, showPasswordField, showActive }) {
  const linked = Array.isArray(form.linked_student_ids) ? form.linked_student_ids : [];

  function toggleStudent(id) {
    const set = new Set(linked);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    setForm({ ...form, linked_student_ids: Array.from(set) });
  }

  return (
    <div className="space-y-3">
      <Field
        label="Name"
        value={form.name ?? ""}
        onChange={(val) => setForm({ ...form, name: val })}
      />
      <Field
        label="Email"
        value={form.email ?? ""}
        onChange={(val) => setForm({ ...form, email: val })}
        type="email"
      />
      <Field
        label="Relationship (e.g. mother, father, guardian)"
        value={form.relationship ?? ""}
        onChange={(val) => setForm({ ...form, relationship: val })}
      />
      {showPasswordField && (
        <Field
          label="Password (optional — auto-generated if empty)"
          value={form.password ?? ""}
          onChange={(val) => setForm({ ...form, password: val })}
        />
      )}
      <div>
        <div className="text-sm text-slate-600 mb-1">
          Linked students ({linked.length} selected)
        </div>
        <div className="border rounded max-h-48 overflow-auto p-2 bg-white">
          {students.length === 0 ? (
            <div className="text-sm text-slate-400 px-1 py-2">
              No students available.
            </div>
          ) : (
            students.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-2 px-1 py-1 text-sm hover:bg-slate-50 rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={linked.includes(s.id)}
                  onChange={() => toggleStudent(s.id)}
                />
                <span className="font-medium">{s.name || s.id}</span>
                {s.email && (
                  <span className="text-slate-400">— {s.email}</span>
                )}
              </label>
            ))
          )}
        </div>
      </div>
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
