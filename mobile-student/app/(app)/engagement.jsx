import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../firebase";
import {
  Button, Card, EmptyState, Header, Screen, Stat, colors, styles,
} from "../../components/ui";

export default function StudentEngagement() {
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
        query(collection(db, "emotions"), where("student_id", "==", studentId))
      );
      const emotions = snap.docs.map((d) => d.data());

      const byLecture = {};
      for (const e of emotions) {
        const lid = e.lecture_id || "unknown";
        if (!byLecture[lid]) byLecture[lid] = { scores: [], yawnCount: 0, total: 0 };
        byLecture[lid].scores.push(e.engagement_score || 0);
        byLecture[lid].total += 1;
        if (e.yawning) byLecture[lid].yawnCount += 1;
      }

      const data = Object.entries(byLecture).map(([lid, d]) => ({
        lecture_id: lid,
        mean_engagement: d.scores.reduce((a, b) => a + b, 0) / d.scores.length,
        sleep_rate: d.total > 0 ? (d.yawnCount / d.total) * 100 : 0,
        samples: d.total,
      }));
      data.sort((a, b) => b.mean_engagement - a.mean_engagement);
      setRows(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const overall = useMemo(() => {
    if (rows.length === 0) return 0;
    return rows.reduce((s, r) => s + r.mean_engagement, 0) / rows.length;
  }, [rows]);

  const avgSleep = useMemo(() => {
    if (rows.length === 0) return 0;
    return rows.reduce((s, r) => s + r.sleep_rate, 0) / rows.length;
  }, [rows]);

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header
        title="Engagement"
        subtitle="Your engagement and drowsiness per lecture"
        action={<Button title="Back" onPress={() => router.back()} variant="ghost" />}
      />

      {err ? (
        <Card style={{ borderColor: colors.danger, backgroundColor: "#fef2f2" }}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Error</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{err}</Text>
        </Card>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat label="Lectures tracked" value={rows.length} />
        <Stat label="Avg engagement" value={`${overall.toFixed(1)}%`} tone="success" />
        <Stat label="Avg drowsiness" value={`${avgSleep.toFixed(1)}%`} tone={avgSleep > 30 ? "warning" : "slate"} />
      </View>

      {rows.map((r) => (
        <Card key={r.lecture_id}>
          <Text style={styles.emptyTitle} numberOfLines={1}>{r.lecture_id}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
            {r.samples} sample{r.samples === 1 ? "" : "s"}
          </Text>

          <View style={{ marginTop: 12 }}>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.4 }}>ENGAGEMENT</Text>
            <View style={{ height: 10, backgroundColor: "#e8eef4", borderRadius: 999, marginTop: 6, overflow: "hidden" }}>
              <View style={{ width: `${Math.max(0, Math.min(100, r.mean_engagement))}%`, height: "100%", backgroundColor: colors.success }} />
            </View>
            <Text style={{ color: colors.ink, fontWeight: "800", marginTop: 4 }}>{r.mean_engagement.toFixed(1)}%</Text>
          </View>

          <View style={{ marginTop: 12 }}>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.4 }}>DROWSINESS RATE</Text>
            <View style={{ height: 10, backgroundColor: "#e8eef4", borderRadius: 999, marginTop: 6, overflow: "hidden" }}>
              <View style={{ width: `${Math.max(0, Math.min(100, r.sleep_rate))}%`, height: "100%", backgroundColor: colors.warning }} />
            </View>
            <Text style={{ color: colors.ink, fontWeight: "800", marginTop: 4 }}>{r.sleep_rate.toFixed(1)}%</Text>
          </View>
        </Card>
      ))}

      {!loading && rows.length === 0 ? (
        <EmptyState
          title="No engagement data yet"
          body="Your engagement is computed from recorded lectures. Once you've been in a recorded session, it'll appear here."
        />
      ) : null}
    </Screen>
  );
}
