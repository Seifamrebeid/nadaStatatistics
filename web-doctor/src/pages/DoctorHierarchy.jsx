import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import CrudTable from "../components/CrudTable";
import FilterBar, { makeFilter } from "../components/FilterBar";

const v = (x) => (Array.isArray(x) ? x[0] : x);

const subjectFilter = makeFilter({
  search: { fields: ["name", "code"] },
  selects: [{ key: "active", field: "active" }],
});
const studentRowFilter = makeFilter({
  search: { fields: ["name", "email", "id"] },
});

function normalise(row) {
  const out = {};
  for (const [k, val] of Object.entries(row || {})) {
    if (k === "enrolled_student_ids" && Array.isArray(val)) {
      out[k] = val.flat(2).filter(Boolean);
    } else {
      out[k] = v(val);
    }
  }
  return out;
}

export default function DoctorHierarchy() {
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [students, setStudents] = useState([]);
  const [emotions, setEmotions] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [selectedWeekId, setSelectedWeekId] = useState(null);
  const [err, setErr] = useState(null);
  const [subjectFilters, setSubjectFilters] = useState({ search: "", active: "" });
  const [studentFilters, setStudentFilters] = useState({ search: "" });

  useEffect(() => {
    Promise.all([
      api.get("/api/subjects"),
      api.get("/api/classes"),
      api.get("/api/weeks"),
      api.get("/api/students"),
    ])
      .then(([subjectsRes, classesRes, weeksRes, studentsRes]) => {
        const subjectRows = (
          Array.isArray(subjectsRes.data) ? subjectsRes.data : []
        ).map(normalise);
        const classRows = (
          Array.isArray(classesRes.data) ? classesRes.data : []
        ).map(normalise);
        const weekRows = (
          Array.isArray(weeksRes.data) ? weeksRes.data : []
        ).map(normalise);
        const studentRows = (
          Array.isArray(studentsRes.data) ? studentsRes.data : []
        ).map(normalise);
        setSubjects(subjectRows);
        setClasses(classRows);
        setWeeks(weekRows);
        setStudents(studentRows);
        setSelectedSubjectId(subjectRows[0]?.id || null);
      })
      .catch((e) => setErr(e.response?.data?.error || e.message));
  }, []);

  const selectedSubject = useMemo(
    () => subjects.find((subject) => subject.id === selectedSubjectId) || null,
    [subjects, selectedSubjectId],
  );
  const subjectClasses = useMemo(
    () => classes.filter((cls) => cls.subject_id === selectedSubject?.id),
    [classes, selectedSubject],
  );
  const selectedClass = useMemo(
    () => classes.find((cls) => cls.id === selectedClassId) || null,
    [classes, selectedClassId],
  );
  const classWeeks = useMemo(
    () =>
      weeks
        .filter((week) => week.class_id === selectedClass?.id)
        .sort(
          (a, b) => Number(a.week_number || 0) - Number(b.week_number || 0),
        ),
    [weeks, selectedClass],
  );
  const selectedWeek = useMemo(
    () => weeks.find((week) => week.id === selectedWeekId) || null,
    [weeks, selectedWeekId],
  );
  const linkedLectureId = selectedWeek?.lecture_id || null;

  useEffect(() => {
    if (
      selectedSubjectId &&
      !subjects.some((subject) => subject.id === selectedSubjectId)
    ) {
      setSelectedSubjectId(subjects[0]?.id || null);
    }
  }, [subjects, selectedSubjectId]);

  useEffect(() => {
    if (!selectedSubject) return;
    if (!subjectClasses.some((cls) => cls.id === selectedClassId)) {
      setSelectedClassId(subjectClasses[0]?.id || null);
    }
  }, [selectedSubject, subjectClasses, selectedClassId]);

  useEffect(() => {
    if (!selectedClass) return;
    if (!classWeeks.some((week) => week.id === selectedWeekId)) {
      setSelectedWeekId(classWeeks[0]?.id || null);
    }
  }, [selectedClass, classWeeks, selectedWeekId]);

  useEffect(() => {
    if (!linkedLectureId) {
      setEmotions([]);
      return;
    }
    api
      .get("/api/emotions", { params: { lecture_id: linkedLectureId } })
      .then(({ data }) =>
        setEmotions((Array.isArray(data) ? data : []).map(normalise)),
      )
      .catch((e) => setErr(e.response?.data?.error || e.message));
  }, [linkedLectureId]);

  const enrolledStudents = useMemo(() => {
    const roster = new Set(selectedClass?.enrolled_student_ids || []);
    return students.filter((student) => roster.has(student.id));
  }, [students, selectedClass]);

  const filteredSubjects = useMemo(
    () => subjects.filter(subjectFilter(subjectFilters)),
    [subjects, subjectFilters],
  );

  const studentRowsAll = useMemo(() => {
    if (!selectedWeek) return [];
    return enrolledStudents.map((student) => {
      const rows = emotions.filter(
        (emotion) => emotion.student_id === student.id,
      );
      const engagement = rows
        .map((row) => Number(row.engagement_score))
        .filter(Number.isFinite);
      const sleeping = rows.filter(
        (row) => String(row.state || "").toLowerCase() === "sleeping",
      ).length;
      const observations = rows.length;
      const meanEngagement = average(engagement);
      const sleepRate = observations ? (sleeping / observations) * 100 : 0;
      return {
        id: student.id,
        name: student.name || student.id,
        email: student.email || "",
        observations,
        mean_engagement: meanEngagement.toFixed(3),
        sleep_rate: `${sleepRate.toFixed(1)}%`,
      };
    });
  }, [enrolledStudents, emotions, selectedWeek]);

  const studentRows = useMemo(
    () => studentRowsAll.filter(studentRowFilter(studentFilters)),
    [studentRowsAll, studentFilters],
  );

  const subjectColumns = [
    { key: "name", label: "Subject" },
    { key: "code", label: "Code" },
    {
      key: "class_count",
      label: "Classes",
      render: (row) =>
        classes.filter((cls) => cls.subject_id === row.id).length,
    },
    {
      key: "active",
      label: "Active",
      render: (row) => (row.active === false ? "no" : "yes"),
    },
  ];

  const classColumns = [
    { key: "name", label: "Class" },
    { key: "section", label: "Section" },
    { key: "academic_year", label: "Year" },
    { key: "term", label: "Term" },
    {
      key: "weeks",
      label: "Weeks",
      render: (row) => weeks.filter((week) => week.class_id === row.id).length,
    },
    {
      key: "roster",
      label: "Students",
      render: (row) => (row.enrolled_student_ids || []).length,
    },
  ];

  const weekColumns = [
    { key: "week_number", label: "Week #" },
    { key: "title", label: "Title" },
    {
      key: "date",
      label: "Date",
      render: (row) =>
        row.date ? new Date(row.date).toLocaleDateString() : "—",
    },
    {
      key: "lecture_id",
      label: "Lecture",
      render: (row) => row.lecture_id || "—",
    },
    { key: "status", label: "Status" },
  ];

  if (err) {
    return <div className="text-red-600">Failed to load hierarchy: {err}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My teaching hierarchy</h1>
        <p className="text-sm text-slate-500 mt-1">
          Subjects, classes, weeks, and student analytics in one place.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Metric label="Subjects" value={subjects.length} />
        <Metric label="Classes" value={classes.length} />
        <Metric label="Weeks" value={weeks.length} />
        <Metric label="Students" value={enrolledStudents.length} />
      </div>

      <Section title="Subjects">
        <FilterBar
          value={subjectFilters}
          onChange={setSubjectFilters}
          onReset={() => setSubjectFilters({ search: "", active: "" })}
          searchPlaceholder="Search subjects by name or code..."
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
          total={subjects.length}
          shown={filteredSubjects.length}
        />
        <CrudTable
          rows={filteredSubjects}
          columns={subjectColumns}
          actions={(row) => (
            <button
              onClick={() => {
                setSelectedSubjectId(row.id);
                setSelectedClassId(null);
                setSelectedWeekId(null);
              }}
              className={`hover:underline ${selectedSubjectId === row.id ? "text-brand" : "text-slate-700"}`}
            >
              {selectedSubjectId === row.id ? "Selected" : "Open"}
            </button>
          )}
          empty="No subjects assigned yet."
        />
      </Section>

      <Section
        title={
          selectedSubject ? `Classes in ${selectedSubject.name}` : "Classes"
        }
      >
        <CrudTable
          rows={subjectClasses}
          columns={classColumns}
          actions={(row) => (
            <button
              onClick={() => {
                setSelectedClassId(row.id);
                setSelectedWeekId(null);
              }}
              className={`hover:underline ${selectedClassId === row.id ? "text-brand" : "text-slate-700"}`}
            >
              {selectedClassId === row.id ? "Selected" : "Open"}
            </button>
          )}
          empty="Pick a subject to see its classes."
        />
      </Section>

      <Section
        title={selectedClass ? `Weeks in ${selectedClass.name}` : "Weeks"}
      >
        <CrudTable
          rows={classWeeks}
          columns={weekColumns}
          actions={(row) => (
            <button
              onClick={() => setSelectedWeekId(row.id)}
              className={`hover:underline ${selectedWeekId === row.id ? "text-brand" : "text-slate-700"}`}
            >
              {selectedWeekId === row.id ? "Selected" : "Open"}
            </button>
          )}
          empty="Pick a class to see its weeks."
        />
      </Section>

      <Section title="Students and analytics">
        {!selectedWeek ? (
          <div className="bg-white rounded-lg shadow p-6 text-slate-500">
            Select a week to see the linked lecture and per-student analytics.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow p-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <Info
                label="Selected subject"
                value={selectedSubject?.name || "—"}
              />
              <Info label="Selected class" value={selectedClass?.name || "—"} />
              <Info
                label="Selected week"
                value={`Week ${selectedWeek.week_number || "—"} · ${selectedWeek.title || "Untitled"}`}
              />
              <Info
                label="Linked lecture"
                value={linkedLectureId || "No lecture linked yet"}
              />
              <Info label="Roster size" value={enrolledStudents.length} />
              <Info label="Observations" value={emotions.length} />
            </div>

            <FilterBar
              value={studentFilters}
              onChange={setStudentFilters}
              onReset={() => setStudentFilters({ search: "" })}
              searchPlaceholder="Search students by name, email, or id..."
              total={studentRowsAll.length}
              shown={studentRows.length}
            />
            <CrudTable
              rows={studentRows}
              columns={[
                { key: "name", label: "Student" },
                { key: "email", label: "Email" },
                { key: "observations", label: "Observations" },
                { key: "mean_engagement", label: "Mean engagement" },
                { key: "sleep_rate", label: "Sleep rate" },
              ]}
              empty="No students match the current filter."
            />
          </div>
        )}
      </Section>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <div className="text-slate-500 text-xs uppercase tracking-wide">
        {label}
      </div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function average(values) {
  const nums = values.filter((n) => Number.isFinite(n));
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
