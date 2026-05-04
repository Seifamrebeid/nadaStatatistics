import { useEffect, useMemo, useState } from "react";
import api from "../services/api";

const v = (x) => (Array.isArray(x) ? x[0] : x);

function normalise(row) {
  const out = {};
  for (const [k, val] of Object.entries(row || {})) out[k] = v(val);
  return out;
}

export default function StudentHierarchy() {
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [selectedWeekId, setSelectedWeekId] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get("/api/subjects"),
      api.get("/api/classes"),
      api.get("/api/weeks"),
      api.get("/api/lectures"),
    ])
      .then(([sRes, cRes, wRes, lRes]) => {
        const subjectRows = (Array.isArray(sRes.data) ? sRes.data : []).map(
          normalise,
        );
        const classRows = (Array.isArray(cRes.data) ? cRes.data : []).map(
          normalise,
        );
        const weekRows = (Array.isArray(wRes.data) ? wRes.data : []).map(
          normalise,
        );
        const lectureRows = (Array.isArray(lRes.data) ? lRes.data : []).map(
          normalise,
        );
        setSubjects(subjectRows);
        setClasses(classRows);
        setWeeks(weekRows);
        setLectures(lectureRows);
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

  const weekLectures = useMemo(() => {
    if (!selectedWeek) return [];
    return lectures.filter((lecture) => lecture.week_id === selectedWeek.id);
  }, [lectures, selectedWeek]);

  if (err) {
    return <div className="text-red-600">Failed to load hierarchy: {err}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My learning hierarchy</h1>
        <p className="text-sm text-slate-500 mt-1">
          Follow your subject, class, week, and lecture structure.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Subjects">
          {subjects.map((subject) => (
            <Choice
              key={subject.id}
              label={subject.name || subject.id}
              active={selectedSubjectId === subject.id}
              onClick={() => {
                setSelectedSubjectId(subject.id);
                setSelectedClassId(null);
                setSelectedWeekId(null);
              }}
            />
          ))}
          {subjects.length === 0 && (
            <div className="text-slate-500 text-sm">No subjects found.</div>
          )}
        </Panel>

        <Panel
          title={
            selectedSubject ? `Classes in ${selectedSubject.name}` : "Classes"
          }
        >
          {subjectClasses.map((cls) => (
            <Choice
              key={cls.id}
              label={`${cls.name || cls.id}${cls.section ? ` · ${cls.section}` : ""}`}
              active={selectedClassId === cls.id}
              onClick={() => {
                setSelectedClassId(cls.id);
                setSelectedWeekId(null);
              }}
            />
          ))}
          {subjectClasses.length === 0 && (
            <div className="text-slate-500 text-sm">Pick a subject first.</div>
          )}
        </Panel>

        <Panel
          title={selectedClass ? `Weeks in ${selectedClass.name}` : "Weeks"}
        >
          {classWeeks.map((week) => (
            <Choice
              key={week.id}
              label={`Week ${week.week_number || "?"} · ${week.title || "Untitled"}`}
              active={selectedWeekId === week.id}
              onClick={() => setSelectedWeekId(week.id)}
            />
          ))}
          {classWeeks.length === 0 && (
            <div className="text-slate-500 text-sm">Pick a class first.</div>
          )}
        </Panel>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Lectures for selected week</h2>
        {!selectedWeek ? (
          <div className="bg-white rounded-lg shadow p-6 text-slate-500">
            Select a week to see lectures.
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-4 py-3">Title</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Starts</th>
                  <th className="text-left px-4 py-3">Lecture ID</th>
                </tr>
              </thead>
              <tbody>
                {weekLectures.map((lecture) => (
                  <tr key={lecture.id} className="border-t">
                    <td className="px-4 py-3">{lecture.title || lecture.id}</td>
                    <td className="px-4 py-3">
                      {lecture.status || "scheduled"}
                    </td>
                    <td className="px-4 py-3">
                      {lecture.starts_at
                        ? new Date(lecture.starts_at).toLocaleString()
                        : "-"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {lecture.id}
                    </td>
                  </tr>
                ))}
                {weekLectures.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 text-slate-500" colSpan={4}>
                      No lectures linked to this week yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section className="bg-white rounded-lg shadow p-3 space-y-2">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Choice({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded border ${
        active
          ? "border-brand text-brand bg-brand/5"
          : "border-slate-200 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}
