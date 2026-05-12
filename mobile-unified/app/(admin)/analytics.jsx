/**
 * Admin analytics — aggregates the `emotions` collection into per-lecture engagement
 * + sleep rate, and overall gesture counts. Mirrors web AdminAnalytics.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, Text, View } from "react-native";
import { router } from "expo-router";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import {
  Button, Card, EmptyState, Header, Screen, Stat, colors, styles,
} from "../../components/admin/ui";

export default function AdminAnalytics() {
  const [emotions, setEmotions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const snap = await getDocs(collection(db, "emotions"));
      setEmotions(snap.docs.map((d) => d.data()));
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const perLecture = useMemo(() => {
    const by = {};
    for (const e of emotions) {
      const lid = e.lecture_id || "unknown";
      if (!by[lid]) by[lid] = { scores: [], sleep: 0, total: 0 };
      by[lid].scores.push(e.engagement_score || 0);
      by[lid].total += 1;
      if (e.state === "sleeping") by[lid].sleep += 1;
    }
    const out = Object.entries(by).map(([lid, d]) => ({
      lecture_id: lid,
      mean_engagement: d.scores.reduce((a, b) => a + b, 0) / d.scores.length,
      sleep_rate: d.total > 0 ? (d.sleep / d.total) * 100 : 0,
      samples: d.total,
    }));
    out.sort((a, b) => b.mean_engagement - a.mean_engagement);
    return out;
  }, [emotions]);

  const gestures = useMemo(() => {
    const c = {};
    for (const e of emotions) {
      const g = e.gesture || "none";
      c[g] = (c[g] || 0) + 1;
    }
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [emotions]);

  const overall = perLecture.length
    ? perLecture.reduce((s, r) => s + r.mean_engagement, 0) / perLecture.length
    : 0;
  const avgSleep = perLecture.length
    ? perLecture.reduce((s, r) => s + r.sleep_rate, 0) / perLecture.length
    : 0;

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header title="Analytics" subtitle="Engagement, sleep, gesture trends" action={<Button title="Back" onPress={() => router.back()} variant="ghost" />} />

      {err ? (
        <Card style={{ borderColor: colors.danger, backgroundColor: "#fef2f2" }}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Error</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{err}</Text>
        </Card>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat label="Lectures" value={perLecture.length} />
        <Stat label="Samples" value={emotions.length} tone="info" />
        <Stat label="Avg engagement" value={`${overall.toFixed(1)}%`} tone="success" />
        <Stat label="Avg sleep" value={`${avgSleep.toFixed(1)}%`} tone={avgSleep > 30 ? "warning" : "slate"} />
      </View>

      <Header title="Per lecture" />
      {perLecture.map((r) => (
        <Card key={r.lecture_id}>
          <Text style={styles.emptyTitle} numberOfLines={1}>{r.lecture_id}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{r.samples} sample{r.samples === 1 ? "" : "s"}</Text>
          <View style={{ marginTop: 10 }}>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.4 }}>ENGAGEMENT</Text>
            <View style={{ height: 10, backgroundColor: "#e8eef4", borderRadius: 999, marginTop: 6, overflow: "hidden" }}>
              <View style={{ width: `${Math.max(0, Math.min(100, r.mean_engagement))}%`, height: "100%", backgroundColor: colors.success }} />
            </View>
            <Text style={{ color: colors.ink, fontWeight: "800", marginTop: 4 }}>{r.mean_engagement.toFixed(1)}%</Text>
          </View>
          <View style={{ marginTop: 10 }}>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.4 }}>SLEEP RATE</Text>
            <View style={{ height: 10, backgroundColor: "#e8eef4", borderRadius: 999, marginTop: 6, overflow: "hidden" }}>
              <View style={{ width: `${Math.max(0, Math.min(100, r.sleep_rate))}%`, height: "100%", backgroundColor: colors.warning }} />
            </View>
            <Text style={{ color: colors.ink, fontWeight: "800", marginTop: 4 }}>{r.sleep_rate.toFixed(1)}%</Text>
          </View>
        </Card>
      ))}

      {gestures.length > 0 ? (
        <>
          <Header title="Gesture frequency" />
          <Card>
            {gestures.map(([g, count], i) => (
              <View key={g} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomColor: colors.border, borderBottomWidth: i < gestures.length - 1 ? 1 : 0 }}>
                <Text style={{ color: colors.ink, fontWeight: "600", textTransform: "capitalize" }}>{g.replace(/_/g, " ")}</Text>
                <Text style={{ color: colors.muted, fontWeight: "700" }}>{count}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {!loading && perLecture.length === 0 ? (
        <EmptyState title="No data yet" body="Run a few recorded lectures to see analytics." />
      ) : null}
    </Screen>
  );
}
