import React, { useCallback, useState } from "react";
import { Alert, RefreshControl, Text, View } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { getEmotions, getHealth, getLectures, normalize } from "../../api";
import { Button, Card, EmptyState, Header, Screen, Stat, styles } from "../../components/ui";

export default function DoctorHomeScreen() {
  const [state, setState] = useState({ loading: true, lectures: [], emotions: [], health: null });

  const load = useCallback(async () => {
    try {
      const [lectures, emotions, health] = await Promise.all([
        getLectures(),
        getEmotions().catch(() => []),
        getHealth().catch(() => null),
      ]);
      setState({
        loading: false,
        lectures: lectures.map(normalize),
        emotions: emotions.map(normalize),
        health,
      });
    } catch (error) {
      Alert.alert("Dashboard error", error.message);
      setState((current) => ({ ...current, loading: false }));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const today = new Date().toDateString();
  const todayLectures = state.lectures.filter((lecture) => {
    const date = lecture.scheduled_at || lecture.date;
    return date ? new Date(date).toDateString() === today : false;
  });
  const recording = state.lectures.filter((lecture) => lecture.status === "recording");
  const engagementValues = state.emotions
    .map((row) => Number(row.engagement_score))
    .filter((score) => Number.isFinite(score));
  const avgEngagement = engagementValues.length
    ? Math.round(engagementValues.reduce((sum, score) => sum + score, 0) / engagementValues.length)
    : 0;

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={state.loading} onRefresh={load} />}
    >
      <Header title="Home" subtitle="Doctor classroom overview" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat label="Today's lectures" value={todayLectures.length} />
        <Stat label="Recording now" value={recording.length} tone="success" />
        <Stat label="Avg engagement" value={`${avgEngagement}%`} />
        <Stat
          label="Hands raised"
          value={state.emotions.filter((row) => row.gesture === "hand_raised").length}
          tone="warning"
        />
      </View>

      <Card>
        <Text style={styles.emptyTitle}>API status</Text>
        <Text style={{ color: "#657485", marginTop: 6 }}>
          {state.health ? `${state.health.status || "online"} ${state.health.mode || ""}` : "Not available"}
        </Text>
      </Card>

      <Header
        title="Active Lectures"
        subtitle={`${recording.length} currently recording`}
        action={<Button title="Live" onPress={() => router.push("/(app)/live")} variant="secondary" />}
      />
      {recording.length ? (
        recording.map((lecture) => (
          <Card key={lecture.id || lecture.lecture_id}>
            <Text style={styles.emptyTitle}>{lecture.title || lecture.subject_name || "Lecture"}</Text>
            <Text style={{ color: "#657485", marginTop: 4 }}>{lecture.class_name || lecture.week_name || lecture.status}</Text>
          </Card>
        ))
      ) : (
        <EmptyState title="No live lectures" body="Recording lectures will appear here." />
      )}
    </Screen>
  );
}
