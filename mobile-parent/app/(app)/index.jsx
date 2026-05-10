import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "../../firebase";
import { useChildren } from "../../context/ChildContext";
import {
  Button, Card, EmptyState, Header, Loading, Pill, Screen, Stat, colors, styles,
} from "../../components/ui";

export default function ParentHome() {
  const { children: kids, loading: kidsLoading, err: kidsErr } = useChildren();
  const [summaries, setSummaries] = useState([]);
  const [allLectures, setAllLectures] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (kidsLoading) return;
    if (!kids || kids.length === 0) {
      setSummaries([]);
      setAllLectures(0);
      return;
    }
    setBusy(true);
    try {
      const allLecIds = new Set();
      const out = await Promise.all(kids.map(async (c) => {
        try {
          const lecSnap = await getDocs(
            query(collection(db, "lectures"), where("enrolled_student_ids", "array-contains", c.id))
          );
          const lecIds = lecSnap.docs.map((d) => d.id);
          lecIds.forEach((id) => allLecIds.add(id));

          const emoSnap = await getDocs(
            query(collection(db, "emotions"), where("student_id", "==", c.id))
          );
          const emotions = emoSnap.docs.map((d) => d.data());
          const eng = emotions.length
            ? emotions.reduce((s, e) => s + (e.engagement_score || 0), 0) / emotions.length
            : 0;
          const attScores = emotions.filter((e) => e.attention_score != null).map((e) => e.attention_score);
          const att = attScores.length ? attScores.reduce((a, b) => a + b, 0) / attScores.length : null;

          // Warnings in last 7 days
          let warnCount = 0;
          try {
            const warnSnap = await getDocs(query(
              collection(db, "warnings"),
              where("student_id", "==", c.id),
              orderBy("timestamp", "desc"),
              limit(20),
            ));
            const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
            warnCount = warnSnap.docs.filter((d) => {
              const ts = d.data().timestamp;
              const ms = ts?.toMillis ? ts.toMillis() : new Date(ts).getTime();
              return ms > cutoff;
            }).length;
          } catch { /* missing index — silently ignore */ }

          return {
            id: c.id,
            name: c.name || c.id,
            lectureCount: lecIds.length,
            engagement: eng,
            attention: att,
            warnings: warnCount,
          };
        } catch {
          return { id: c.id, name: c.name || c.id, lectureCount: 0, engagement: 0, attention: null, warnings: 0 };
        }
      }));
      setSummaries(out);
      setAllLectures(allLecIds.size);
    } finally {
      setBusy(false);
    }
  }, [kids, kidsLoading]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => { load(); }, [load]);

  if (kidsLoading) return <Loading label="Loading your account..." />;

  const overallEng = summaries.length
    ? summaries.reduce((s, c) => s + (c.engagement || 0), 0) / summaries.length
    : 0;

  return (
    <Screen refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
      <Header
        title="Welcome"
        subtitle={`Snapshot of your ${kids.length === 1 ? "child" : "children"}'s engagement.`}
      />

      {kidsErr ? (
        <Card style={{ borderColor: colors.danger, backgroundColor: "#fef2f2" }}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Error</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{kidsErr}</Text>
        </Card>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat label="Children" value={kids.length} />
        <Stat label="Lectures" value={allLectures} tone="slate" />
        <Stat label="Avg Engagement" value={`${overallEng.toFixed(1)}%`} tone="success" />
      </View>

      <Header title="Per child" />
      {summaries.map((c) => {
        const engTone = c.engagement >= 70 ? "success" : c.engagement >= 45 ? "warning" : "danger";
        return (
          <Card key={c.id}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.emptyTitle}>{c.name}</Text>
                <Text style={{ color: colors.muted, marginTop: 4, fontSize: 12 }}>
                  {c.lectureCount} lecture{c.lectureCount === 1 ? "" : "s"} tracked
                </Text>
              </View>
              {c.warnings > 0 ? <Pill text={`${c.warnings} warning${c.warnings === 1 ? "" : "s"}`} tone="warning" /> : null}
            </View>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.4 }}>ENGAGEMENT</Text>
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors[engTone] || colors.primary, marginTop: 4 }}>
                  {c.engagement.toFixed(1)}%
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.4 }}>ATTENTION</Text>
                <Text style={{ fontSize: 18, fontWeight: "700", color: c.attention != null ? colors.ink : colors.faint, marginTop: 4 }}>
                  {c.attention != null ? c.attention.toFixed(1) : "—"}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Button title="Grades" variant="secondary" onPress={() => router.push("/(app)/grades")} />
              <Button title="Attendance" variant="secondary" onPress={() => router.push("/(app)/attendance")} />
            </View>
          </Card>
        );
      })}

      {!busy && summaries.length === 0 ? (
        <EmptyState
          title="No children linked"
          body="No children are linked to your account yet. Please contact the admin."
        />
      ) : null}
    </Screen>
  );
}
