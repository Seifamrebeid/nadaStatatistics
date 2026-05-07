import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import Modal from "../components/Modal";
import FilterBar, { makeFilter } from "../components/FilterBar";

const v = (x) => (Array.isArray(x) ? x[0] : x);

const lectureFilter = makeFilter({
  search: { fields: ["title", "id"] },
  selects: [
    { key: "status", field: "status" },
    { key: "week_id", field: "week_id" },
  ],
  dateRange: { key: "scheduled_at" },
});

export default function DoctorLectures() {
  const [lectures, setLectures] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [students, setStudents] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    week_id: "",
    dateFrom: "",
    dateTo: "",
  });

  const filteredLectures = useMemo(
    () => lectures.filter(lectureFilter(filters)),
    [lectures, filters],
  );

  const fetchData = async () => {
    try {
      const [lecturesRes, weeksRes, studentsRes] = await Promise.all([
        api.get("/api/lectures"),
        api.get("/api/weeks"),
        api.get("/api/students"),
      ]);
      setLectures(
        (Array.isArray(lecturesRes.data) ? lecturesRes.data : []).map(
          normalise,
        ),
      );
      setWeeks(
        (Array.isArray(weeksRes.data) ? weeksRes.data : []).map(normalise),
      );
      setStudents(
        (Array.isArray(studentsRes.data) ? studentsRes.data : []).map(
          normalise,
        ),
      );
    } catch (error) {
      console.error("Error fetching lectures:", error);
      setErr(error.response?.data?.error || error.message);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  function openCreate() {
    setForm({
      title: "",
      week_id: weeks[0]?.id || "",
      status: "scheduled",
      scheduled_at: "",
      enrolled_student_ids: [],
    });
    setModal("create");
  }

  function openEdit(row) {
    setForm({
      title: row.title || "",
      week_id: row.week_id || "",
      status: row.status || "scheduled",
      scheduled_at: row.scheduled_at || "",
      enrolled_student_ids: row.enrolled_student_ids || [],
    });
    setModal({ mode: "edit", row });
  }

  async function save() {
    try {
      if (modal === "create") await api.post("/api/lectures", form);
      else {
        await api.put(`/api/lectures/${modal.row.id}`, form);
        setModal(null);
      }
      await fetchData();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  }

  const handleDelete = async (lectureId) => {
    if (!window.confirm("Delete this lecture?")) return;
    try {
      setBusy(true);
      await api.delete(`/api/lectures/${lectureId}`);
      setLectures(lectures.filter((l) => l.id !== lectureId));
    } catch (error) {
      setErr(error.response?.data?.error || error.message);
    } finally {
      setBusy(false);
    }
  };

  async function regenerateReport(lectureId) {
    try {
      await api.post(`/api/lectures/${lectureId}/generate-report`);
      const { data } = await api.get(`/api/lectures/${lectureId}/report`);
      const url = v(data.url);
      if (url) window.open(url, "_blank");
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Lectures</h1>
        <button
          onClick={openCreate}
          className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded"
        >
          + New lecture
        </button>
      </div>

      {err && <div className="text-red-600 p-4 bg-red-50 rounded">{err}</div>}

      <FilterBar
        value={filters}
        onChange={setFilters}
        onReset={() =>
          setFilters({ search: "", status: "", week_id: "", dateFrom: "", dateTo: "" })
        }
        searchPlaceholder="Search title..."
        selects={[
          {
            key: "status",
            label: "Status",
            options: ["scheduled", "recording", "finished"],
          },
          {
            key: "week_id",
            label: "Week",
            options: weeks.map((w) => ({
              value: w.id,
              label: `Week ${w.week_number || "?"} - ${w.title || "Untitled"}`,
            })),
          },
        ]}
        dateRange={{ key: "scheduled_at" }}
        total={lectures.length}
        shown={filteredLectures.length}
      />

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                Title
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                Date
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                Status
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                Students
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredLectures.map((lecture) => (
              <tr key={v(lecture.id)} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm">{v(lecture.title)}</td>
                <td className="px-6 py-4 text-sm">
                  {lecture.scheduled_at
                    ? new Date(lecture.scheduled_at).toLocaleString()
                    : "-"}
                </td>
                <td className="px-6 py-4 text-sm">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      v(lecture.status) === "recording"
                        ? "bg-red-100 text-red-800"
                        : v(lecture.status) === "finished"
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {v(lecture.status)}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  {(lecture.enrolled_student_ids || []).length}
                </td>
                <td className="px-6 py-4 text-sm space-x-2">
                  <button
                    onClick={() => regenerateReport(lecture.id)}
                    className="text-brand hover:underline"
                  >
                    Report
                  </button>
                  <button
                    onClick={() => openEdit(lecture)}
                    className="text-slate-700 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(lecture.id)}
                    disabled={busy}
                    className="text-red-600 hover:underline disabled:opacity-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
          <Field
            label="Title"
            value={form.title ?? ""}
            onChange={(v2) => setForm({ ...form, title: v2 })}
          />
          <label className="block">
            <span className="text-sm text-slate-600">Week</span>
            <select
              value={form.week_id ?? ""}
              onChange={(e) => setForm({ ...form, week_id: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
            >
              <option value="">Select week...</option>
              {weeks.map((w) => (
                <option key={w.id} value={w.id}>
                  Week {w.week_number || "?"} - {w.title || "Untitled"}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">Status</span>
            <select
              value={form.status ?? "scheduled"}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="mt-1 w-full border rounded px-3 py-2"
            >
              <option value="scheduled">scheduled</option>
              <option value="recording">recording</option>
              <option value="finished">finished</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">Scheduled at</span>
            <input
              type="datetime-local"
              value={toDateTimeLocal(form.scheduled_at)}
              onChange={(e) =>
                setForm({
                  ...form,
                  scheduled_at: fromDateTimeLocal(e.target.value),
                })
              }
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </label>
          <div>
            <div className="text-sm text-slate-600 mb-1">Enrolled students</div>
            <div className="border rounded p-2 max-h-40 overflow-auto space-y-1">
              {students.map((s) => {
                const checked = (form.enrolled_student_ids || []).includes(
                  s.id,
                );
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
        </div>
      </Modal>
    </div>
  );
}

function normalise(row) {
  const out = {};
  for (const [k, val] of Object.entries(row || {})) {
    if (k === "enrolled_student_ids" && Array.isArray(val))
      out[k] = val.flat(2).filter(Boolean);
    else out[k] = v(val);
  }
  return out;
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

function toDateTimeLocal(v2) {
  if (!v2) return "";
  const d = new Date(v2);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDateTimeLocal(v2) {
  if (!v2) return "";
  const d = new Date(v2);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}
