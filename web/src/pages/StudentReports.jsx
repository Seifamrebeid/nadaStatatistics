import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { FileSpreadsheet, FileText, RefreshCw } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { exportXlsx, exportPdf } from "../lib/reportExport";

// Student-scoped reports: only this student's own data.

export default function StudentReports() {
  const { profile } = useAuth();
  const studentId = profile?.linked_id;

  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [activeTab, setActiveTab] = useState("engagement");

  async function load() {
    if (!studentId) return;
    setLoading(true); setErr(null);
    try {
      const [emotions, attendance, grades, lectures, subjects, doctors] = await Promise.all([
        getDocs(query(collection(db, "emotions"),   where("student_id", "==", studentId))),
        getDocs(query(collection(db, "attendance"), where("student_id", "==", studentId))),
        getDocs(query(collection(db, "grades"),     where("student_id", "==", studentId))),
        getDocs(collection(db, "lectures")),
        getDocs(collection(db, "subjects")),
        getDocs(collection(db, "doctors")),
      ]);
      setData({
        emotions:   emotions.docs.map(d => ({ id: d.id, ...d.data() })),
        attendance: attendance.docs.map(d => ({ id: d.id, ...d.data() })),
        grades:     grades.docs.map(d => ({ id: d.id, ...d.data() })),
        lectures:   lectures.docs.map(d => ({ id: d.id, ...d.data() })),
        subjects:   subjects.docs.map(d => ({ id: d.id, ...d.data() })),
        doctors:    doctors.docs.map(d => ({ id: d.id, ...d.data() })),
      });
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [studentId]);

  const reports = useMemo(() => {
    const lectureTitle = (lid) => data.lectures?.find(l => l.id === lid)?.title || lid;
    const subjectName  = (sid) => data.subjects?.find(s => s.id === sid)?.name  || sid;
    const doctorName   = (did) => data.doctors?.find(d => d.id === did)?.name   || did;

    // Engagement per lecture
    const perLecture = {};
    (data.emotions || []).forEach(e => {
      const k = e.lecture_id;
      if (!perLecture[k]) perLecture[k] = { obs: 0, sum: 0, sleeping: 0, hand: 0, yawn: 0 };
      perLecture[k].obs += 1;
      perLecture[k].sum += Number(e.engagement_score) || 0;
      if (e.state === "sleeping") perLecture[k].sleeping += 1;
      if (e.gesture === "hand_raised") perLecture[k].hand += 1;
      if (e.yawning === true) perLecture[k].yawn += 1;
    });
    const engagementRows = Object.entries(perLecture).map(([lid, v]) => {
      const lec = data.lectures?.find(l => l.id === lid);
      return {
        lecture_id: lid,
        lecture_title: lectureTitle(lid),
        subject: lec ? subjectName(lec.subject_id) : "—",
        doctor:  lec ? doctorName(lec.doctor_id)   : "—",
        observations: v.obs,
        mean_engagement_pct: Math.round((v.sum / v.obs) * 100),
        sleep_rate_pct:      Math.round((v.sleeping / v.obs) * 100),
        hand_raised_count:   v.hand,
        yawn_count:          v.yawn,
      };
    }).sort((a, b) => b.observations - a.observations);

    // Attendance log
    const attendanceRows = (data.attendance || []).map(a => {
      const lec = data.lectures?.find(l => l.id === a.lecture_id);
      return {
        lecture_id: a.lecture_id,
        lecture_title: lectureTitle(a.lecture_id),
        subject: lec ? subjectName(lec.subject_id) : "—",
        status: a.status,
        auto_detected: a.auto_detected ? "yes" : "no",
        timestamp: fmtTs(a.timestamp),
      };
    });

    // Grades
    const gradesRows = (data.grades || []).map(g => ({
      subject: subjectName(g.subject_id),
      doctor: doctorName(g.doctor_id),
      classwork: g.classwork ?? "—",
      week7: g.week7 ?? "—",
      week12: g.week12 ?? "—",
      final: g.final ?? "—",
      total: g.total ?? g.mark ?? "—",
      letter: g.letter ?? g.grade ?? "—",
    }));

    // Per-subject summary
    const subjMap = {};
    (data.emotions || []).forEach(e => {
      const lec = data.lectures?.find(l => l.id === e.lecture_id);
      if (!lec) return;
      const sid = lec.subject_id || "—";
      if (!subjMap[sid]) subjMap[sid] = { obs: 0, sum: 0, sleeping: 0 };
      subjMap[sid].obs += 1;
      subjMap[sid].sum += Number(e.engagement_score) || 0;
      if (e.state === "sleeping") subjMap[sid].sleeping += 1;
    });
    const subjectRows = Object.entries(subjMap).map(([sid, v]) => ({
      subject: subjectName(sid),
      observations: v.obs,
      mean_engagement_pct: Math.round((v.sum / v.obs) * 100),
      sleep_rate_pct:      Math.round((v.sleeping / v.obs) * 100),
    }));

    // All raw observations (capped to last 1000 for sanity)
    const obsRows = (data.emotions || [])
      .map(e => ({
        timestamp:        fmtTs(e.timestamp),
        lecture_title:    lectureTitle(e.lecture_id),
        emotion:          e.emotion || "—",
        state:            e.state || "—",
        gesture:          e.gesture || "—",
        engagement_score: e.engagement_score ?? "—",
        attention_score:  e.attention_score ?? "—",
        yawning:          e.yawning ? "yes" : "no",
      }))
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));

    return {
      engagement: {
        title: "Engagement per lecture",
        rows: engagementRows,
        columns: [
          { key: "lecture_id", label: "ID" },
          { key: "lecture_title", label: "Lecture" },
          { key: "subject", label: "Subject" },
          { key: "doctor", label: "Doctor" },
          { key: "observations", label: "Observations" },
          { key: "mean_engagement_pct", label: "Engagement %" },
          { key: "sleep_rate_pct", label: "Sleep %" },
          { key: "hand_raised_count", label: "Hand raises" },
          { key: "yawn_count", label: "Yawns" },
        ],
      },
      subjects: {
        title: "Engagement per subject",
        rows: subjectRows,
        columns: [
          { key: "subject", label: "Subject" },
          { key: "observations", label: "Observations" },
          { key: "mean_engagement_pct", label: "Engagement %" },
          { key: "sleep_rate_pct", label: "Sleep %" },
        ],
      },
      attendance: {
        title: "My attendance",
        rows: attendanceRows,
        columns: [
          { key: "lecture_id", label: "Lecture ID" },
          { key: "lecture_title", label: "Lecture" },
          { key: "subject", label: "Subject" },
          { key: "status", label: "Status" },
          { key: "auto_detected", label: "Auto?" },
          { key: "timestamp", label: "Timestamp" },
        ],
      },
      grades: {
        title: "My grades",
        rows: gradesRows,
        columns: [
          { key: "subject", label: "Subject" },
          { key: "doctor", label: "Doctor" },
          { key: "classwork", label: "Classwork" },
          { key: "week7", label: "Week 7" },
          { key: "week12", label: "Week 12" },
          { key: "final", label: "Final" },
          { key: "total", label: "Total" },
          { key: "letter", label: "Letter" },
        ],
      },
      observations: {
        title: "All observations (raw)",
        rows: obsRows,
        columns: [
          { key: "timestamp", label: "Timestamp" },
          { key: "lecture_title", label: "Lecture" },
          { key: "emotion", label: "Emotion" },
          { key: "state", label: "State" },
          { key: "gesture", label: "Gesture" },
          { key: "engagement_score", label: "Engagement" },
          { key: "attention_score", label: "Attention" },
          { key: "yawning", label: "Yawning" },
        ],
      },
    };
  }, [data]);

  const tabs = [
    { id: "engagement",   label: "Engagement",   count: reports.engagement?.rows.length },
    { id: "subjects",     label: "Per subject",  count: reports.subjects?.rows.length },
    { id: "attendance",   label: "Attendance",   count: reports.attendance?.rows.length },
    { id: "grades",       label: "Grades",       count: reports.grades?.rows.length },
    { id: "observations", label: "Raw data",     count: reports.observations?.rows.length },
  ];
  const active = reports[activeTab];

  function handleExportXlsx() {
    if (!active) return;
    exportXlsx({
      filename: `student-${activeTab}-${stamp()}.xlsx`,
      sheets: [{ name: active.title, columns: active.columns, rows: active.rows }],
    });
  }
  function handleExportPdf() {
    if (!active) return;
    exportPdf({
      filename: `student-${activeTab}-${stamp()}.pdf`,
      title: active.title,
      subtitle: `Total rows: ${active.rows.length}`,
      columns: active.columns,
      rows: active.rows,
    });
  }
  function handleExportAllXlsx() {
    exportXlsx({
      filename: `my-full-report-${stamp()}.xlsx`,
      sheets: tabs.map(t => ({
        name: reports[t.id].title.slice(0, 31),
        columns: reports[t.id].columns,
        rows: reports[t.id].rows,
      })),
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">My Reports</h1>
            <p className="mt-1 text-sm text-slate-500">
              Your engagement, attendance, grades, and raw observations. Export anything to Excel or PDF.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={load} disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button onClick={handleExportAllXlsx} disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              <FileSpreadsheet className="h-4 w-4" />
              Export full bundle (xlsx)
            </button>
          </div>
        </div>
      </div>

      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition ${
              activeTab === t.id
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}>
            {t.label}{t.count != null ? ` · ${t.count}` : ""}
          </button>
        ))}
      </div>

      {active && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-800">{active.title}</h2>
            <div className="flex gap-2">
              <button onClick={handleExportXlsx}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700">
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </button>
              <button onClick={handleExportPdf}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700">
                <FileText className="h-4 w-4" /> PDF
              </button>
            </div>
          </div>
          <PreviewTable rows={active.rows} columns={active.columns} />
        </div>
      )}
    </div>
  );
}

function PreviewTable({ rows, columns }) {
  if (!rows || rows.length === 0) {
    return <div className="px-6 py-8 text-center text-sm text-slate-500">No data.</div>;
  }
  const preview = rows.slice(0, 100);
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>{columns.map(c => <th key={c.key} className="px-3 py-2.5">{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {preview.map((r, i) => (
            <tr key={i} className="border-t border-slate-100">
              {columns.map(c => (
                <td key={c.key} className="px-3 py-2 text-slate-700 whitespace-nowrap">
                  {formatCell(r[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 100 && (
        <div className="px-5 py-2 text-xs text-slate-400 border-t border-slate-100">
          Showing first 100 of {rows.length} rows. Export to see everything.
        </div>
      )}
    </div>
  );
}
function formatCell(v) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
function fmtTs(ts) {
  if (!ts) return "";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString();
  } catch { return ""; }
}
function stamp() {
  return new Date().toISOString().replace(/[:T]/g, "-").replace(/\..+$/, "");
}
