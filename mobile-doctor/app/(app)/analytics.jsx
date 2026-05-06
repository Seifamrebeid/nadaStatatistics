import React, { useCallback, useMemo, useState } from "react";
import { Alert, RefreshControl, Text, View } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useFocusEffect } from "expo-router";
import { getEmotions, getEngagementAnalytics, getLectures, normalize } from "../../api";
import { Button, Card, EmptyState, Header, Screen, Stat, colors, styles } from "../../components/ui";

export default function DoctorAnalyticsScreen() {
  const [lectures, setLectures] = useState([]);
  const [emotions, setEmotions] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [lectureRows, emotionRows, engagement] = await Promise.all([
        getLectures(),
        getEmotions().catch(() => []),
        getEngagementAnalytics().catch(() => null),
      ]);
      setLectures(lectureRows.map(normalize));
      setEmotions(emotionRows.map(normalize));
      setAnalytics(engagement);
    } catch (error) {
      Alert.alert("Analytics error", error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const summary = useMemo(() => {
    const scores = emotions
      .map((row) => Number(row.engagement_score))
      .filter((score) => Number.isFinite(score));
    const sleepCount = emotions.filter((row) => row.emotion === "sleepy" || row.state === "sleeping").length;
    return {
      avg: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
      sleepRate: emotions.length ? Math.round((sleepCount / emotions.length) * 100) : 0,
      samples: emotions.length,
    };
  }, [emotions]);

  const exportCsv = async () => {
    const rows = [
      ["lecture_id", "student_id", "engagement_score", "emotion", "gesture", "created_at"],
      ...emotions.map((row) => [
        row.lecture_id || "",
        row.student_id || "",
        row.engagement_score || "",
        row.emotion || "",
        row.gesture || "",
        row.created_at || "",
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const uri = `${FileSystem.cacheDirectory}doctor-analytics.csv`;
    await FileSystem.writeAsStringAsync(uri, csv);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: "text/csv" });
    } else {
      Alert.alert("Export ready", uri);
    }
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header title="Analytics" subtitle="Engagement, sleep, gestures, and exports" action={<Button title="CSV" onPress={exportCsv} variant="secondary" />} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat label="Avg engagement" value={`${summary.avg}%`} />
        <Stat label="Sleep rate" value={`${summary.sleepRate}%`} tone="danger" />
        <Stat label="Samples" value={summary.samples} />
        <Stat label="Lectures" value={lectures.length} tone="success" />
      </View>

      <Card>
        <Text style={styles.emptyTitle}>Gesture Timeline</Text>
        {emotions.slice(0, 8).map((row, index) => (
          <Text key={`${row.id || row.created_at || index}`} style={{ color: colors.muted, marginTop: 8 }}>
            {row.created_at || "sample"} | {row.gesture || "none"} | {row.emotion || "unknown"}
          </Text>
        ))}
        {!emotions.length ? <Text style={{ color: colors.muted, marginTop: 8 }}>No emotion samples yet.</Text> : null}
      </Card>

      <Card>
        <Text style={styles.emptyTitle}>Transcript Panel</Text>
        {emotions.filter((row) => row.transcript || row.text).slice(0, 5).map((row, index) => (
          <Text key={`${row.id || index}-text`} style={{ color: colors.muted, marginTop: 8 }}>
            {row.transcript || row.text}
          </Text>
        ))}
        {!emotions.some((row) => row.transcript || row.text) ? (
          <Text style={{ color: colors.muted, marginTop: 8 }}>No transcript segments available.</Text>
        ) : null}
      </Card>

      {analytics ? (
        <Card>
          <Text style={styles.emptyTitle}>Backend Analytics</Text>
          <Text style={{ color: colors.muted, marginTop: 8 }}>{JSON.stringify(analytics).slice(0, 500)}</Text>
        </Card>
      ) : (
        <EmptyState title="Analytics endpoint pending" body="Local emotion samples are shown until aggregate data is available." />
      )}
    </Screen>
  );
}
