import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import CrudTable from "../components/CrudTable";
import Modal from "../components/Modal";

export default function AdminClasses() {
  const { profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [err, setErr] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [filterSubject, setFilterSubject] = useState("");

  async function load() {
    try {
      const [classesSnap, subjectsSnap, studentsSnap] = await Promise.all([
        getDocs(collection(db, "classes")),
        getDocs(collection(db, "subjects")),
        getDocs(collection(db, "students")),
      ]);
      setRows(classesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setSubjects(subjectsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setStudents(studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setForm({
      subject_id: "",
      name: "",
      section: "",
      academic_year: "",
      term: "",
      enrolled_student_ids: [],
    });
    setModal("create");
  }

  function openEdit(row) {
    setForm({
      subject_id: row.subject_id || "",
      name: row.name || "",
      section: row.section || "",
      academic_year: row.academic_year || "",
      term: row.term || "",
      enrolled_student_ids: Array.isArray(row.enrolled_student_ids)
        ? row.enrolled_student_ids
        : [],
      active: row.active !== false,
    });
    setModal({ mode: "edit", row });
  }

  async function save() {
    try {
      if (modal === "create") {
        await addDoc(collection(db, "classes"), {
          subject_id: form.subject_id,
          name: form.name,
          section: form.section,
          academic_year: form.academic_year,
          term: form.term,
          enrolled_student_ids: form.enrolled_student_ids || [],
          active: true,
          created_by: profile?.uid || "",
          created_at: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, "classes", modal.row.id), {
          subject_id: form.subject_id,
          name: form.name,
          section: form.section,
          academic_year: form.academic_year,
          term: form.term,
          enrolled_student_ids: form.enrolled_student_ids || [],
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
    if (!confirm(`Soft-delete class "${row.name}"?`)) return;
    try {
      await updateDoc(doc(db, "classes", row.id), { active: false });
      await load();
    } catch (e) {
      alert(e.message);
    }
  }

  const columns = [
    {
      key: "subject_id",
      label: "Subject",
      render: (r) => {
        const subject = subjects.find((s) => s.id === r.subject_id);
        return subject?.name || "—";
      },
    },
    { key: "name", label: "Class Name" },
    { key: "section", label: "Section" },
    { key: "academic_year", label: "Academic Year" },
    { key: "term", label: "Term" },
    {
      key: "enrolled_student_ids",
      label: "Roster",
      render: (r) =>
        `${(Array.isArray(r.enrolled_student_ids) ? r.enrolled_student_ids : []).length} students`,
    },
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
        <h1 className="text-2xl font-semibold">Classes</h1>
        <button onClick={openCreate} className="btn-primary">
          + New class
        </button>
      </div>
      {err && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg">
          {err}
        </div>
      )}
      <div className="mb-4 bg-slate-50 border border-slate-200 rounded p-3">
        <label className="block max-w-sm">
          <span className="text-xs text-slate-600">Filter by subject</span>
          <select
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            className="mt-1 block w-full border rounded px-3 py-2 text-sm"
          >
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <CrudTable
        rows={
          filterSubject
            ? rows.filter((r) => r.subject_id === filterSubject)
            : rows
        }
        columns={columns}
        actions={actions}
      />

      <Modal
        open={modal === "create"}
        onClose={() => setModal(null)}
        title="Create class"
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
        <ClassForm
          form={form}
          setForm={setForm}
          subjects={subjects}
          students={students}
        />
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
        <ClassForm
          form={form}
          setForm={setForm}
          subjects={subjects}
          students={students}
          showActive
        />
      </Modal>
    </div>
  );
}

function ClassForm({ form, setForm, subjects, students, showActive }) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-sm text-slate-600">Subject</span>
        <select
          value={form.subject_id ?? ""}
          onChange={(e) => setForm({ ...form, subject_id: e.target.value })}
          className="mt-1 block w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="">Select subject...</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <Field
        label="Class Name"
        value={form.name ?? ""}
        onChange={(v) => setForm({ ...form, name: v })}
      />
      <Field
        label="Section"
        value={form.section ?? ""}
        onChange={(v) => setForm({ ...form, section: v })}
      />
      <Field
        label="Academic Year"
        value={form.academic_year ?? ""}
        onChange={(v) => setForm({ ...form, academic_year: v })}
        placeholder="e.g., 2025-2026"
      />
      <Field
        label="Term"
        value={form.term ?? ""}
        onChange={(v) => setForm({ ...form, term: v })}
        placeholder="e.g., fall"
      />
      <div>
        <div className="text-sm text-slate-600 mb-1">Enrolled students</div>
        <div className="border rounded p-2 max-h-40 overflow-auto space-y-1">
          {students.map((s) => {
            const checked = (form.enrolled_student_ids || []).includes(s.id);
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
              No students yet - create one on the Students tab.
            </div>
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

function Field({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <label className="block">
      <span className="text-sm text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
      />
    </label>
  );
}
