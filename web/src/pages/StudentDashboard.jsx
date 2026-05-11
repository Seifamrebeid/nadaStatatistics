import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import StatCard from "../components/StatCard";
import {
  AlertTriangle,
  BookOpen,
  Brain,
  CalendarClock,
  CheckCircle2,
  Clock,
  Lightbulb,
  Presentation,
  Radio,
  Smile,
  TrendingUp,
  User,
} from "lucide-react";

/* ─────────────────────────────────────────────────────── helpers ── */
const avg = (arr) => (arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length);

function pct(n, decimals = 1) {
  return `${Number(n).toFixed(decimals)}%`;
}

function timeAgo(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/* ─────────────────────────────────────────── loading skeleton ── */
function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* header */}
      <div className="h-10 w-64 bg-slate-200 rounded-lg" />
      {/* stat grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="h-3 w-20 bg-slate-200 rounded" />
            <div className="h-8 w-24 bg-slate-200 rounded mt-3" />
          </div>
        ))}
      </div>
      {/* bars */}
      <div className="card p-6">
        <div className="h-4 w-40 bg-slate-200 rounded mb-5" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <div className="h-3 w-32 bg-slate-200 rounded mb-2" />
              <div className="h-2 bg-slate-100 rounded-full">
                <div className="h-2 bg-slate-200 rounded-full" style={{ width: `${30 + i * 15}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────── progress bar row ── */
function Bar({ label, value, max = 100, colorClass = "bg-emerald-500", valueLabel }) {
  const w = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div>
      <div className="flex justify-between items-center text-sm mb-1.5">
        <span className="text-slate-600">{label}</span>
        <span className={`font-semibold ${colorClass.replace("bg-", "text-")}`}>
          {valueLabel ?? pct(value)}
        </span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2">
        <div
          className={`${colorClass} h-2 rounded-full transition-all duration-700`}
          style={{ width: `${w}%` }}
        />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────── warning pill ── */
const WARNING_TYPE = {
  attention: { bg: "bg-amber-50 text-amber-700 ring-amber-100", icon: AlertTriangle },
  cheating:  { bg: "bg-red-50   text-red-700   ring-red-100",   icon: AlertTriangle },
  default:   { bg: "bg-slate-100 text-slate-600 ring-slate-200", icon: AlertTriangle },
};

function WarningPill({ w }) {
  const t = WARNING_TYPE[w.type] ?? WARNING_TYPE.default;
  const Icon = t.icon;
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ring-1 ${t.bg}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon className="h-4 w-4 flex-shrink-0" />
        <div className="min-w-0">
          <span className="text-sm font-medium capitalize">{w.type ?? "warning"}</span>
          {w.score !== undefined && (
            <span className="ml-2 text-xs opacity-70">score {Number(w.score).toFixed(2)}</span>
          )}
          {w.note && (
            <p className="text-xs opacity-70 truncate mt-0.5">{w.note}</p>
          )}
        </div>
      </div>
      <span className="text-xs flex-shrink-0 opacity-60">{timeAgo(w.timestamp)}</span>
    </div>
  );
}

/* ══════════════════════════════════════ main component ══════════════ */
export default function StudentDashboard() {
  const { profile } = useAuth();

  const [studentName, setStudentName]   = useState(null);
  const [stats,       setStats]         = useState(null);
  const [comparison,  setComparison]    = useState(null);
  const [lectures,    setLectures]      = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [firestoreRecs,   setFirestoreRecs]   = useState(null); // null = not loaded yet
  const [warnings,    setWarnings]       = useState([]);
  const [err,         setErr]            = useState(null);

  useEffect(() => {
    if (!profile?.linked_id) return;

    const fetchDashboard = async () => {
      try {
        const studentId = profile.linked_id;

        /* 1. Student name ──────────────────────────────────────── */
        const studentDocSnap = await getDoc(doc(db, "students", studentId));
        if (studentDocSnap.exists()) setStudentName(studentDocSnap.data().name ?? null);

        /* 2. Enrolled lectures ─────────────────────────────────── */
        const lectureSnap = await getDocs(
          query(
            collection(db, "lectures"),
            where("enrolled_student_ids", "array-contains", studentId),
          ),
        );
        const lecturesList = lectureSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const recordingLectures = lecturesList.filter((l) => l.status === "recording");

        /* 3. Attendance ────────────────────────────────────────── */
        const attendanceSnap = await getDocs(
          query(
            collection(db, "attendance"),
            where("student_id", "==", studentId),
            where("status", "==", "present"),
          ),
        );
        const attendedCount = attendanceSnap.size;
        const enrolledCount = lecturesList.length;
        const attendancePct = enrolledCount > 0 ? (attendedCount / enrolledCount) * 100 : 0;

        /* 4. My emotions (engagement + attention) ──────────────── */
        const myEmotionsSnap = await getDocs(
          query(collection(db, "emotions"), where("student_id", "==", studentId)),
        );
        const myData = myEmotionsSnap.docs.map((d) => d.data());

        const allEngScores  = myData.map((e) => e.engagement_score ?? 0);
        const allAttnScores = myData.map((e) => e.attention_score  ?? e.engagement_score ?? 0);
        const myAvgEng  = avg(allEngScores)  * 100;
        const myAvgAttn = avg(allAttnScores) * 100;

        /* 5. Class averages for same lectures ──────────────────── */
        const lectureIds = [...new Set(myData.map((e) => e.lecture_id))];
        let classAvgEng = 0, classAvgAttn = 0;

        if (lectureIds.length > 0) {
          const classSnap = await getDocs(
            query(
              collection(db, "emotions"),
              where("lecture_id", "in", lectureIds.slice(0, 30)),
            ),
          );
          const classData = classSnap.docs.map((d) => d.data());
          classAvgEng  = avg(classData.map((e) => e.engagement_score  ?? 0)) * 100;
          classAvgAttn = avg(classData.map((e) => e.attention_score ?? e.engagement_score ?? 0)) * 100;
        }

        /* 6. Warnings (last 7 days) ─────────────────────────────── */
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        let warningsData = [];
        try {
          const warnSnap = await getDocs(
            query(
              collection(db, "warnings"),
              where("student_id", "==", studentId),
              orderBy("timestamp", "desc"),
              limit(10),
            ),
          );
          warningsData = warnSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch {
          // warnings collection may not exist yet — degrade gracefully
        }
        const activeWarningCount = warningsData.filter((w) => {
          if (!w.timestamp) return false;
          const d = w.timestamp?.toDate ? w.timestamp.toDate() : new Date(w.timestamp);
          return d >= sevenDaysAgo;
        }).length;

        /* 7. Firestore recommendations ──────────────────────────── */
        let fsRecs = [];
        try {
          const recSnap = await getDocs(
            query(
              collection(db, "recommendations"),
              where("student_id", "==", studentId),
              orderBy("generated_at", "desc"),
              limit(1),
            ),
          );
          if (!recSnap.empty) {
            const recDoc = recSnap.docs[0].data();
            fsRecs = Array.isArray(recDoc.items) ? recDoc.items : [];
          }
        } catch {
          // recommendations collection may not exist — fall through to client-side
        }
        setFirestoreRecs(fsRecs);

        /* 8. Client-side fallback recommendations ────────────────── */
        if (fsRecs.length === 0) {
          const clientRecs = [];
          if (myAvgEng < 50)    clientRecs.push("Your engagement score is below 50% — try to minimise distractions during lectures.");
          if (attendancePct < 80) clientRecs.push("Your attendance rate is below 80% — try to attend more sessions.");
          if (myAvgAttn < 60)   clientRecs.push("Your attention score could be improved — consider sitting closer to the front.");
          if (activeWarningCount >= 3) clientRecs.push("You have several recent warnings — please speak with your lecturer.");
          if (clientRecs.length === 0) clientRecs.push("Great work! Keep maintaining your current attendance and engagement level.");
          setRecommendations(clientRecs);
        }

        setWarnings(warningsData);
        setComparison({ myAvgEng, classAvgEng, myAvgAttn, classAvgAttn });
        setLectures(lecturesList);
        setStats({
          enrolledCount,
          recordingCount: recordingLectures.length,
          attendedCount,
          attendancePct,
          avgEngagement: myAvgEng,
          avgAttention: myAvgAttn,
          activeWarningCount,
        });
      } catch (error) {
        console.error("Error fetching dashboard:", error);
        setErr(error.message);
      }
    };

    fetchDashboard();
  }, [profile?.linked_id]);

  /* ── error ── */
  if (err) {
    return (
      <div className="card p-6 text-red-700 bg-red-50 border-red-200">
        <p className="font-semibold">Failed to load dashboard</p>
        <p className="text-sm mt-1">{err}</p>
      </div>
    );
  }

  /* ── skeleton ── */
  if (!stats) return <Skeleton />;

  /* ── derived display values ── */
  const live        = stats.recordingCount > 0;
  const { myAvgEng, classAvgEng, myAvgAttn, classAvgAttn } = comparison;
  const engRatio    = classAvgEng  > 0 ? Math.min(150, (myAvgEng  / classAvgEng)  * 100) : 0;
  const attnRatio   = classAvgAttn > 0 ? Math.min(150, (myAvgAttn / classAvgAttn) * 100) : 0;
  const shownRecs   = firestoreRecs?.length > 0 ? firestoreRecs : recommendations;

  return (
    <div className="space-y-6">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center ring-1 ring-brand-100">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
              {studentName ? `Welcome back, ${studentName.split(" ")[0]}` : "Welcome back"}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Here's your learning snapshot for today.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {live && (
            <span className="badge bg-red-50 text-red-700 ring-1 ring-red-100 gap-1.5 px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              {stats.recordingCount} lecture{stats.recordingCount > 1 ? "s" : ""} live now
            </span>
          )}
          {stats.activeWarningCount > 0 && (
            <span className="badge bg-amber-50 text-amber-700 ring-1 ring-amber-100 gap-1.5 px-2.5 py-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              {stats.activeWarningCount} warning{stats.activeWarningCount > 1 ? "s" : ""} this week
            </span>
          )}
        </div>
      </div>

      {/* ── Stats grid (6 cards) ─────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          label="Enrolled Lectures"
          value={stats.enrolledCount}
          accent="brand"
          icon={Presentation}
          hint="total enrolments"
        />
        <StatCard
          label="Lectures Attended"
          value={stats.attendedCount}
          accent="green"
          icon={CheckCircle2}
          hint="marked present"
        />
        <StatCard
          label="Attendance Rate"
          value={pct(stats.attendancePct, 0)}
          accent={
            stats.attendancePct >= 80 ? "green" :
            stats.attendancePct >= 60 ? "amber" : "red"
          }
          icon={CalendarClock}
          hint={stats.attendancePct < 80 ? "below threshold" : "on track"}
        />
        <StatCard
          label="Avg Engagement"
          value={pct(stats.avgEngagement, 1)}
          accent={
            stats.avgEngagement >= 70 ? "green" :
            stats.avgEngagement >= 45 ? "amber" : "red"
          }
          icon={Smile}
          hint="across all lectures"
        />
        <StatCard
          label="Avg Attention"
          value={pct(stats.avgAttention, 1)}
          accent={
            stats.avgAttention >= 70 ? "green" :
            stats.avgAttention >= 45 ? "amber" : "red"
          }
          icon={Brain}
          hint="focus & eye contact"
        />
        <StatCard
          label="Active Warnings"
          value={stats.activeWarningCount}
          accent={
            stats.activeWarningCount === 0 ? "green" :
            stats.activeWarningCount <= 2   ? "amber" : "red"
          }
          icon={AlertTriangle}
          hint="last 7 days"
        />
      </div>

      {/* ── Engagement + Attention bars ──────────────────────────── */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-4 w-4 text-slate-400" />
          <h2 className="font-semibold text-slate-900">You vs. Class Average</h2>
        </div>
        <p className="text-xs text-slate-500 mb-5">
          Compared against classmates in your enrolled lectures.
        </p>

        <div className="space-y-5">
          {/* Engagement */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Engagement</p>
            <Bar label="Your score"   value={myAvgEng}   colorClass="bg-emerald-500" />
            <Bar label="Class average" value={classAvgEng} colorClass="bg-brand-500" />
            {classAvgEng > 0 && (
              <p className="text-xs text-slate-500">
                You're at{" "}
                <span className="font-semibold text-slate-700">{engRatio.toFixed(0)}%</span>{" "}
                of the class engagement average.
              </p>
            )}
          </div>

          <hr className="border-slate-100" />

          {/* Attention */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Attention</p>
            <Bar label="Your score"    value={myAvgAttn}   colorClass="bg-amber-400" />
            <Bar label="Class average" value={classAvgAttn} colorClass="bg-brand-500" />
            {classAvgAttn > 0 && (
              <p className="text-xs text-slate-500">
                You're at{" "}
                <span className="font-semibold text-slate-700">{attnRatio.toFixed(0)}%</span>{" "}
                of the class attention average.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Smart Recommendations ────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-1">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          <h2 className="font-semibold text-slate-900">Smart Recommendations</h2>
          {firestoreRecs !== null && firestoreRecs.length > 0 && (
            <span className="ml-auto badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 text-xs px-2 py-0.5">
              AI-generated
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Tailored actions based on your attendance, engagement, and warning trends.
        </p>

        {shownRecs.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {shownRecs.map((item, idx) => {
              const text = typeof item === "string" ? item : (item.text ?? item.message ?? JSON.stringify(item));
              const priority = typeof item === "object" ? (item.priority ?? "medium") : "medium";
              const borderColor =
                priority === "high"   ? "border-red-200   bg-red-50"   :
                priority === "medium" ? "border-amber-200 bg-amber-50" :
                                        "border-slate-200 bg-slate-50";
              return (
                <div
                  key={idx}
                  className={`rounded-xl border px-4 py-3 text-sm text-slate-700 ${borderColor}`}
                >
                  <div className="flex items-start gap-2">
                    <BookOpen className="h-4 w-4 flex-shrink-0 mt-0.5 text-slate-400" />
                    <span>{text}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-slate-500 text-sm text-center py-4">
            No recommendations available yet.
          </div>
        )}
      </div>

      {/* ── Warnings history ─────────────────────────────────────── */}
      {warnings.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="font-semibold text-slate-900">Recent Warnings</h2>
            <span className="ml-auto text-xs text-slate-400">last 10</span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Flagged attention and behaviour events from your lectures.
          </p>
          <div className="space-y-2">
            {warnings.map((w) => <WarningPill key={w.id} w={w} />)}
          </div>
        </div>
      )}

      {/* ── Recent lectures ──────────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="h-4 w-4 text-slate-400" />
          <h2 className="font-semibold text-slate-900">Recent Lectures</h2>
          <span className="ml-auto text-xs text-slate-400">{lectures.length} enrolled</span>
        </div>
        <p className="text-xs text-slate-500 mb-4">Your enrolled lecture sessions.</p>

        <div className="divide-y divide-slate-100">
          {lectures
            .sort((a, b) => {
              const da = a.date?.toDate ? a.date.toDate() : new Date(a.date ?? 0);
              const db_ = b.date?.toDate ? b.date.toDate() : new Date(b.date ?? 0);
              return db_ - da;
            })
            .slice(0, 8)
            .map((l) => {
              const status = l.status ?? "scheduled";
              const statusStyle =
                status === "recording"
                  ? "bg-red-50 text-red-700 ring-red-100"
                  : status === "finished"
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                  : "bg-slate-100 text-slate-600 ring-slate-200";
              return (
                <div key={l.id} className="flex justify-between items-center py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center ring-1 ring-brand-100 flex-shrink-0">
                      {status === "recording" ? (
                        <Radio className="h-4 w-4" />
                      ) : (
                        <CalendarClock className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">{l.title ?? "Untitled"}</div>
                      <div className="text-xs text-slate-500">
                        {l.subject ? `${l.subject} · ` : ""}
                        {fmtDate(l.date)}
                      </div>
                    </div>
                  </div>
                  <span className={`badge ring-1 ${statusStyle} flex-shrink-0`}>
                    {status === "recording" && (
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 mr-1.5 animate-pulse" />
                    )}
                    {status}
                  </span>
                </div>
              );
            })}

          {lectures.length === 0 && (
            <div className="text-slate-500 text-sm text-center py-8">
              No enrolled lectures yet.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
