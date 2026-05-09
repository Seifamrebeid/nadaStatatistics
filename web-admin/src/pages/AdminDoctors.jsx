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
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { db, storage } from "../firebase";
import CrudTable from "../components/CrudTable";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";

const firebaseConfig = {
  apiKey: "AIzaSyAqNZKRY002a7KWct5qQLhz0hBHzRIxpXo",
  authDomain: "fridgechef-jt50c.firebaseapp.com",
  projectId: "fridgechef-jt50c",
  storageBucket: "fridgechef-jt50c.firebasestorage.app",
  messagingSenderId: "975789258089",
  appId: "1:975789258089:web:49f21ec3da6a11bce939f8",
};

async function createAuthUser(email, password) {
  const appName = `secondary-${Date.now()}`;
  const secondaryApp = initializeApp(firebaseConfig, appName);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const { user } = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      password,
    );
    return user.uid;
  } finally {
    await deleteApp(secondaryApp);
  }
}

function generatePassword() {
  return (
    Math.random().toString(36).slice(-6) +
    Math.random().toString(36).slice(-6).toUpperCase()
  );
}

export default function AdminDoctors() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [savedTempPw, setSavedTempPw] = useState(null);

  async function load() {
    try {
      const snap = await getDocs(collection(db, "doctors"));
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setSavedTempPw(null);
    setForm({ name: "", email: "", department: "", password: "" });
    setModal("create");
  }

  function openEdit(row) {
    setForm({
      name: row.name || "",
      email: row.email || "",
      department: row.department || "",
      active: row.active !== false,
    });
    setModal({ mode: "edit", row });
  }

  async function save() {
    try {
      if (modal === "create") {
        const pw = form.password || generatePassword();
        const uid = await createAuthUser(form.email, pw);
        const newDocRef = await addDoc(collection(db, "doctors"), {
          name: form.name,
          email: form.email,
          department: form.department,
          active: true,
          created_at: serverTimestamp(),
        });
        await setDoc(doc(db, "users", uid), {
          uid,
          role: "doctor",
          linked_id: newDocRef.id,
        });
        setSavedTempPw(pw);
      } else {
        await updateDoc(doc(db, "doctors", modal.row.id), {
          name: form.name,
          email: form.email,
          department: form.department,
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
    if (!confirm(`Soft-delete doctor "${row.name}"?`)) return;
    try {
      await updateDoc(doc(db, "doctors", row.id), { active: false });
      await load();
    } catch (e) {
      alert(e.message);
    }
  }

  async function uploadFace(row, file) {
    try {
      const storageRef = ref(storage, `doctors/${row.id}/face.jpg`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "doctors", row.id), { face_photo_url: url });
      alert(`Enrolled ${row.name}'s face successfully`);
      await load();
    } catch (e) {
      alert(`Enrollment failed: ${e.message}`);
    }
  }

  const columns = [
    { key: "id", label: "ID" },
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "department", label: "Department" },
    {
      key: "active",
      label: "Active",
      render: (r) => (r.active === false ? "no" : "yes"),
    },
    {
      key: "enrolled",
      label: "Face",
      render: (r) => (r.face_photo_url ? "✓" : "—"),
    },
  ];

  const actions = (r) => (
    <div className="flex gap-2 justify-end items-center">
      <label className="cursor-pointer text-brand hover:underline">
        Upload face
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) uploadFace(r, e.target.files[0]);
            e.target.value = "";
          }}
        />
      </label>
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
      <PageHeader
        title="Doctors"
        subtitle="Manage doctor accounts and face enrollment."
        actions={
          <button onClick={openCreate} className="btn-primary">
            + New doctor
          </button>
        }
      />
      {err && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg">
          {err}
        </div>
      )}
      <CrudTable rows={rows} columns={columns} actions={actions} />

      <Modal
        open={modal === "create"}
        onClose={() => setModal(null)}
        title="Create doctor"
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
        <DoctorForm form={form} setForm={setForm} showPasswordField />
        {savedTempPw && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-300 text-sm rounded">
            Temporary password:{" "}
            <code className="font-mono">{savedTempPw}</code> — share with the
            new doctor.
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
        <DoctorForm form={form} setForm={setForm} showActive />
      </Modal>
    </div>
  );
}

function DoctorForm({ form, setForm, showPasswordField, showActive }) {
  return (
    <div className="space-y-3">
      <Field
        label="Name"
        value={form.name ?? ""}
        onChange={(v) => setForm({ ...form, name: v })}
      />
      <Field
        label="Email"
        value={form.email ?? ""}
        onChange={(v) => setForm({ ...form, email: v })}
        type="email"
      />
      <Field
        label="Department"
        value={form.department ?? ""}
        onChange={(v) => setForm({ ...form, department: v })}
      />
      {showPasswordField && (
        <Field
          label="Password (optional — auto-generated if empty)"
          value={form.password ?? ""}
          onChange={(v) => setForm({ ...form, password: v })}
        />
      )}
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
