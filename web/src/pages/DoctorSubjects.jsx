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

const subjectFilter = makeFilter({
  search: { fields: ["name", "code", "description"] },
  selects: [{ key: "active", field: "active" }],
});

export default function DoctorSubjects() {
  const { profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [filters, setFilters] = useState({ search: "", active: "" });

  const filteredRows = useMemo(
    () => rows.filter(subjectFilter(filters)),
    [rows, filters],
  );

  async function load() {
    try {
      const doctorId = profile?.linked_id;
      let snap;
      if (doctorId) {
        snap = await getDocs(
          query(collection(db, "subjects"), where("doctor_id", "==", doctorId))
        );
      } else {
        snap = await getDocs(collection(db, "subjects"));
      }
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
  }, [profile]);

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
      const doctorId = profile?.linked_id;
      if (modal === "create") {
        await addDoc(collection(db, "subjects"), {
          name: form.name,
          code: form.code,
          description: form.description,
          doctor_id: doctorId || null,
          active: true,
          created_by: profile?.uid || null,
          created_at: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, "subjects", modal.row.id), {
          name: form.name,
          code: form.code,
          description: form.description,
          active: !!form.active,
        });
      }
      setModal(null);
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

      <FilterBar
        value={filters}
        onChange={setFilters}
        onReset={() => setFilters({ search: "", active: "" })}
        searchPlaceholder="Search name, code, description..."
        selects={[
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
