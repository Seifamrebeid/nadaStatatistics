import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../firebase";
import {
  Card, EmptyState, Header, Pill, Screen, colors, styles,
} from "../../components/ui";

const LETTER_TONE = {
  "A+": "success", "A": "success", "A-": "success",
  "B+": "info",    "B": "info",    "B-": "info",
  "C+": "warning", "C": "warning", "C-": "warning",
  "D+": "warning", "D": "warning", "D-": "warning",
  "F":  "danger",
  "W":  "slate",
};

export default function StudentGrades() {
  const [studentId, setStudentId] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) setStudentId(snap.data().linked_id || null);
      } catch { /* ignore */ }
    });
    return unsub;
  }, []);

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true); setErr(null);
    try {
      const snap = await getDocs(
        query(collection(db, "grades"), where("student_id", "==", studentId))
      );
      const grades = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const subjectCache = {}, doctorCache = {};
      const enriched = await Promise.all(grades.map(async (g) => {
        if (g.subject_id && !subjectCache[g.subject_id]) {
          try {
            const s = await getDoc(doc(db, "subjects", g.subject_id));
            subjectCache[g.subject_id] = s.exists() ? (s.data().name || g.subject_id) : g.subject_id;
          } catch { subjectCache[g.subject_id] = g.subject_id; }
        }
        if (g.doctor_id && !doctorCache[g.doctor_id]) {
          try {
            const d = await getDoc(doc(db, "doctors", g.doctor_id));
            doctorCache[g.doctor_id] = d.exists() ? (d.data().name || g.doctor_id) : g.doctor_id;
          } catch { doctorCache[g.doctor_id] = g.doctor_id; }
        }
        return {
          ...g,
          subject_name: subjectCache[g.subject_id] || g.subject_id || "—",
          doctor_name: doctorCache[g.doctor_id] || g.doctor_id || "—",
        };
      }));
      enriched.sort((a, b) => (a.subject_name || "").localeCompare(b.subject_name || ""));
      setRows(enriched);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header
        title="Grades"
        subtitle="Week 7 / Week 12 / Classwork / Final → Total (passing ≥ 40)"
      />

      {err ? (
        <Card style={{ borderColor: colors.danger, backgroundColor: "#fef2f2" }}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Error</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{err}</Text>
        </Card>
      ) : null}

      {rows.map((g) => (
        <Card key={g.id}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.emptyTitle} numberOfLines={1}>{g.subject_name}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{g.doctor_name}</Text>
            </View>
            {g.letter ? <Pill text={g.letter} tone={LETTER_TONE[g.letter] || "slate"} /> : null}
          </View>

          <View style={{ flexDirection: "row", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
            <Cell label="W7 /30" value={g.week7} />
            <Cell label="W12 /20" value={g.week12} />
            <Cell label="CW /10" value={g.classwork} />
            <Cell label="Final /40" value={g.final} />
          </View>

          <View style={{ marginTop: 12, paddingTop: 10, borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>TOTAL</Text>
            <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 16 }}>
              {g.total != null ? `${g.total} / 100` : "—"}
            </Text>
          </View>
        </Card>
      ))}

      {!loading && rows.length === 0 ? (
        <EmptyState
          title="No grades yet"
          body="Grades will appear after your doctor enters them."
        />
      ) : null}
    </Screen>
  );
}

function Cell({ label, value }) {
  return (
    <View style={{ minWidth: 64 }}>
      <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", letterSpacing: 0.4 }}>{label}</Text>
      <Text style={{ color: value == null || value === "" ? colors.faint : colors.ink, fontSize: 15, fontWeight: "700", marginTop: 2 }}>
        {value != null && value !== "" ? value : "—"}
      </Text>
    </View>
  );
}
