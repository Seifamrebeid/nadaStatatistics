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

const weekFilter = makeFilter({
  search: { fields: ["title", "notes"] },
  selects: [
    { key: "class_id", field: "class_id" },
    { key: "status", field: "status" },
    { key: "week_number", field: "week_number" },
  ],
  dateRange: { key: "date" },
});

export default function DoctorWeeks() {
  const { profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [classes, setClasses] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [err, setErr] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [filters, setFilters] = useState({
    search: "",
    class_id: "",
    status: "",
    week_number: "",
    dateFrom: "",
    dateTo: "",
  });

  const filteredRows = useMemo(
    () => rows.filter(weekFilter(filters)),
    [rows, filters],
  );

  const weekNumberOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.week_number).filter((n) => n != null)))
        .sort((a, b) => Number(a) - Number(b))
        .map((n) => ({ value: String(n), label: `Week ${n}` })),
    [rows],
  );

  async function loadAll() {
    try {
      const doctorId = profile?.linked_id;

      // Load classes belonging to this doctor's subjects
      let subjectIds = [];
      if (doctorId) {
        const subSnap = await getDocs(
          query(collection(db, "subjects"), where("doctor_id", "==", doctorId))
        );
        subjectIds = subSnap.docs.map((d) => d.id);
      }

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
      } else if (!doctorId) {
        const snap = await getDocs(collection(db, "classes"));
        classRows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }

      const classIds = classRows.map((c) => c.id);
      let weekRows = [];
      if (classIds.length > 0) {
        const chunks = [];
        for (let i = 0; i < classIds.length; i += 30) {
          chunks.push(classIds.slice(i, i + 30));
        }
        for (const chunk of chunks) {
          const snap = await getDocs(
            query(collection(db, "weeks"), where("class_id", "in", chunk))
          );
          weekRows.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      } else if (!doctorId) {
        const snap = await getDocs(collection(db, "weeks"));
        weekRows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }

      let lectureRows = [];
      if (doctorId) {
        const snap = await getDocs(
          query(collection(db, "lectures"), where("doctor_id", "==", doctorId))
        );
        lectureRows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } else {
        const snap = await getDocs(collection(db, "lectures"));
        lectureRows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }

      setRows(weekRows);
      setClasses(classRows);
      setLectures(lectureRows);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    loadAll();
  }, [profile]);

  function openCreate() {
    setForm({
      class_id: classes[0]?.id || "",
      week_number: 1,
      title: "",
      date: "",
      lecture_id: "",
      status: "planned",
      notes: "",
    });
    setModal("create");
  }

  function openEdit(row) {
    setForm({
      class_id: row.class_id || "",
      week_number: row.week_number || 1,
      title: row.title || "",
      date: row.date
        ? (row.date?.toDate ? row.date.toDate().toISOString() : row.date)
        : "",
      lecture_id: row.lecture_id || "",
      status: row.status || "planned",
      notes: row.notes || "",
      active: row.active !== false,
    });
    setModal({ mode: "edit", row });
  }

  async function save() {
    try {
      const payload = {
        class_id: form.class_id,
        week_number: Number(form.week_number),
        title: form.title,
        date: form.date,
        lecture_id: form.lecture_id,
        status: form.status,
        notes: form.notes,
      };
      if (modal === "create") {
        await addDoc(collection(db, "weeks"), {
          ...payload,
          active: true,
          created_by: profile?.uid || null,
          created_at: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, "weeks", modal.row.id), {
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
    if (!confirm(`Soft-delete week ${row.week_number}?`)) return;
    try {
      await updateDoc(doc(db, "weeks", row.id), { active: false });
      await loadAll();
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">My weeks</h1>
        <button
          onClick={openCreate}
          className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded"
        >
          + New week
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
          setFilters({ search: "", class_id: "", status: "", week_number: "", dateFrom: "", dateTo: "" })
        }
        searchPlaceholder="Search title or notes..."
        selects={[
          {
            key: "class_id",
            label: "Class",
            options: classes.map((c) => ({ value: c.id, label: c.name || c.id })),
          },
          {
            key: "status",
            label: "Status",
            options: ["planned", "recording", "finished"],
          },
          { key: "week_number", label: "Week #", options: weekNumberOptions },
        ]}
        dateRange={{ key: "date" }}
        total={rows.length}
        shown={filteredRows.length}
      />

      <CrudTable
        rows={filteredRows}
        columns={[
          {
            key: "class_id",
            label: "Class",
            render: (r) =>
              classes.find((c) => c.id === r.class_id)?.name || "-",
          },
          { key: "week_number", label: "Week #" },
          { key: "title", label: "Title" },
          {
            key: "date",
            label: "Date",
            render: (r) =>
              r.date
                ? (r.date?.toDate ? r.date.toDate() : new Date(r.date)).toLocaleDateString()
                : "-",
          },
          {
            key: "lecture_id",
            label: "Lecture",
            render: (r) => (r.lecture_id ? "linked" : "-"),
          },
          { key: "status", label: "Status" },
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
            ? "Create week"
            : `Edit week ${modal?.row?.week_number || ""}`
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
            <span className="text-sm text-slate-600">Class</span>
            <select
              value={form.class_id ?? ""}
              onChange={(e) => setForm({ ...form, class_id: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
            >
              <option value="">Select class...</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Week number"
            type="number"
            value={form.week_number ?? 1}
            onChange={(v2) => setForm({ ...form, week_number: v2 })}
          />
          <Field
            label="Title"
            value={form.title ?? ""}
            onChange={(v2) => setForm({ ...form, title: v2 })}
          />
          <Field
            label="Date"
            type="date"
            value={toDateOnly(form.date)}
            onChange={(v2) => setForm({ ...form, date: fromDateOnly(v2) })}
          />
          <label className="block">
            <span className="text-sm text-slate-600">
              Linked lecture (optional)
            </span>
            <select
              value={form.lecture_id ?? ""}
              onChange={(e) => setForm({ ...form, lecture_id: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
            >
              <option value="">No lecture linked</option>
              {lectures.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title || l.id}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">Status</span>
            <select
              value={form.status ?? "planned"}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
            >
              <option value="planned">planned</option>
              <option value="recording">recording</option>
              <option value="finished">finished</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">Notes</span>
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
              rows={3}
            />
          </label>
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

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label className="block">
      <span className="text-sm text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border rounded px-3 py-2"
      />
    </label>
  );
}

function toDateOnly(v) {
  if (!v) return "";
  const d = v?.toDate ? v.toDate() : new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromDateOnly(v) {
  if (!v) return "";
  return new Date(`${v}T00:00:00`).toISOString();
}
