import { useEffect, useState } from "react";
import api from "../services/api";
import CrudTable from "../components/CrudTable";
import Modal from "../components/Modal";

// Plumber wraps scalars as length-1 arrays in its default JSON; normalise them.
const v = (x) => (Array.isArray(x) ? x[0] : x);
const normalise = (row) => {
  const out = {};
  for (const [k, val] of Object.entries(row || {})) out[k] = v(val);
  return out;
};

export default function AdminDoctors() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const [modal, setModal] = useState(null); // null | "create" | { mode: "edit", row }
  const [form, setForm] = useState({});
  const [savedTempPw, setSavedTempPw] = useState(null);

  async function load() {
    try {
      const { data } = await api.get("/api/doctors");
      // The backend returns a list of rows; each row's fields may be wrapped.
      const list = Array.isArray(data) ? data : [];
      setRows(list.map(normalise));
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    }
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setSavedTempPw(null);
    setForm({ name: "", email: "", department: "", password: "" });
    setModal("create");
  }
  function openEdit(row) {
    setForm({ name: row.name || "", email: row.email || "",
              department: row.department || "", active: row.active !== false });
    setModal({ mode: "edit", row });
  }

  async function save() {
    try {
      if (modal === "create") {
        const payload = {
          name: form.name, email: form.email, department: form.department,
        };
        if (form.password) payload.password = form.password;
        const { data } = await api.post("/api/doctors", payload);
        const pw = v(data.temporary_password);
        if (typeof pw === "string" && pw.length > 0) setSavedTempPw(pw);
      } else {
        await api.put(`/api/doctors/${modal.row.id}`, {
          name: form.name, email: form.email,
          department: form.department, active: !!form.active,
        });
        setModal(null);
      }
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  }

  async function remove(row) {
    if (!confirm(`Soft-delete doctor "${row.name}"?`)) return;
    try { await api.delete(`/api/doctors/${row.id}`); await load(); }
    catch (e) { alert(e.response?.data?.error || e.message); }
  }

  async function uploadFace(row, file) {
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/api/doctors/${row.id}/face`, fd);
      alert(`Enrolled ${row.name}'s face successfully`);
      await load();
    } catch (e) {
      alert(`Enrollment failed: ${e.response?.data?.error || e.message}`);
    }
  }

  const columns = [
    { key: "id",         label: "ID" },
    { key: "name",       label: "Name" },
    { key: "email",      label: "Email" },
    { key: "department", label: "Department" },
    { key: "active",     label: "Active",
      render: (r) => (r.active === false ? "no" : "yes") },
    { key: "enrolled",   label: "Face",
      render: (r) => (r.face_enrolled_at ? "✓" : "—") },
  ];

  const actions = (r) => (
    <div className="flex gap-2 justify-end items-center">
      <label className="cursor-pointer text-brand hover:underline">
        Upload face
        <input type="file" accept="image/*" className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) uploadFace(r, e.target.files[0]); e.target.value = ""; }}/>
      </label>
      <button onClick={() => openEdit(r)} className="text-slate-700 hover:underline">Edit</button>
      <button onClick={() => remove(r)} className="text-red-600 hover:underline">Delete</button>
    </div>
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Doctors</h1>
        <button onClick={openCreate}
          className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded">
          + New doctor
        </button>
      </div>
      {err && <div className="mb-4 px-3 py-2 bg-red-100 text-red-900 text-sm rounded">{err}</div>}
      <CrudTable rows={rows} columns={columns} actions={actions}/>

      <Modal open={modal === "create"} onClose={() => setModal(null)}
             title="Create doctor"
             footer={<>
               <button onClick={() => setModal(null)} className="px-3 py-1.5 border rounded">Cancel</button>
               <button onClick={save} className="px-3 py-1.5 bg-brand text-white rounded">Create</button>
             </>}>
        <DoctorForm form={form} setForm={setForm} showPasswordField/>
        {savedTempPw && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-300 text-sm rounded">
            Temporary password: <code className="font-mono">{savedTempPw}</code> — share with the new doctor.
          </div>
        )}
      </Modal>

      <Modal open={modal?.mode === "edit"} onClose={() => setModal(null)}
             title={`Edit ${modal?.row?.name || ""}`}
             footer={<>
               <button onClick={() => setModal(null)} className="px-3 py-1.5 border rounded">Cancel</button>
               <button onClick={save} className="px-3 py-1.5 bg-brand text-white rounded">Save</button>
             </>}>
        <DoctorForm form={form} setForm={setForm} showActive/>
      </Modal>
    </div>
  );
}

function DoctorForm({ form, setForm, showPasswordField, showActive }) {
  return (
    <div className="space-y-3">
      <Field label="Name"       value={form.name       ?? ""} onChange={(v) => setForm({ ...form, name: v })}/>
      <Field label="Email"      value={form.email      ?? ""} onChange={(v) => setForm({ ...form, email: v })} type="email"/>
      <Field label="Department" value={form.department ?? ""} onChange={(v) => setForm({ ...form, department: v })}/>
      {showPasswordField && (
        <Field label="Password (optional — auto-generated if empty)"
               value={form.password ?? ""}
               onChange={(v) => setForm({ ...form, password: v })}/>
      )}
      {showActive && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!form.active}
                 onChange={(e) => setForm({ ...form, active: e.target.checked })}/>
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
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
             className="mt-1 block w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"/>
    </label>
  );
}
