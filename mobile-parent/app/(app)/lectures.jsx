import React, { useCallback, useState } from "react";
import { RefreshControl, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { useChildren } from "../../context/ChildContext";
import ChildSwitcher from "../../components/ChildSwitcher";
import {
  Card, EmptyState, Header, Pill, Screen, colors, styles,
} from "../../components/ui";

function fmtDate(value) {
  if (!value) return "";
  const d = value?.toDate ? value.toDate() : new Date(value);
  return isNaN(d) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function ParentLectures() {
  const { selected, selectedId, loading: kidsLoading } = useChildren();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    if (!selectedId) { setRows([]); return; }
    setLoading(true); setErr(null);
    try {
      const snap = await getDocs(
        query(collection(db, "lectures"), where("enrolled_student_ids", "array-contains", selectedId))
      );
      const lectures = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Enrich with doctor + subject names (small caches).
      const doctorCache = {};
      const subjectCache = {};
      const enriched = await Promise.all(lectures.map(async (l) => {
        if (l.doctor_id && !doctorCache[l.doctor_id]) {
          try {
            const ds = await getDoc(doc(db, "doctors", l.doctor_id));
            doctorCache[l.doctor_id] = ds.exists() ? (ds.data().name || l.doctor_id) : l.doctor_id;
          } catch { doctorCache[l.doctor_id] = l.doctor_id; }
        }
        if (l.subject_id && !subjectCache[l.subject_id]) {
          try {
            const ss = await getDoc(doc(db, "subjects", l.subject_id));
            subjectCache[l.subject_id] = ss.exists() ? (ss.data().name || l.subject_id) : l.subject_id;
          } catch { subjectCache[l.subject_id] = l.subject_id; }
        }
        return {
          ...l,
          doctor_name: doctorCache[l.doctor_id] || l.doctor_id || "—",
          subject_name: subjectCache[l.subject_id] || l.subject_id || "—",
        };
      }));

      enriched.sort((a, b) => {
        const ta = a.scheduled_at?.toMillis?.() ?? 0;
        const tb = b.scheduled_at?.toMillis?.() ?? 0;
        return tb - ta;
      });
      setRows(enriched);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const live = rows.filter((r) => r.status === "recording");
  const upcoming = rows.filter((r) => r.status === "scheduled");
  const finished = rows.filter((r) => r.status === "finished");

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header
        title="Lectures"
        subtitle={selected ? selected.name : "Select a child"}
      />
      <ChildSwitcher />

      {err ? (
        <Card style={{ borderColor: colors.danger, backgroundColor: "#fef2f2" }}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Error</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{err}</Text>
        </Card>
      ) : null}

      {live.length > 0 ? (
        <>
          <Header title="Live now" />
          {live.map((l) => <LectureRow key={l.id} lec={l} />)}
        </>
      ) : null}

      {upcoming.length > 0 ? (
        <>
          <Header title="Upcoming" />
          {upcoming.map((l) => <LectureRow key={l.id} lec={l} />)}
        </>
      ) : null}

      {finished.length > 0 ? (
        <>
          <Header title="Past" />
          {finished.slice(0, 20).map((l) => <LectureRow key={l.id} lec={l} />)}
        </>
      ) : null}

      {!loading && !kidsLoading && rows.length === 0 ? (
        <EmptyState
          title="No lectures yet"
          body="Your child's lectures will appear here once they are scheduled."
        />
      ) : null}
    </Screen>
  );
}

function LectureRow({ lec }) {
  const tone = lec.status === "recording" ? "danger" : lec.status === "finished" ? "success" : "info";
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.emptyTitle} numberOfLines={2}>{lec.title || lec.id}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
            {lec.subject_name} • {lec.doctor_name}
          </Text>
          {lec.scheduled_at ? (
            <Text style={{ color: colors.faint, fontSize: 11, marginTop: 2 }}>{fmtDate(lec.scheduled_at)}</Text>
          ) : null}
        </View>
        <Pill text={lec.status || "scheduled"} tone={tone} />
      </View>
    </Card>
  );
}
