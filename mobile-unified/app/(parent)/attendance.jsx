import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { useChildren } from "../../context/ChildContext";
import ChildSwitcher from "../../components/parent/ChildSwitcher";
import {
  Card, EmptyState, Header, Pill, Screen, Stat, colors, styles,
} from "../../components/parent/ui";

const STATUS_TONE = {
  present: "success",
  absent:  "danger",
  late:    "warning",
  excused: "info",
};

export default function ParentAttendance() {
  const { selected, selectedId } = useChildren();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    if (!selectedId) { setRows([]); return; }
    setLoading(true); setErr(null);
    try {
      const snap = await getDocs(
        query(collection(db, "attendance"), where("student_id", "==", selectedId))
      );
      const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const subjectCache = {};
      const enriched = await Promise.all(records.map(async (r) => {
        if (r.subject_id && !subjectCache[r.subject_id]) {
          try {
            const s = await getDoc(doc(db, "subjects", r.subject_id));
            subjectCache[r.subject_id] = s.exists() ? (s.data().name || r.subject_id) : r.subject_id;
          } catch { subjectCache[r.subject_id] = r.subject_id; }
        }
        return { ...r, subject_name: subjectCache[r.subject_id] || r.subject_id || "—" };
      }));
      enriched.sort((a, b) => (a.week_number ?? 0) - (b.week_number ?? 0));
      setRows(enriched);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const summary = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const r of rows) if (c[r.status] !== undefined) c[r.status]++;
    return c;
  }, [rows]);

  const total = summary.present + summary.absent + summary.late + summary.excused;
  const rate = total > 0 ? ((summary.present + summary.late) / total) * 100 : 0;

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header
        title="Attendance"
        subtitle={selected ? selected.name : "Select a child"}
      />
      <ChildSwitcher />

      {err ? (
        <Card style={{ borderColor: colors.danger, backgroundColor: "#fef2f2" }}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Error</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{err}</Text>
        </Card>
      ) : null}

      {total > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Stat label="Rate" value={`${rate.toFixed(0)}%`} tone={rate >= 75 ? "success" : rate >= 50 ? "warning" : "danger"} />
          <Stat label="Present" value={summary.present} tone="success" />
          <Stat label="Absent" value={summary.absent} tone="danger" />
          <Stat label="Late" value={summary.late} tone="warning" />
        </View>
      ) : null}

      {rows.map((r) => (
        <Card key={r.id}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.emptyTitle} numberOfLines={1}>{r.subject_name}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                Week {r.week_number != null ? r.week_number : "—"}
              </Text>
            </View>
            <Pill text={r.status || "—"} tone={STATUS_TONE[r.status] || "slate"} />
          </View>
        </Card>
      ))}

      {!loading && rows.length === 0 ? (
        <EmptyState
          title="No attendance records"
          body={selected ? `Nothing on file for ${selected.name} yet.` : "Select a child to view attendance."}
        />
      ) : null}
    </Screen>
  );
}
