import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import CrudTable from "../components/CrudTable";
import Modal from "../components/Modal";

export default function AdminSubjects() {
  const { profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [err, setErr] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});

  async function load() {
    try {
      const [subjectsSnap, doctorsSnap] = await Promise.all([
        getDocs(collection(db, "subjects")),
        getDocs(collection(db, "doctors")),
      ]);
      setRows(subjectsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setDoctors(doctorsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      setErr(e.message);
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
        await addDoc(collection(db, "subjects"), {
          doctor_id: form.doctor_id,
          name: form.name,
          code: form.code,
          description: form.description,
          active: true,
          created_by: profile?.uid || "",
          created_at: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, "subjects", modal.row.id), {
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
      alert(e.message);
    }
  }

  async function remove(row) {
    if (!confirm(`Soft-delete subject "${row.name}"?`)) return;
    try {
      await updateDoc(doc(db, "subjects", row.id), { active: false });
      await load();
    } catch (e) {
      alert(e.message);
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
      <button onClick={() => remove(r)} className="text-red-600 hover:underline">
        Delete
      </button>
    </div>
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Subjects</h1>
        <button onClick={openCreate} className="btn-primary">
          + New subject
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
        title="Create subject"
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
        <SubjectForm form={form} setForm={setForm} doctors={doctors} />
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
        <SubjectForm form={form} setForm={setForm} doctors={doctors} showActive />
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
