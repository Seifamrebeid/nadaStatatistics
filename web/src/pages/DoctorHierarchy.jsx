import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import CrudTable from "../components/CrudTable";
import FilterBar, { makeFilter } from "../components/FilterBar";

const subjectFilter = makeFilter({
  search: { fields: ["name", "code"] },
  selects: [{ key: "active", field: "active" }],
});
const studentRowFilter = makeFilter({
  search: { fields: ["name", "email", "id"] },
});

export default function DoctorHierarchy() {
  const { profile } = useAuth();
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
    const fetchAll = async () => {
      try {
        const doctorId = profile?.linked_id;

        let subSnap;
        if (doctorId) {
          subSnap = await getDocs(
            query(collection(db, "subjects"), where("doctor_id", "==", doctorId))
          );
        } else {
          subSnap = await getDocs(collection(db, "subjects"));
        }
        const subjectRows = subSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const subjectIds = subjectRows.map((s) => s.id);

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

        const studentsSnap = await getDocs(collection(db, "students"));
        const studentRows = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        setSubjects(subjectRows);
        setClasses(classRows);
        setWeeks(weekRows);
        setStudents(studentRows);
        setSelectedSubjectId(subjectRows[0]?.id || null);
      } catch (e) {
        setErr(e.message);
      }
    };
    fetchAll();
  }, [profile]);

  const selectedSubject = useMemo(
    () => subjects.find((s) => s.id === selectedSubjectId) || null,
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
      !subjects.some((s) => s.id === selectedSubjectId)
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
    const fetchEmotions = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "emotions"), where("lecture_id", "==", linkedLectureId))
        );
        setEmotions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        setErr(e.message);
      }
    };
    fetchEmotions();
  }, [linkedLectureId]);

  const enrolledStudents = useMemo(() => {
    const roster = new Set(selectedClass?.enrolled_student_ids || []);
    return students.filter((s) => roster.has(s.id));
  }, [students, selectedClass]);

  const filteredSubjects = useMemo(
    () => subjects.filter(subjectFilter(subjectFilters)),
    [subjects, subjectFilters],
  );

  const studentRowsAll = useMemo(() => {
    if (!selectedWeek) return [];
    return enrolledStudents.map((student) => {
      const rows = emotions.filter((e) => e.student_id === student.id);
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
        row.date
          ? (row.date?.toDate ? row.date.toDate() : new Date(row.date)).toLocaleDateString()
          : "—",
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
