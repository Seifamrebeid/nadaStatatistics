import React, { useCallback, useState } from "react";
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs, getDoc, doc, query, where } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { Button, Card, EmptyState, Header, Pill, Screen, Stat, colors, styles } from "../../components/ui";

export default function DoctorHomeScreen() {
  const [state, setState] = useState({ loading: true, lectures: [], emotions: [] });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    try {
      const user = auth.currentUser;
      if (!user) {
        setState({ loading: false, lectures: [], emotions: [] });
        return;
      }

      // Get doctor's linked_id from users collection
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const doctorId = userSnap.exists() ? userSnap.data().linked_id : null;

      if (!doctorId) {
        setState({ loading: false, lectures: [], emotions: [] });
        return;
      }

      // Fetch doctor's lectures
      const lecSnap = await getDocs(
        query(collection(db, "lectures"), where("doctor_id", "==", doctorId))
      );
      const lectures = lecSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Fetch emotions for those lectures
      let emotions = [];
      const lectureIds = lectures.map((l) => l.id);
      if (lectureIds.length > 0) {
        const emotionsSnap = await getDocs(
          query(collection(db, "emotions"), where("lecture_id", "in", lectureIds.slice(0, 30)))
        );
        emotions = emotionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }

      setState({ loading: false, lectures, emotions });
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
    const date = lecture.date;
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

      <Header title="Quick links" />
      <View style={local.grid}>
        <QuickLink icon="checkbox" label="Attendance" tone="success" to="/(app)/attendance" />
        <QuickLink icon="notifications" label="Notify" tone="warning" to="/(app)/notifications" />
        <QuickLink icon="apps" label="Classes" tone="info" to="/(app)/classes" />
        <QuickLink icon="library" label="Subjects" tone="brand" to="/(app)/subjects" />
        <QuickLink icon="calendar" label="Weeks" tone="slate" to="/(app)/weeks" />
        <QuickLink icon="git-network" label="Hierarchy" tone="info" to="/(app)/hierarchy" />
        <QuickLink icon="search" label="Students" tone="brand" to="/(app)/student-search" />
        <QuickLink icon="bar-chart" label="Analytics" tone="success" to="/(app)/analytics" />
        <QuickLink icon="mail" label="Messages" tone="warning" to="/(app)/messages" />
      </View>

      <Header
        title="Active lectures"
        subtitle={`${recording.length} currently recording`}
        action={<Button title="Live" onPress={() => router.push("/(app)/live")} variant="secondary" />}
      />
      {recording.length ? (
        recording.map((lecture) => (
          <Card key={lecture.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <Text style={[styles.emptyTitle, { flex: 1 }]}>{lecture.title || "Lecture"}</Text>
              <Pill text="LIVE" tone="danger" />
            </View>
          </Card>
        ))
      ) : (
        <EmptyState title="No live lectures" body="Recording lectures will appear here." />
      )}
    </Screen>
  );
}

function QuickLink({ icon, label, tone = "slate", to }) {
  const tones = {
    info:    "#3b82f6",
    success: "#10b981",
    warning: "#f59e0b",
    danger:  "#ef4444",
    slate:   "#64748b",
    brand:   colors.primary,
  };
  return (
    <Pressable
      onPress={() => router.push(to)}
      style={({ pressed }) => [local.tile, pressed && { opacity: 0.85 }]}
    >
      <View style={[local.iconWrap, { backgroundColor: `${tones[tone]}1a` }]}>
        <Ionicons name={icon} size={20} color={tones[tone]} />
      </View>
      <Text style={local.tileLabel}>{label}</Text>
    </Pressable>
  );
}

const local = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tile: {
    flexBasis: "31%",
    flexGrow: 0,
    backgroundColor: "#ffffff",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: "center",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  iconWrap: {
    height: 36,
    width: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  tileLabel: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
});
