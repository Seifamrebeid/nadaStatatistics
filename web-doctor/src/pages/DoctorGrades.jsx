import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import {
  collection, doc, getDocs, query, setDoc, where, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";

const ALL_LETTERS = ["A+","A","A-","B+","B","B-","C+","C","C-","D+","D","D-","F","W"];

// total out of 100; F if total < 40 OR final < 12
function computeLetter(total, finalScore) {
  if (total < 40) return "F";
  if ((Number(finalScore) || 0) < 12) return "F";
  if (total >= 95) return "A+";
  if (total >= 90) return "A";
  if (total >= 85) return "A-";
  if (total >= 80) return "B+";
  if (total >= 75) return "B";
  if (total >= 70) return "B-";
  if (total >= 65) return "C+";
  if (total >= 60) return "C";
  if (total >= 55) return "C-";
  if (total >= 50) return "D+";
  if (total >= 45) return "D";
  return "D-";
}

const LETTER_COLOR = {
  "A+": "bg-emerald-100 text-emerald-800",
  "A":  "bg-emerald-100 text-emerald-800",
  "A-": "bg-emerald-100 text-emerald-800",
  "B+": "bg-blue-100 text-blue-800",
  "B":  "bg-blue-100 text-blue-800",
  "B-": "bg-blue-100 text-blue-800",
  "C+": "bg-amber-100 text-amber-800",
  "C":  "bg-amber-100 text-amber-800",
  "C-": "bg-amber-100 text-amber-800",
  "D+": "bg-orange-100 text-orange-800",
  "D":  "bg-orange-100 text-orange-800",
  "D-": "bg-orange-100 text-orange-800",
  "F":  "bg-red-100 text-red-800",
  "W":  "bg-slate-100 text-slate-600",
};

function NumInput({ value, max, onChange, disabled }) {
  return (
    <input
      type="number"
      min={0}
      max={max}
      value={value}
      onChange={(e) => onChange(Math.min(max, Math.max(0, Number(e.target.value) || 0)))}
      disabled={disabled}
      className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-center text-sm disabled:bg-slate-50 disabled:text-slate-400"
    />
  );
}

const BLANK = { week7: "", week12: "", classwork: "", final: "", withdraw: false, letterOverride: "" };

export default function DoctorGrades() {
  const { profile } = useAuth();

  const [students, setStudents]   = useState([]);
  const [subjects, setSubjects]   = useState([]);
  const [classes, setClasses]     = useState([]);
  const [gradeMap, setGradeMap]   = useState({});
  const [edits, setEdits]         = useState({});
  const [saving, setSaving]       = useState({});
  const [filterSubject, setFilterSubject] = useState("");
  const [filterClass, setFilterClass]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  const doctorId = profile?.linked_id;

  async function load() {
    if (!doctorId) return;
    setLoading(true); setError(null);
    try {
      const [studSnap, subjSnap, clsSnap, gradeSnap] = await Promise.all([
        getDocs(query(collection(db, "students"), where("active", "==", true))),
        getDocs(query(collection(db, "subjects"), where("doctor_id", "==", doctorId))),
        getDocs(collection(db, "classes")),
        getDocs(query(collection(db, "grades"), where("doctor_id", "==", doctorId))),
      ]);

      setStudents(studSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setSubjects(subjSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setClasses(clsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const gm = {};
      gradeSnap.docs.forEach((d) => {
        const data = d.data();
        gm[`${data.student_id}_${data.subject_id}`] = { id: d.id, ...data };
      });
      setGradeMap(gm);

      const initEdits = {};
      gradeSnap.docs.forEach((d) => {
        const data = d.data();
        const key = `${data.student_id}_${data.subject_id}`;
        initEdits[key] = {
          week7:          data.week7     ?? "",
          week12:         data.week12    ?? "",
          classwork:      data.classwork ?? "",
          final:          data.final     ?? "",
          withdraw:       data.letter === "W",
          letterOverride: ALL_LETTERS.includes(data.letter) && data.letter !== "W" ? data.letter : "",
        };
      });
      setEdits(initEdits);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [doctorId]);

  const mySubjectIds     = useMemo(() => new Set(subjects.map((s) => s.id)), [subjects]);
  const relevantClasses  = useMemo(() => classes.filter((c) => mySubjectIds.has(c.subject_id)), [classes, mySubjectIds]);
  const filteredClasses  = useMemo(
    () => filterSubject ? relevantClasses.filter((c) => c.subject_id === filterSubject) : relevantClasses,
    [relevantClasses, filterSubject],
  );
  const displayedClasses = useMemo(
    () => filterClass ? filteredClasses.filter((c) => c.id === filterClass) : filteredClasses,
    [filteredClasses, filterClass],
  );

  const rows = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const cls of displayedClasses) {
      const subj = subjects.find((s) => s.id === cls.subject_id);
      if (!subj) continue;
      for (const sid of (cls.enrolled_student_ids || [])) {
        const key = `${sid}_${subj.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const student = students.find((s) => s.id === sid);
        result.push({ studentId: sid, studentName: student?.name || sid, subjectId: subj.id, subjectName: subj.name, key });
      }
    }
    return result.sort((a, b) => a.studentName.localeCompare(b.studentName));
  }, [displayedClasses, subjects, students]);

  function getEdit(key) {
    return edits[key] || { ...BLANK };
  }

  function setField(key, field, value) {
    setEdits((prev) => ({ ...prev, [key]: { ...(prev[key] || { ...BLANK }), [field]: value } }));
  }

  async function saveRow(row) {
    const e         = getEdit(row.key);
    const isWithdraw = e.withdraw;
    const week7     = isWithdraw ? null : (Number(e.week7)     || 0);
    const week12    = isWithdraw ? null : (Number(e.week12)    || 0);
    const classwork = isWithdraw ? null : (Number(e.classwork) || 0);
    const final_    = isWithdraw ? null : (Number(e.final)     || 0);
    const total     = isWithdraw ? null : week7 + week12 + classwork + final_;
    const letter    = isWithdraw ? "W"  : (e.letterOverride || computeLetter(total, final_));

    setSaving((prev) => ({ ...prev, [row.key]: true }));
    try {
      const docId = `${row.studentId}_${row.subjectId}`;
      await setDoc(doc(db, "grades", docId), {
        student_id: row.studentId,
        subject_id: row.subjectId,
        doctor_id:  doctorId,
        week7, week12, classwork,
        final: final_,
        total, letter,
        status:     isWithdraw ? "withdraw" : "graded",
        updated_at: serverTimestamp(),
      }, { merge: true });
      setGradeMap((prev) => ({
        ...prev,
        [row.key]: { student_id: row.studentId, subject_id: row.subjectId, week7, week12, classwork, final: final_, total, letter },
      }));
    } catch (err) {
      alert("Save failed: " + err.message);
    } finally {
      setSaving((prev) => ({ ...prev, [row.key]: false }));
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Grade Entry</h1>
            <p className="mt-1 text-sm text-slate-600">
              Week 7 (/30) + Week 12 (/20) + Classwork (/10) + Final (/40) = Total (/100). Passing is 40 or above.
            </p>
          </div>
          <button onClick={load} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <select value={filterSubject} onChange={(e) => { setFilterSubject(e.target.value); setFilterClass(""); }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">All subjects</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">All classes</option>
            {filteredClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {error && <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3 text-center">Week 7<br/><span className="normal-case font-normal">/30</span></th>
                <th className="px-4 py-3 text-center">Week 12<br/><span className="normal-case font-normal">/20</span></th>
                <th className="px-4 py-3 text-center">Classwork<br/><span className="normal-case font-normal">/10</span></th>
                <th className="px-4 py-3 text-center">Final<br/><span className="normal-case font-normal">/40</span></th>
                <th className="px-4 py-3 text-center">Total<br/><span className="normal-case font-normal">/100</span></th>
                <th className="px-4 py-3 text-center">Letter</th>
                <th className="px-4 py-3 text-center">Override</th>
                <th className="px-4 py-3 text-center">W</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const e      = getEdit(row.key);
                const isW    = e.withdraw;
                const w7     = isW ? 0 : (Number(e.week7)     || 0);
                const w12    = isW ? 0 : (Number(e.week12)    || 0);
                const cw     = isW ? 0 : (Number(e.classwork) || 0);
                const fn     = isW ? 0 : (Number(e.final)     || 0);
                const total  = w7 + w12 + cw + fn;
                const hasAny = !isW && (e.week7 !== "" || e.week12 !== "" || e.classwork !== "" || e.final !== "");
                const autoLetter = hasAny ? computeLetter(total, fn) : "—";
                const letter     = isW ? "W" : (e.letterOverride || autoLetter);
                const isSaving   = !!saving[row.key];
                return (
                  <tr key={row.key} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-900">{row.studentName}</td>
                    <td className="px-4 py-2 text-slate-600">{row.subjectName}</td>
                    <td className="px-4 py-2 text-center">
                      <NumInput value={e.week7} max={30} onChange={(v) => setField(row.key, "week7", v)} disabled={isW} />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <NumInput value={e.week12} max={20} onChange={(v) => setField(row.key, "week12", v)} disabled={isW} />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <NumInput value={e.classwork} max={10} onChange={(v) => setField(row.key, "classwork", v)} disabled={isW} />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <NumInput value={e.final} max={40} onChange={(v) => setField(row.key, "final", v)} disabled={isW} />
                    </td>
                    <td className="px-4 py-2 text-center font-semibold text-slate-800">
                      {isW ? "—" : (hasAny ? total : "—")}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${LETTER_COLOR[letter] || "bg-slate-100 text-slate-600"}`}>
                        {letter}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <select
                        value={e.letterOverride}
                        onChange={(ev) => setField(row.key, "letterOverride", ev.target.value)}
                        disabled={isW}
                        className="rounded border border-slate-300 px-1 py-0.5 text-xs disabled:bg-slate-50 disabled:text-slate-400"
                      >
                        <option value="">Auto</option>
                        {ALL_LETTERS.filter((l) => l !== "W").map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <input type="checkbox" checked={isW}
                        onChange={(ev) => setField(row.key, "withdraw", ev.target.checked)}
                        className="h-4 w-4 accent-slate-600" />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => saveRow(row)} disabled={isSaving}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                        <Save className="h-3 w-3" />
                        {isSaving ? "…" : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                    {doctorId ? "No students found. Select a subject/class above." : "Loading…"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
