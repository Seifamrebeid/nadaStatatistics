import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { FileSpreadsheet, FileText, RefreshCw } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { exportXlsx, exportPdf } from "../lib/reportExport";

// Doctor-scoped reports: only data where the doctor is involved.

export default function DoctorReports() {
  const { profile } = useAuth();
  const doctorId = profile?.linked_id;

  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [activeTab, setActiveTab] = useState("students");

  async function load() {
    if (!doctorId) return;
    setLoading(true); setErr(null);
    try {
      const [subjects, classes, weeks, lectures, students,
             emotions, attendance, grades, notifications] = await Promise.all([
        getDocs(query(collection(db, "subjects"), where("doctor_id", "==", doctorId))),
        getDocs(collection(db, "classes")),
        getDocs(collection(db, "weeks")),
        getDocs(query(collection(db, "lectures"), where("doctor_id", "==", doctorId))),
        getDocs(collection(db, "students")),
        getDocs(collection(db, "emotions")),
        getDocs(collection(db, "attendance")),
        getDocs(query(collection(db, "grades"),   where("doctor_id", "==", doctorId))),
        getDocs(query(collection(db, "notifications"), where("sender_doctor_id", "==", doctorId))),
      ]);
      setData({
        subjects:      subjects.docs.map(d => ({ id: d.id, ...d.data() })),
        classes:       classes.docs.map(d => ({ id: d.id, ...d.data() })),
        weeks:         weeks.docs.map(d => ({ id: d.id, ...d.data() })),
        lectures:      lectures.docs.map(d => ({ id: d.id, ...d.data() })),
        students:      students.docs.map(d => ({ id: d.id, ...d.data() })),
        emotions:      emotions.docs.map(d => ({ id: d.id, ...d.data() })),
        attendance:    attendance.docs.map(d => ({ id: d.id, ...d.data() })),
        grades:        grades.docs.map(d => ({ id: d.id, ...d.data() })),
        notifications: notifications.docs.map(d => ({ id: d.id, ...d.data() })),
      });
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [doctorId]);

  const reports = useMemo(() => {
    const myLecIds = new Set((data.lectures || []).map(l => l.id));
    const myStudentIds = new Set();
    (data.lectures || []).forEach(l =>
      (l.enrolled_student_ids || []).forEach(sid => myStudentIds.add(sid))
    );

    const studentName = (sid) => data.students?.find(s => s.id === sid)?.name || sid;
    const subjectName = (sid) => data.subjects?.find(s => s.id === sid)?.name || sid;
    const lectureTitle= (lid) => data.lectures?.find(l => l.id === lid)?.title || lid;

    const myObs = (data.emotions || []).filter(e => myLecIds.has(e.lecture_id));
    const myAtt = (data.attendance || []).filter(a => myLecIds.has(a.lecture_id));

    const studentEngagement = [...myStudentIds].map(sid => {
      const obs = myObs.filter(e => e.student_id === sid);
      const att = myAtt.filter(a => a.student_id === sid);
      const present = att.filter(a => a.status === "present").length;
      const meanEng = obs.length
        ? obs.reduce((s, e) => s + (Number(e.engagement_score) || 0), 0) / obs.length : 0;
      return {
        student_id: sid,
        name: studentName(sid),
        observations: obs.length,
        attended: present,
        absent: att.filter(a => a.status === "absent").length,
        attendance_rate_pct: att.length ? Math.round((present / att.length) * 100) : 0,
        mean_engagement_pct: Math.round(meanEng * 100),
        sleep_rate_pct: obs.length
          ? Math.round((obs.filter(e => e.state === "sleeping").length / obs.length) * 100) : 0,
        hand_raised_count: obs.filter(e => e.gesture === "hand_raised").length,
      };
    });

    const lectureRollup = (data.lectures || []).map(l => {
      const obs = myObs.filter(e => e.lecture_id === l.id);
      const att = myAtt.filter(a => a.lecture_id === l.id);
      const meanEng = obs.length
        ? obs.reduce((s, e) => s + (Number(e.engagement_score) || 0), 0) / obs.length : 0;
      return {
        lecture_id: l.id,
        title: l.title || "—",
        subject: subjectName(l.subject_id),
        status: l.status || "—",
        date: l.date || l.scheduled_start || "—",
        students_seen: new Set(obs.map(e => e.student_id)).size,
        observations: obs.length,
        present_count: att.filter(a => a.status === "present").length,
        mean_engagement_pct: Math.round(meanEng * 100),
        sleep_rate_pct: obs.length
          ? Math.round((obs.filter(e => e.state === "sleeping").length / obs.length) * 100) : 0,
      };
    });

    const attendanceLog = myAtt.map(a => ({
      student_id: a.student_id,
      student_name: studentName(a.student_id),
      lecture_id: a.lecture_id,
      lecture_title: lectureTitle(a.lecture_id),
      status: a.status,
      auto_detected: a.auto_detected ? "yes" : "no",
      timestamp: fmtTs(a.timestamp),
    }));

    const gradesReport = (data.grades || []).map(g => ({
      student_id: g.student_id,
      student_name: studentName(g.student_id),
      subject: subjectName(g.subject_id),
      classwork: g.classwork ?? "—",
      week7: g.week7 ?? "—",
      week12: g.week12 ?? "—",
      final: g.final ?? "—",
      total: g.total ?? g.mark ?? "—",
      letter: g.letter ?? g.grade ?? "—",
    }));

    const notificationsLog = (data.notifications || []).map(n => ({
      lecture: lectureTitle(n.lecture_id),
      recipients: Array.isArray(n.recipient_emails) ? n.recipient_emails.length : 0,
      status: n.status || "—",
      subject: n.subject || "—",
      sent_at: fmtTs(n.sent_at),
    }));

    return {
      students: {
        title: "My Students — engagement overview",
        rows: studentEngagement,
        columns: [
          { key: "student_id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "observations", label: "Observations" },
          { key: "attended", label: "Attended" },
          { key: "absent", label: "Absent" },
          { key: "attendance_rate_pct", label: "Attendance %" },
          { key: "mean_engagement_pct", label: "Engagement %" },
          { key: "sleep_rate_pct", label: "Sleep %" },
          { key: "hand_raised_count", label: "Hand raises" },
        ],
      },
      lectures: {
        title: "My Lectures",
        rows: lectureRollup,
        columns: [
          { key: "lecture_id", label: "ID" },
          { key: "title", label: "Title" },
          { key: "subject", label: "Subject" },
          { key: "status", label: "Status" },
          { key: "date", label: "Date" },
          { key: "students_seen", label: "Students seen" },
          { key: "observations", label: "Observations" },
          { key: "present_count", label: "Present" },
          { key: "mean_engagement_pct", label: "Engagement %" },
          { key: "sleep_rate_pct", label: "Sleep %" },
        ],
      },
      attendance: {
        title: "Attendance Log",
        rows: attendanceLog,
        columns: [
          { key: "student_id", label: "Student ID" },
          { key: "student_name", label: "Student" },
          { key: "lecture_id", label: "Lecture ID" },
          { key: "lecture_title", label: "Lecture" },
          { key: "status", label: "Status" },
          { key: "auto_detected", label: "Auto?" },
          { key: "timestamp", label: "Timestamp" },
        ],
      },
      grades: {
        title: "Grades I gave",
        rows: gradesReport,
        columns: [
          { key: "student_id", label: "Student ID" },
          { key: "student_name", label: "Student" },
          { key: "subject", label: "Subject" },
          { key: "classwork", label: "Classwork" },
          { key: "week7", label: "Week 7" },
          { key: "week12", label: "Week 12" },
          { key: "final", label: "Final" },
          { key: "total", label: "Total" },
          { key: "letter", label: "Letter" },
        ],
      },
      notifications: {
        title: "Notifications I sent",
        rows: notificationsLog,
        columns: [
          { key: "lecture", label: "Lecture" },
          { key: "recipients", label: "Recipients" },
          { key: "status", label: "Status" },
          { key: "subject", label: "Subject" },
          { key: "sent_at", label: "Sent at" },
        ],
      },
    };
  }, [data]);

  const tabs = [
    { id: "students",      label: "My Students",   count: reports.students?.rows.length },
    { id: "lectures",      label: "My Lectures",   count: reports.lectures?.rows.length },
    { id: "attendance",    label: "Attendance",    count: reports.attendance?.rows.length },
    { id: "grades",        label: "Grades",        count: reports.grades?.rows.length },
    { id: "notifications", label: "Notifications", count: reports.notifications?.rows.length },
  ];
  const active = reports[activeTab];

  function handleExportXlsx() {
    if (!active) return;
    exportXlsx({
      filename: `doctor-${activeTab}-${stamp()}.xlsx`,
      sheets: [{ name: active.title, columns: active.columns, rows: active.rows }],
    });
  }
  function handleExportPdf() {
    if (!active) return;
    exportPdf({
      filename: `doctor-${activeTab}-${stamp()}.pdf`,
      title: active.title,
      subtitle: `Total rows: ${active.rows.length}`,
      columns: active.columns,
      rows: active.rows,
    });
  }
  function handleExportAllXlsx() {
    exportXlsx({
      filename: `doctor-full-report-${stamp()}.xlsx`,
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
            <h1 className="text-2xl font-semibold text-slate-900">Reports</h1>
            <p className="mt-1 text-sm text-slate-500">
              Aggregated data scoped to you. Pick a report and export as Excel or PDF.
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
