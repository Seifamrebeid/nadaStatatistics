/**
 * Doctor hierarchy — read-only Subject → Class → Week navigation, plus per-week
 * student analytics (engagement / sleep rate from emotions).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection, doc, getDoc, getDocs, query, where,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import {
  Button, Card, EmptyState, Header, Pill, Screen, Stat, colors, styles,
} from "../../components/ui";

function fmtDate(v) {
  if (!v) return "";
  const d = v?.toDate ? v.toDate() : new Date(v);
  return isNaN(d) ? v : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function DoctorHierarchy() {
  const [doctorId, setDoctorId] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const [selSubj, setSelSubj] = useState("");
  const [selClass, setSelClass] = useState("");
  const [selWeek, setSelWeek] = useState("");
  const [analytics, setAnalytics] = useState([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) setDoctorId(snap.data().linked_id || null);
      } catch { /* ignore */ }
    });
    return unsub;
  }, []);

  const load = useCallback(async () => {
    if (!doctorId) return;
    setLoading(true); setErr(null);
    try {
      const [subjSnap, clsSnap, weekSnap, studSnap] = await Promise.all([
        getDocs(query(collection(db, "subjects"), where("doctor_id", "==", doctorId))),
        getDocs(collection(db, "classes")),
        getDocs(collection(db, "weeks")),
        getDocs(collection(db, "students")),
      ]);
      const mySubj = subjSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const subjIds = new Set(mySubj.map((s) => s.id));
      const myCls = clsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => subjIds.has(c.subject_id));
      const clsIds = new Set(myCls.map((c) => c.id));
      const myWeeks = weekSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((w) => clsIds.has(w.class_id));
      myWeeks.sort((a, b) => (a.week_number ?? 0) - (b.week_number ?? 0));
      setSubjects(mySubj);
      setClasses(myCls);
      setWeeks(myWeeks);
      setStudents(studSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => { load(); }, [load]);

  const subjClasses = useMemo(() => classes.filter((c) => c.subject_id === selSubj), [classes, selSubj]);
  const clsWeeks = useMemo(() => weeks.filter((w) => w.class_id === selClass), [weeks, selClass]);
  const activeWeek = useMemo(() => weeks.find((w) => w.id === selWeek), [weeks, selWeek]);
  const activeClass = useMemo(() => classes.find((c) => c.id === selClass), [classes, selClass]);
  const enrolled = useMemo(() => {
    const ids = new Set(activeClass?.enrolled_student_ids || []);
    return students.filter((s) => ids.has(s.id));
  }, [activeClass, students]);

  // Load engagement/sleep for the active week's linked lecture.
  useEffect(() => {
    setAnalytics([]);
    if (!activeWeek || !activeWeek.lecture_id || enrolled.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const emSnap = await getDocs(
          query(collection(db, "emotions"), where("lecture_id", "==", activeWeek.lecture_id))
        );
        const emotions = emSnap.docs.map((d) => d.data());
        const byStudent = {};
        emotions.forEach((e) => {
          const sid = e.student_id;
          if (!byStudent[sid]) byStudent[sid] = { scores: [], sleep: 0, total: 0 };
          byStudent[sid].scores.push(e.engagement_score || 0);
          byStudent[sid].total += 1;
          if (e.state === "sleeping") byStudent[sid].sleep += 1;
        });
        const rows = enrolled.map((s) => {
          const d = byStudent[s.id];
          return {
            id: s.id,
            name: s.name || s.id,
            observations: d?.total || 0,
            mean_engagement: d?.scores?.length ? d.scores.reduce((a, b) => a + b, 0) / d.scores.length : 0,
            sleep_rate: d?.total ? (d.sleep / d.total) * 100 : 0,
          };
        });
        rows.sort((a, b) => b.mean_engagement - a.mean_engagement);
        if (!cancelled) setAnalytics(rows);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [activeWeek, enrolled]);

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header
        title="Hierarchy"
        subtitle="Subject → Class → Week → Students"
        action={<Button title="Back" onPress={() => router.back()} variant="ghost" />}
      />

      {err ? (
        <Card style={{ borderColor: colors.danger, backgroundColor: "#fef2f2" }}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Error</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{err}</Text>
        </Card>
      ) : null}

      <Card>
        <Selector label="SUBJECT" items={subjects.map((s) => ({ id: s.id, label: s.name || s.id }))}
          value={selSubj} onChange={(v) => { setSelSubj(v); setSelClass(""); setSelWeek(""); }} allowAll />
        {selSubj ? (
          <Selector label="CLASS" items={subjClasses.map((c) => ({ id: c.id, label: c.name || c.id }))}
            value={selClass} onChange={(v) => { setSelClass(v); setSelWeek(""); }} allowAll />
        ) : null}
        {selClass ? (
          <Selector label="WEEK" items={clsWeeks.map((w) => ({ id: w.id, label: `W${w.week_number}${w.title ? " · " + w.title : ""}` }))}
            value={selWeek} onChange={setSelWeek} allowAll />
        ) : null}
      </Card>

      {/* Hierarchy summary cards */}
      {!selSubj ? (
        <>
          <Header title="Subjects" />
          {subjects.map((s) => {
            const clsCount = classes.filter((c) => c.subject_id === s.id).length;
            return (
              <Card key={s.id}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.emptyTitle}>{s.name}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                      {s.code || "(no code)"} • {clsCount} class{clsCount === 1 ? "" : "es"}
                    </Text>
                  </View>
                  <Pill text={s.active === false ? "inactive" : "active"} tone={s.active === false ? "slate" : "success"} />
                </View>
              </Card>
            );
          })}
        </>
      ) : null}

      {selSubj && !selClass ? (
        <>
          <Header title="Classes" />
          {subjClasses.map((c) => (
            <Card key={c.id}>
              <Text style={styles.emptyTitle}>{c.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                Section {c.section || "—"} • {(c.enrolled_student_ids || []).length} students
              </Text>
            </Card>
          ))}
        </>
      ) : null}

      {selClass && !selWeek ? (
        <>
          <Header title="Weeks" />
          {clsWeeks.map((w) => (
            <Card key={w.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.emptyTitle}>Week {w.week_number} · {w.title || "—"}</Text>
                  <Text style={{ color: colors.faint, fontSize: 11, marginTop: 4 }}>
                    {fmtDate(w.date) || ""} • lecture: {w.lecture_id || "—"}
                  </Text>
                </View>
                <Pill text={w.status || "planned"} tone={w.status === "recording" ? "danger" : w.status === "finished" ? "success" : "info"} />
              </View>
            </Card>
          ))}
        </>
      ) : null}

      {/* Student analytics when a week is picked */}
      {activeWeek ? (
        <>
          <Header title="Student analytics" subtitle={`Week ${activeWeek.week_number} · ${enrolled.length} students`} />
          {!activeWeek.lecture_id ? (
            <Card><Text style={{ color: colors.muted }}>No linked lecture for this week, so no analytics yet.</Text></Card>
          ) : (
            analytics.map((a) => (
              <Card key={a.id}>
                <Text style={styles.emptyTitle} numberOfLines={1}>{a.name}</Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{a.observations} observation{a.observations === 1 ? "" : "s"}</Text>
                <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
                  <Stat label="Engagement" value={`${a.mean_engagement.toFixed(1)}%`} tone={a.mean_engagement >= 70 ? "success" : a.mean_engagement >= 45 ? "warning" : "danger"} />
                  <Stat label="Sleep rate" value={`${a.sleep_rate.toFixed(1)}%`} tone={a.sleep_rate > 30 ? "warning" : "slate"} />
                </View>
              </Card>
            ))
          )}
        </>
      ) : null}

      {!loading && subjects.length === 0 ? (
        <EmptyState title="No subjects yet" body="Add a subject from Subjects." />
      ) : null}
    </Screen>
  );
}

function Selector({ label, items, value, onChange, allowAll = false }) {
  return (
    <View style={{ marginTop: 4 }}>
      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 6 }}>
        {allowAll ? (
          <Pressable onPress={() => onChange("")} style={[local.chip, !value && local.chipActive]}>
            <Text style={[local.chipText, !value && local.chipTextActive]}>All</Text>
          </Pressable>
        ) : null}
        {items.map((it) => (
          <Pressable key={it.id} onPress={() => onChange(it.id)} style={[local.chip, value === it.id && local.chipActive]}>
            <Text style={[local.chipText, value === it.id && local.chipTextActive]} numberOfLines={1}>{it.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const local = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    maxWidth: 220,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#ffffff",
  },
});
