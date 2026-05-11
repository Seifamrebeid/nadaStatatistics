import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import CrudTable from "../components/CrudTable";
import Modal from "../components/Modal";
import FilterBar, { makeFilter } from "../components/FilterBar";

const classFilter = makeFilter({
  search: { fields: ["name", "section"] },
  selects: [
    { key: "subject_id", field: "subject_id" },
    { key: "academic_year", field: "academic_year" },
    { key: "term", field: "term" },
    { key: "active", field: "active" },
  ],
});

export default function DoctorClasses() {
  const { profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [err, setErr] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [filters, setFilters] = useState({
    search: "",
    subject_id: "",
    academic_year: "",
    term: "",
    active: "",
  });

  const filteredRows = useMemo(
    () => rows.filter(classFilter(filters)),
    [rows, filters],
  );

  const yearOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.academic_year).filter(Boolean))).sort(),
    [rows],
  );
  const termOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.term).filter(Boolean))).sort(),
    [rows],
  );

  async function loadAll() {
    try {
      const doctorId = profile?.linked_id;

      // Load subjects for this doctor
      let subjectsSnap;
      if (doctorId) {
        subjectsSnap = await getDocs(
          query(collection(db, "subjects"), where("doctor_id", "==", doctorId))
        );
      } else {
        subjectsSnap = await getDocs(collection(db, "subjects"));
      }
      const subjectRows = subjectsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const subjectIds = subjectRows.map((s) => s.id);

      // Load classes for these subjects
      let classRows = [];
      if (subjectIds.length > 0) {
        const chunks = [];
        for (let i = 0; i < subjectIds.length; i += 30) {
          chunks.push(subjectIds.slice(i, i + 30));
        }
        for (const chunk of chunks) {
          const snap = await getDocs(
            query(collection(db, "classes"), where("subject_id", "in", chunk))
          );
          classRows.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      }

      const studentsSnap = await getDocs(collection(db, "students"));
      const studentRows = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      setRows(classRows);
      setSubjects(subjectRows);
      setStudents(studentRows);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    loadAll();
  }, [profile]);

  function openCreate() {
    setForm({
      subject_id: subjects[0]?.id || "",
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
      enrolled_student_ids: row.enrolled_student_ids || [],
      active: row.active !== false,
    });
    setModal({ mode: "edit", row });
  }

  async function save() {
    try {
      const payload = {
        subject_id: form.subject_id,
        name: form.name,
        section: form.section,
        academic_year: form.academic_year,
        term: form.term,
        enrolled_student_ids: form.enrolled_student_ids || [],
      };
      if (modal === "create") {
        await addDoc(collection(db, "classes"), {
          ...payload,
          active: true,
          created_by: profile?.uid || null,
          created_at: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, "classes", modal.row.id), {
          ...payload,
          active: !!form.active,
        });
      }
      setModal(null);
      await loadAll();
    } catch (e) {
      alert(e.message);
    }
  }

  async function remove(row) {
    if (!confirm(`Soft-delete class "${row.name}"?`)) return;
    try {
      await updateDoc(doc(db, "classes", row.id), { active: false });
      await loadAll();
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">My classes</h1>
        <button
          onClick={openCreate}
          className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded"
        >
          + New class
        </button>
      </div>
      {err && (
        <div className="mb-4 px-3 py-2 bg-red-100 text-red-900 text-sm rounded">
          {err}
        </div>
      )}

      <FilterBar
        value={filters}
        onChange={setFilters}
        onReset={() =>
          setFilters({ search: "", subject_id: "", academic_year: "", term: "", active: "" })
        }
        searchPlaceholder="Search class name or section..."
        selects={[
          {
            key: "subject_id",
            label: "Subject",
            options: subjects.map((s) => ({ value: s.id, label: s.name || s.id })),
          },
          { key: "academic_year", label: "Year", options: yearOptions },
          { key: "term", label: "Term", options: termOptions },
          {
            key: "active",
            label: "Active",
            options: [
              { value: "true", label: "Yes" },
              { value: "false", label: "No" },
            ],
          },
        ]}
        total={rows.length}
        shown={filteredRows.length}
      />

      <CrudTable
        rows={filteredRows}
        columns={[
          {
            key: "subject_id",
            label: "Subject",
            render: (r) =>
              subjects.find((s) => s.id === r.subject_id)?.name || "-",
          },
          { key: "name", label: "Class" },
          { key: "section", label: "Section" },
          { key: "academic_year", label: "Year" },
          { key: "term", label: "Term" },
          {
            key: "enrolled_student_ids",
            label: "Roster",
            render: (r) => (r.enrolled_student_ids || []).length,
          },
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
          modal === "create" ? "Create class" : `Edit ${modal?.row?.name || ""}`
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
            <span className="text-sm text-slate-600">Subject</span>
            <select
              value={form.subject_id ?? ""}
              onChange={(e) => setForm({ ...form, subject_id: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
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
            label="Class name"
            value={form.name ?? ""}
            onChange={(v2) => setForm({ ...form, name: v2 })}
          />
          <Field
            label="Section"
            value={form.section ?? ""}
            onChange={(v2) => setForm({ ...form, section: v2 })}
          />
          <Field
            label="Academic year"
            value={form.academic_year ?? ""}
            onChange={(v2) => setForm({ ...form, academic_year: v2 })}
          />
          <Field
            label="Term"
            value={form.term ?? ""}
            onChange={(v2) => setForm({ ...form, term: v2 })}
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
                    {s.name || s.id}
                  </label>
                );
              })}
            </div>
          </div>

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
