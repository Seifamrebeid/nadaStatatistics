/**
 * Admin grades — read-only overview of every grade in the system. Enriched with
 * student / subject / doctor names from their respective collections.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, Text, View } from "react-native";
import { router } from "expo-router";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import {
  Button, Card, EmptyState, Header, Input, Pill, Screen, Stat, colors, styles,
} from "../../components/ui";

const LETTER_TONE = {
  "A+": "success", "A": "success", "A-": "success",
  "B+": "info", "B": "info", "B-": "info",
  "C+": "warning", "C": "warning", "C-": "warning",
  "D+": "warning", "D": "warning", "D-": "warning",
  "F":  "danger",
  "W":  "slate",
};

export default function AdminGrades() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [gSnap, stSnap, subjSnap, docSnap] = await Promise.all([
        getDocs(collection(db, "grades")),
        getDocs(collection(db, "students")),
        getDocs(collection(db, "subjects")),
        getDocs(collection(db, "doctors")),
      ]);
      const sMap = Object.fromEntries(stSnap.docs.map((d) => [d.id, d.data().name || d.id]));
      const subjMap = Object.fromEntries(subjSnap.docs.map((d) => [d.id, d.data().name || d.id]));
      const dMap = Object.fromEntries(docSnap.docs.map((d) => [d.id, d.data().name || d.id]));
      const out = gSnap.docs.map((d) => {
        const g = d.data();
        return {
          id: d.id,
          ...g,
          student_name: sMap[g.student_id] || g.student_id,
          subject_name: subjMap[g.subject_id] || g.subject_id,
          doctor_name: dMap[g.doctor_id] || g.doctor_id,
        };
      });
      out.sort((a, b) => (a.student_name || "").localeCompare(b.student_name || ""));
      setRows(out);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      (r.student_name || "").toLowerCase().includes(t) ||
      (r.subject_name || "").toLowerCase().includes(t) ||
      (r.doctor_name || "").toLowerCase().includes(t)
    );
  }, [rows, search]);

  const summary = useMemo(() => {
    const totals = rows.map((r) => r.total).filter((v) => v != null);
    const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
    return {
      students: new Set(rows.map((r) => r.student_id)).size,
      subjects: new Set(rows.map((r) => r.subject_id)).size,
      avg,
    };
  }, [rows]);

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header title="Grades" subtitle="System-wide overview" action={<Button title="Back" onPress={() => router.back()} variant="ghost" />} />

      {err ? (
        <Card style={{ borderColor: colors.danger, backgroundColor: "#fef2f2" }}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Error</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{err}</Text>
        </Card>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat label="Records" value={rows.length} />
        <Stat label="Students" value={summary.students} tone="info" />
        <Stat label="Subjects" value={summary.subjects} tone="info" />
        <Stat label="Avg total" value={summary.avg ? summary.avg.toFixed(1) : "—"} tone="success" />
      </View>

      <Input label="Search" value={search} onChangeText={setSearch} placeholder="Student, subject, or doctor" autoCorrect={false} autoCapitalize="none" />

      {filtered.slice(0, 80).map((g) => (
        <Card key={g.id}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.emptyTitle} numberOfLines={1}>{g.student_name}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{g.subject_name} • {g.doctor_name}</Text>
            </View>
            {g.letter ? <Pill text={g.letter} tone={LETTER_TONE[g.letter] || "slate"} /> : null}
          </View>
          <View style={{ flexDirection: "row", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
            <Cell label="W7 /30" value={g.week7} />
            <Cell label="W12 /20" value={g.week12} />
            <Cell label="CW /10" value={g.classwork} />
            <Cell label="Fin /40" value={g.final} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTopColor: colors.border, borderTopWidth: 1 }}>
            <Text style={{ color: colors.muted, fontWeight: "700", fontSize: 12 }}>TOTAL</Text>
            <Text style={{ color: colors.ink, fontWeight: "800" }}>{g.total != null ? `${g.total} / 100` : "—"}</Text>
          </View>
        </Card>
      ))}

      {filtered.length > 80 ? (
        <Text style={{ color: colors.faint, fontSize: 12, textAlign: "center" }}>
          Showing first 80 of {filtered.length}. Refine search to see more.
        </Text>
      ) : null}

      {!loading && filtered.length === 0 ? (
        <EmptyState title="No grades" body={search ? "No matches for that search." : "No grades yet."} />
      ) : null}
    </Screen>
  );
}

function Cell({ label, value }) {
  return (
    <View style={{ minWidth: 64 }}>
      <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", letterSpacing: 0.4 }}>{label}</Text>
      <Text style={{ color: value == null ? colors.faint : colors.ink, fontSize: 15, fontWeight: "700", marginTop: 2 }}>
        {value != null && value !== "" ? value : "—"}
      </Text>
    </View>
  );
}
