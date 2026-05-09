import { useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import CrudTable from "../components/CrudTable";
import Modal from "../components/Modal";

export default function AdminStudents() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});

  async function load() {
    try {
      const snap = await getDocs(collection(db, "students"));
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      setErr(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  function openEdit(row) {
    setForm({ name: row.name || "", email: row.email || "",
              active: row.active !== false });
    setModal({ mode: "edit", row });
  }

  async function save() {
    try {
      await updateDoc(doc(db, "students", modal.row.id), {
        name: form.name,
        email: form.email,
        active: !!form.active,
      });
      setModal(null);
      await load();
    } catch (e) {
      alert(e.message);
    }
  }

  const columns = [
    { key: "id",     label: "ID" },
    { key: "name",   label: "Name" },
    { key: "email",  label: "Email" },
    { key: "active", label: "Active",
      render: (r) => (r.active === false ? "no" : "yes") },
  ];

  const actions = (r) => (
    <div className="flex gap-2 justify-end items-center">
      <button onClick={() => openEdit(r)} className="text-slate-700 hover:underline">Edit</button>
    </div>
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Students</h1>
      </div>
      {err && <div className="mb-4 px-3 py-2 bg-red-100 text-red-900 text-sm rounded">{err}</div>}
      <CrudTable rows={rows} columns={columns} actions={actions}/>

      <Modal open={modal?.mode === "edit"} onClose={() => setModal(null)}
             title={`Edit ${modal?.row?.name || ""}`}
             footer={<>
               <button onClick={() => setModal(null)} className="px-3 py-1.5 border rounded">Cancel</button>
               <button onClick={save} className="px-3 py-1.5 bg-brand text-white rounded">Save</button>
             </>}>
        <StudentForm form={form} setForm={setForm} showActive/>
      </Modal>
    </div>
  );
}

function StudentForm({ form, setForm, showActive }) {
  return (
    <div className="space-y-3">
      <Field label="Name"  value={form.name  ?? ""} onChange={(v) => setForm({ ...form, name: v })}/>
      <Field label="Email" value={form.email ?? ""} onChange={(v) => setForm({ ...form, email: v })} type="email"/>
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
