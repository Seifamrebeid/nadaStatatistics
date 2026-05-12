/**
 * Admin attendance — overview across all subjects/classes/weeks. Read-only by
 * default; admin can still edit a status if needed (mirrors web behavior).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import {
  collection, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where,
} from "firebase/firestore";
import { db } from "../../firebase";
import {
  Button, Card, EmptyState, Header, Pill, Screen, Stat, colors, styles,
} from "../../components/admin/ui";

const STATUS_OPTIONS = ["present", "absent", "late", "excused"];
const STATUS_TONE = { present: "success", absent: "danger", late: "warning", excused: "info" };

export default function AdminAttendance() {
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [students, setStudents] = useState([]);
  const [selSubj, setSelSubj] = useState("");
  const [selClass, setSelClass] = useState("");
  const [selWeek, setSelWeek] = useState("");
  const [attMap, setAttMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [subjSnap, clsSnap, wkSnap, lecSnap, stSnap] = await Promise.all([
        getDocs(collection(db, "subjects")),
        getDocs(collection(db, "classes")),
        getDocs(collection(db, "weeks")),
        getDocs(collection(db, "lectures")),
        getDocs(query(collection(db, "students"), where("active", "==", true))),
      ]);
      setSubjects(subjSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setClasses(clsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setWeeks(wkSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLectures(lecSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setStudents(stSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const subjClasses = useMemo(() => classes.filter((c) => !selSubj || c.subject_id === selSubj), [classes, selSubj]);
  const clsWeeks = useMemo(
    () => weeks.filter((w) => w.class_id === selClass).sort((a, b) => (a.week_number ?? 0) - (b.week_number ?? 0)),
    [weeks, selClass],
  );
  const activeWeek = clsWeeks.find((w) => w.id === selWeek);
  const activeLecture = useMemo(
    () => activeWeek ? lectures.find((l) => l.week_id === activeWeek.id) : null,
    [activeWeek, lectures],
  );
  const enrolled = useMemo(() => {
    const cls = classes.find((c) => c.id === selClass);
    if (!cls) return [];
    const ids = new Set(cls.enrolled_student_ids || []);
    return students.filter((s) => ids.has(s.id));
  }, [classes, selClass, students]);

  useEffect(() => {
    if (!activeLecture) { setAttMap({}); return; }
    const unsub = onSnapshot(
      query(collection(db, "attendance"), where("lecture_id", "==", activeLecture.id)),
      (snap) => {
        const m = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          m[data.student_id] = { id: d.id, ...data };
        });
        setAttMap(m);
      },
    );
    return unsub;
  }, [activeLecture]);

  async function setStatus(studentId, status) {
    if (!activeLecture || !activeWeek) return;
    const cls = classes.find((c) => c.id === selClass);
    try {
      await setDoc(doc(db, "attendance", `${activeLecture.id}_${studentId}`), {
        lecture_id: activeLecture.id,
        student_id: studentId,
        class_id: selClass,
        subject_id: cls?.subject_id,
        doctor_id: cls?.doctor_id || activeLecture.doctor_id,
        week_number: activeWeek.week_number,
        status,
        updated_at: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      Alert.alert("Save failed", e.message);
    }
  }

  const summary = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, excused: 0, auto: 0 };
    Object.values(attMap).forEach((a) => {
      if (c[a.status] !== undefined) c[a.status]++;
      if (a.auto_detected) c.auto++;
    });
    return c;
  }, [attMap]);

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header
        title="Attendance"
        subtitle={activeLecture ? activeLecture.title || activeLecture.id : "All subjects → classes → weeks"}
        action={<Button title="Back" onPress={() => router.back()} variant="ghost" />}
      />

      {err ? (
        <Card style={{ borderColor: colors.danger, backgroundColor: "#fef2f2" }}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Error</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{err}</Text>
        </Card>
      ) : null}

      <Card>
        <Chips label="SUBJECT" items={subjects.map((s) => ({ id: s.id, label: s.name || s.id }))} value={selSubj} onChange={(v) => { setSelSubj(v); setSelClass(""); setSelWeek(""); }} allowAll />
        <Chips label="CLASS" items={subjClasses.map((c) => ({ id: c.id, label: c.name || c.id }))} value={selClass} onChange={(v) => { setSelClass(v); setSelWeek(""); }} allowAll />
        <Chips label="WEEK" items={clsWeeks.map((w) => ({ id: w.id, label: `W${w.week_number}${w.title ? " · " + w.title : ""}` }))} value={selWeek} onChange={setSelWeek} />
      </Card>

      {activeLecture ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Stat label="Present" value={summary.present} tone="success" />
          <Stat label="Absent" value={summary.absent} tone="danger" />
          <Stat label="Late" value={summary.late} tone="warning" />
          <Stat label="Auto" value={summary.auto} tone="info" />
        </View>
      ) : null}

      {activeLecture && enrolled.map((s) => {
        const att = attMap[s.id];
        return (
          <Card key={s.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.emptyTitle} numberOfLines={1}>{s.name || s.id}</Text>
                <Text style={{ color: colors.faint, fontSize: 11, marginTop: 2 }}>{s.id}</Text>
              </View>
              {att?.auto_detected ? <Pill text="AUTO" tone="info" /> : null}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {STATUS_OPTIONS.map((opt) => {
                const active = att?.status === opt;
                return (
                  <Pressable key={opt} onPress={() => setStatus(s.id, opt)} style={[local.statusPill, active && local.statusPillActive]}>
                    <Text style={[local.statusText, active && local.statusTextActive]}>{opt}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        );
      })}

      {!loading && !activeLecture ? (
        <EmptyState title="Pick week" body="Select subject → class → week to see attendance." />
      ) : null}
    </Screen>
  );
}

function Chips({ label, items, value, onChange, allowAll = false }) {
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
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "#f1f5f9", borderColor: "#e2e8f0", borderWidth: 1, maxWidth: 220 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.ink, fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#ffffff" },
  statusPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: "#f1f5f9", borderColor: "#e2e8f0", borderWidth: 1 },
  statusPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusText: { color: colors.ink, fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  statusTextActive: { color: "#ffffff" },
});
