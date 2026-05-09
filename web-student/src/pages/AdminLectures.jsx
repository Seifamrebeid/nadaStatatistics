import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import CrudTable from "../components/CrudTable";
import Modal from "../components/Modal";

export default function AdminLectures() {
  const [rows, setRows] = useState([]);
  const [students, setStudents] = useState([]);
  const [err, setErr] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});

  async function loadAll() {
    try {
      const [lSnap, sSnap] = await Promise.all([
        getDocs(collection(db, "lectures")),
        getDocs(collection(db, "students")),
      ]);
      setRows(lSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setStudents(sSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      setErr(e.message);
    }
  }
  useEffect(() => {
    loadAll();
  }, []);

  function openCreate() {
    setForm({ title: "", status: "scheduled", enrolled_student_ids: [] });
    setModal("create");
  }
  function openEdit(row) {
    setForm({
      title: row.title || "",
      status: row.status || "scheduled",
      enrolled_student_ids: row.enrolled_student_ids || [],
    });
    setModal({ mode: "edit", row });
  }

  async function save() {
    try {
      if (modal === "create") {
        await addDoc(collection(db, "lectures"), form);
      } else {
        await updateDoc(doc(db, "lectures", modal.row.id), form);
      }
      setModal(null);
      await loadAll();
    } catch (e) {
      alert(e.message);
    }
  }

  async function remove(row) {
    if (!confirm(`Delete lecture "${row.title}"?`)) return;
    try {
      await deleteDoc(doc(db, "lectures", row.id));
      await loadAll();
    } catch (e) {
      alert(e.message);
    }
  }

  const columns = [
    { key: "id", label: "ID" },
    { key: "title", label: "Title" },
    { key: "status", label: "Status" },
    {
      key: "count",
      label: "Enrolled",
      render: (r) => r.enrolled_student_ids?.length ?? 0,
    },
  ];

  const actions = (r) => (
    <div className="flex gap-2 justify-end">
      {r.report_pdf_url && (
        <a
          href={r.report_pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand hover:underline"
        >
          Report
        </a>
      )}
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
        <h1 className="text-2xl font-semibold">My lectures</h1>
        <button
          onClick={openCreate}
          className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded"
        >
          + New lecture
        </button>
      </div>
      {err && (
        <div className="mb-4 px-3 py-2 bg-red-100 text-red-900 text-sm rounded">
          {err}
        </div>
      )}
      <CrudTable rows={rows} columns={columns} actions={actions} />

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={
          modal === "create"
            ? "Create lecture"
            : `Edit ${modal?.row?.title || ""}`
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
            <span className="text-sm text-slate-600">Title</span>
            <input
              value={form.title ?? ""}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">Status</span>
            <select
              value={form.status ?? ""}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
            >
              <option value="scheduled">scheduled</option>
              <option value="recording">recording</option>
              <option value="finished">finished</option>
            </select>
          </label>
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
                  No students found.
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
