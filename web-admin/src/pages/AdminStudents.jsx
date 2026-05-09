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

// Filename convention: "<id>_<First>_<Middle>_<Last>.<ext>"
function parseStudentFilename(filename) {
  const stem = filename.replace(/\.[^/.]+$/, "");
  const parts = stem.split("_").filter(Boolean);
  if (parts.length < 2) return null;
  const [id, ...nameParts] = parts;
  return { id, name: nameParts.join(" ") };
}

export default function AdminStudents() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [savedTempPw, setSavedTempPw] = useState(null);
  const [bulk, setBulk] = useState(null);
  const [parentModal, setParentModal] = useState(null);

  async function load() {
    try {
      const snap = await getDocs(collection(db, "students"));
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
    setForm({ name: "", email: "", password: "" });
    setModal("create");
  }

  function openEdit(row) {
    setForm({
      name: row.name || "",
      email: row.email || "",
      active: row.active !== false,
    });
    setModal({ mode: "edit", row });
  }

  async function save() {
    try {
      if (modal === "create") {
        const pw = form.password || generatePassword();
        const uid = await createAuthUser(form.email, pw);
        const newDocRef = await addDoc(collection(db, "students"), {
          name: form.name,
          email: form.email,
          active: true,
          created_at: serverTimestamp(),
        });
        await setDoc(doc(db, "users", uid), {
          uid,
          role: "student",
          linked_id: newDocRef.id,
        });
        setSavedTempPw(pw);
      } else {
        await updateDoc(doc(db, "students", modal.row.id), {
          name: form.name,
          email: form.email,
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
    if (!confirm(`Soft-delete student "${row.name}"?`)) return;
    try {
      await updateDoc(doc(db, "students", row.id), { active: false });
      await load();
    } catch (e) {
      alert(e.message);
    }
  }

  async function bulkImport(fileList) {
    const files = Array.from(fileList || []).filter((f) =>
      /\.(jpe?g|png|webp|bmp)$/i.test(f.name),
    );
    if (files.length === 0) {
      alert("No image files found in the selected folder.");
      return;
    }
    const state = {
      running: true,
      done: 0,
      total: files.length,
      errors: [],
      results: [],
    };
    setBulk({ ...state });
    for (const file of files) {
      const parsed = parseStudentFilename(file.name);
      if (!parsed) {
        state.errors.push({
          file: file.name,
          error: "filename does not match <id>_<name>.<ext>",
        });
        state.done += 1;
        setBulk({ ...state });
        continue;
      }
      try {
        const email = `${parsed.id}@students.local`;
        const pw = generatePassword();
        const uid = await createAuthUser(email, pw);
        const newDocRef = await addDoc(collection(db, "students"), {
          name: parsed.name,
          email,
          active: true,
          created_at: serverTimestamp(),
        });
        const studentId = newDocRef.id;
        await setDoc(doc(db, "users", uid), {
          uid,
          role: "student",
          linked_id: studentId,
        });
        // Upload face photo
        const storageRef = ref(storage, `students/${studentId}/face.jpg`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        await updateDoc(doc(db, "students", studentId), {
          face_photo_url: url,
        });
        state.results.push({
          file: file.name,
          id: studentId,
          name: parsed.name,
        });
      } catch (e) {
        state.errors.push({ file: file.name, error: e.message });
      }
      state.done += 1;
      setBulk({ ...state });
    }
    state.running = false;
    setBulk({ ...state });
    await load();
  }

  async function uploadFace(row, file) {
    try {
      const storageRef = ref(storage, `students/${row.id}/face.jpg`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "students", row.id), { face_photo_url: url });
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
    {
      key: "active",
      label: "Active",
      render: (r) => (r.active === false ? "no" : "yes"),
    },
    {
      key: "enrolled",
      label: "Face",
      render: (r) =>
        r.face_photo_url || r.face_encoding ? "enrolled" : "not enrolled",
    },
  ];

  function openAddParent(student) {
    setParentModal({
      student,
      form: { name: "", email: "", password: "", relationship: "" },
      tempPw: null,
    });
  }

  async function saveParent() {
    if (!parentModal) return;
    const { student, form: pf } = parentModal;
    try {
      const pw = pf.password || generatePassword();
      const uid = await createAuthUser(pf.email, pw);
      const newDocRef = await addDoc(collection(db, "parents"), {
        name: pf.name,
        email: pf.email,
        relationship: pf.relationship || "",
        linked_student_ids: [student.id],
        active: true,
        created_at: serverTimestamp(),
      });
      await setDoc(doc(db, "users", uid), {
        uid,
        role: "parent",
        linked_id: newDocRef.id,
      });
      setParentModal({ ...parentModal, tempPw: pw });
      await load();
    } catch (e) {
      alert(`Failed to create parent: ${e.message}`);
    }
  }

  const actions = (r) => (
    <div className="flex gap-2 justify-end items-center">
      <button
        onClick={() => openAddParent(r)}
        className="text-slate-700 hover:underline"
      >
        Add parent
      </button>
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
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Students</h1>
        <div className="flex gap-2">
          <label className="cursor-pointer bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded">
            Import folder
            <input
              type="file"
              webkitdirectory=""
              directory=""
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) bulkImport(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <button onClick={openCreate} className="btn-primary">
            + New student
          </button>
        </div>
      </div>
      {bulk && (
        <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded text-sm">
          <div className="flex items-center justify-between">
            <div>
              {bulk.running ? "Importing" : "Import complete"}:{" "}
              <strong>{bulk.done}</strong> / {bulk.total} —{" "}
              <span className="text-emerald-700">{bulk.results.length} ok</span>,{" "}
              <span className="text-red-700">{bulk.errors.length} failed</span>
            </div>
            {!bulk.running && (
              <button
                onClick={() => setBulk(null)}
                className="text-slate-600 hover:underline"
              >
                Dismiss
              </button>
            )}
          </div>
          <div className="w-full bg-slate-200 rounded h-2 mt-2 overflow-hidden">
            <div
              className="bg-brand h-full transition-all"
              style={{ width: `${(bulk.done / bulk.total) * 100}%` }}
            />
          </div>
          {bulk.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-red-700">
                Show {bulk.errors.length} error(s)
              </summary>
              <ul className="mt-1 list-disc list-inside text-xs text-red-800 max-h-40 overflow-auto">
                {bulk.errors.map((e, i) => (
                  <li key={i}>
                    <code>{e.file}</code> — {e.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {err && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg">
          {err}
        </div>
      )}
      <CrudTable rows={rows} columns={columns} actions={actions} />

      <Modal
        open={modal === "create"}
        onClose={() => setModal(null)}
        title="Create student"
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
        <StudentForm form={form} setForm={setForm} showPasswordField />
        {savedTempPw && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-300 text-sm rounded">
            Temporary password: <code className="font-mono">{savedTempPw}</code>{" "}
            — share with the new student.
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
        <StudentForm form={form} setForm={setForm} showActive />
      </Modal>

      <Modal
        open={!!parentModal}
        onClose={() => setParentModal(null)}
        title={
          parentModal
            ? `Add parent for ${parentModal.student.name || parentModal.student.id}`
            : ""
        }
        footer={
          <>
            <button onClick={() => setParentModal(null)} className="btn-secondary">
              Close
            </button>
            {!parentModal?.tempPw && (
              <button onClick={saveParent} className="btn-primary">
                Create
              </button>
            )}
          </>
        }
      >
        {parentModal && (
          <div className="space-y-3">
            <Field
              label="Name"
              value={parentModal.form.name}
              onChange={(val) =>
                setParentModal({
                  ...parentModal,
                  form: { ...parentModal.form, name: val },
                })
              }
            />
            <Field
              label="Email"
              type="email"
              value={parentModal.form.email}
              onChange={(val) =>
                setParentModal({
                  ...parentModal,
                  form: { ...parentModal.form, email: val },
                })
              }
            />
            <Field
              label="Relationship (mother / father / guardian)"
              value={parentModal.form.relationship}
              onChange={(val) =>
                setParentModal({
                  ...parentModal,
                  form: { ...parentModal.form, relationship: val },
                })
              }
            />
            <Field
              label="Password (optional — auto-generated if empty)"
              value={parentModal.form.password}
              onChange={(val) =>
                setParentModal({
                  ...parentModal,
                  form: { ...parentModal.form, password: val },
                })
              }
            />
            {parentModal.tempPw && (
              <div className="mt-3 p-3 bg-emerald-50 border border-emerald-300 text-sm rounded">
                Temporary password:{" "}
                <code className="font-mono">{parentModal.tempPw}</code> — share
                with the parent.
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function StudentForm({ form, setForm, showPasswordField, showActive }) {
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
