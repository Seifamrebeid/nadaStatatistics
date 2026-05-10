import { useEffect, useState } from "react";
import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";
import StatCard from "../components/StatCard";
import { Users, Presentation, Smile, AlertTriangle, Lightbulb, Brain } from "lucide-react";
import { useChildren } from "../context/ChildContext";

export default function ParentDashboard() {
  const { children: kids, loading, err } = useChildren();
  const [perChild, setPerChild] = useState([]);
  const [lecturesCount, setLecturesCount] = useState(0);
  const [busy, setBusy] = useState(true);
  const [pageErr, setPageErr] = useState(null);

  useEffect(() => {
    if (loading) return;
    if (kids.length === 0) {
      setBusy(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Get all lectures for all kids (deduplicated)
        const allLectureIds = new Set();
        const summaries = await Promise.all(
          kids.map(async (c) => {
            try {
              // Lectures where child is enrolled
              const lectSnap = await getDocs(
                query(
                  collection(db, "lectures"),
                  where("enrolled_student_ids", "array-contains", c.id),
                ),
              );
              const childLectures = lectSnap.docs.map((d) => d.id);
              childLectures.forEach((lid) => allLectureIds.add(lid));

              // Emotions for this child
              const emotSnap = await getDocs(
                query(
                  collection(db, "emotions"),
                  where("student_id", "==", c.id),
                ),
              );
              const myEmotions = emotSnap.docs.map((d) => d.data());

              // Compute per-lecture averages then overall average
              const byLecture = {};
              myEmotions.forEach((e) => {
                if (!byLecture[e.lecture_id]) byLecture[e.lecture_id] = [];
                byLecture[e.lecture_id].push(e.engagement_score || 0);
              });
              const perLecture = Object.entries(byLecture).map(([lid, scores]) => ({
                lecture_id: lid,
                my_avg: scores.reduce((a, b) => a + b, 0) / scores.length,
              }));
              const selfMean =
                perLecture.length > 0
                  ? perLecture.reduce((s, l) => s + l.my_avg, 0) / perLecture.length
                  : 0;

              // Attention score
              const attScores = myEmotions.filter((e) => e.attention_score != null).map((e) => e.attention_score);
              const avgAtt = attScores.length
                ? attScores.reduce((a, b) => a + b, 0) / attScores.length
                : null;

              // Warnings in last 7 days
              const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
              const warnSnap = await getDocs(query(
                collection(db, "warnings"),
                where("student_id", "==", c.id),
                orderBy("timestamp", "desc"),
                limit(20),
              ));
              const recentWarnings = warnSnap.docs.filter((d) => {
                const ts = d.data().timestamp;
                const ms = ts?.toMillis ? ts.toMillis() : new Date(ts).getTime();
                return ms > sevenDaysAgo;
              });

              // Latest recommendation
              const recSnap = await getDocs(query(
                collection(db, "recommendations"),
                where("student_id", "==", c.id),
                orderBy("generated_at", "desc"),
                limit(1),
              ));
              const latestRec = recSnap.empty ? null : recSnap.docs[0].data();

              return {
                id: c.id,
                name: c.name,
                self: selfMean,
                lectures: childLectures.length,
                avgAtt,
                warnCount: recentWarnings.length,
                latestRec,
              };
            } catch {
              return { id: c.id, name: c.name, self: 0, lectures: 0 };
            }
          }),
        );
        if (cancelled) return;
        setPerChild(summaries);
        setLecturesCount(allLectureIds.size);
      } catch (e) {
        if (!cancelled) setPageErr(e.message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, kids]);

  if (err || pageErr) {
    return (
      <div className="card p-6 text-red-700 bg-red-50 border-red-200">
        Error: {err || pageErr}
      </div>
    );
  }

  if (loading || busy) {
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

  if (kids.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-slate-500">
        No children are linked to your account yet. Please contact the admin.
      </div>
    );
  }

  const overallSelf =
    perChild.length > 0
      ? perChild.reduce((s, c) => s + c.self, 0) / perChild.length
      : 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
          Welcome
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          A snapshot of your {kids.length === 1 ? "child" : "children"}'s
          engagement.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Children"
          value={kids.length}
          accent="brand"
          icon={Users}
        />
        <StatCard
          label="Visible Lectures"
          value={lecturesCount}
          accent="slate"
          icon={Presentation}
        />
        <StatCard
          label="Average Engagement"
          value={`${overallSelf.toFixed(2)}%`}
          accent="green"
          icon={Smile}
        />
      </div>

      <div className="card p-6 mt-6">
        <h2 className="font-semibold text-slate-900 mb-4">Per-child summary</h2>
        <div className="divide-y divide-slate-100">
          {perChild.map((c) => {
            const attColor = c.avgAtt == null ? "text-slate-400"
              : c.avgAtt >= 70 ? "text-emerald-600"
              : c.avgAtt >= 45 ? "text-amber-600"
              : "text-red-600";
            return (
              <div key={c.id} className="py-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{c.name || c.id}</div>
                    <div className="text-xs text-slate-500">{c.lectures} lecture{c.lectures === 1 ? "" : "s"} tracked</div>
                  </div>
                  <div className="flex items-center gap-5 text-sm flex-shrink-0">
                    <div className="text-right">
                      <div className="text-[11px] text-slate-500">Engagement</div>
                      <div className="font-semibold text-emerald-600">{c.self.toFixed(1)}%</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-slate-500 flex items-center gap-1"><Brain className="h-3 w-3" />Attention</div>
                      <div className={`font-semibold ${attColor}`}>{c.avgAtt != null ? `${c.avgAtt.toFixed(1)}` : "—"}</div>
                    </div>
                    {c.warnCount > 0 && (
                      <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                        <AlertTriangle className="h-3 w-3" />
                        {c.warnCount} warning{c.warnCount === 1 ? "" : "s"}
                      </div>
                    )}
                  </div>
                </div>
                {c.latestRec && (
                  <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 mb-1.5">
                      <Lightbulb className="h-3 w-3" /> Latest recommendations
                    </div>
                    <ul className="space-y-1">
                      {(c.latestRec.items || []).map((item, i) => (
                        <li key={i} className="text-xs text-slate-700 flex items-start gap-1.5">
                          <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
