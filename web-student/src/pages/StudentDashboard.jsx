import { useEffect, useState } from "react";
import api from "../services/api";
import StatCard from "../components/StatCard";
import { Presentation, Radio, Smile, CalendarClock } from "lucide-react";

const v = (x) => (Array.isArray(x) ? x[0] : x);

export default function StudentDashboard() {
  const [stats, setStats] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [lectures, setLectures] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const me = await api.get("/api/me");
        const studentId = v(me.data.linked_id);

        const compRes = studentId
          ? await api.get(`/api/analytics/student/${studentId}/comparison`)
          : { data: null };
        const comp = compRes.data;
        const recRes = studentId
          ? await api.get(`/api/recommendations/student/${studentId}`)
          : { data: null };
        const rec = recRes.data;

        const lecturesRes = await api.get("/api/lectures");
        const lecturesList = (
          Array.isArray(lecturesRes.data) ? lecturesRes.data : []
        ).map(normalise);

        const recordingLectures = lecturesList.filter(
          (l) => v(l.status) === "recording",
        );

        setComparison(comp);
        setRecommendations(
          Array.isArray(rec?.recommendations) ? rec.recommendations : [],
        );
        setLectures(lecturesList);
        setStats({
          enrolledCount: lecturesList.length,
          recordingCount: recordingLectures.length,
          averageEngagement: Number(v(comp?.self_mean) ?? 0).toFixed(2),
          attendanceRate: Number(v(rec?.attendance_rate) || 0),
        });
      } catch (error) {
        console.error("Error fetching dashboard:", error);
        setErr(error.response?.data?.error || error.message);
      }
    };

    fetchDashboard();
  }, []);

  if (err) {
    return (
      <div className="card p-6 text-red-700 bg-red-50 border-red-200">
        Error: {err}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-5 animate-pulse">
            <div className="h-3 w-20 bg-slate-200 rounded" />
            <div className="h-8 w-24 bg-slate-200 rounded mt-3" />
          </div>
        ))}
      </div>
    );
  }

  const live = stats.recordingCount > 0;
  const selfPct = Number(v(comparison?.self_mean) || 0);
  const classPct = Number(v(comparison?.class_mean) || 0);
  const ratio = classPct > 0 ? Math.min(150, (selfPct / classPct) * 100) : 0;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Here's a snapshot of your lectures and engagement.
          </p>
        </div>
        {live && (
          <span className="badge bg-red-50 text-red-700 ring-1 ring-red-100 gap-1.5 px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            {stats.recordingCount} live now
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Enrolled Lectures"
          value={stats.enrolledCount}
          accent="brand"
          icon={Presentation}
        />
        <StatCard
          label="Live Now"
          value={stats.recordingCount}
          accent={live ? "red" : "slate"}
          icon={Radio}
        />
        <StatCard
          label="Your Engagement"
          value={`${stats.averageEngagement}%`}
          accent="green"
          icon={Smile}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <StatCard
          label="Attendance rate"
          value={`${Math.round((stats.attendanceRate || 0) * 100)}%`}
          accent={
            stats.attendanceRate >= 0.8
              ? "green"
              : stats.attendanceRate >= 0.6
                ? "amber"
                : "red"
          }
          icon={CalendarClock}
        />
      </div>

      {comparison && (
        <div className="card p-6 mt-6">
          <h2 className="font-semibold text-slate-900">
            You vs. Class Average
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Compared with the average across your enrolled classes.
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <div className="flex justify-between items-center text-sm mb-1.5">
                <span className="text-slate-600">Your average</span>
                <span className="font-semibold text-emerald-600">
                  {selfPct.toFixed(2)}%
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, selfPct)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center text-sm mb-1.5">
                <span className="text-slate-600">Class average</span>
                <span className="font-semibold text-brand-600">
                  {classPct.toFixed(2)}%
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-brand-500 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, classPct)}%` }}
                />
              </div>
            </div>
            {classPct > 0 && (
              <div className="text-xs text-slate-500 pt-1">
                You're at{" "}
                <span className="font-medium text-slate-700">
                  {ratio.toFixed(0)}%
                </span>{" "}
                of the class average.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card p-6 mt-6">
        <h2 className="font-semibold text-slate-900">Smart recommendations</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Actions tailored to your attendance, attention, and grade trend.
        </p>
        <div className="mt-4 space-y-3">
          {recommendations.length > 0 ? (
            recommendations.map((item, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
              >
                {item}
              </div>
            ))
          ) : (
            <div className="text-slate-500 text-sm">
              No recommendations yet.
            </div>
          )}
        </div>
      </div>

      <div className="card p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-slate-900">Recent lectures</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Your most recent enrollments.
            </p>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {lectures.slice(0, 6).map((l) => {
            const status = v(l.status) || "scheduled";
            const statusStyle =
              status === "recording"
                ? "bg-red-50 text-red-700 ring-red-100"
                : status === "finished"
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                  : "bg-slate-100 text-slate-600 ring-slate-200";
            return (
              <div
                key={v(l.id)}
                className="flex justify-between items-center py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center ring-1 ring-brand-100 flex-shrink-0">
                    <CalendarClock className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">
                      {v(l.title)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {l.scheduled_at
                        ? new Date(v(l.scheduled_at)).toLocaleDateString()
                        : "—"}
                    </div>
                  </div>
                </div>
                <span className={`badge ring-1 ${statusStyle}`}>
                  {status === "recording" && (
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 mr-1.5 animate-pulse" />
                  )}
                  {status}
                </span>
              </div>
            );
          })}
          {lectures.length === 0 && (
            <div className="text-slate-500 text-sm text-center py-6">
              No enrolled lectures yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function normalise(row) {
  const out = {};
  for (const [k, val] of Object.entries(row || {})) out[k] = v(val);
  return out;
}
