import React, { useCallback, useState } from "react";
import { Alert, RefreshControl, Text, View } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { collection, getDocs, getDoc, doc, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../firebase";
import { Button, Card, EmptyState, Header, Screen, Stat, styles } from "../../components/ui";

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

      <Header
        title="Active Lectures"
        subtitle={`${recording.length} currently recording`}
        action={<Button title="Live" onPress={() => router.push("/(app)/live")} variant="secondary" />}
      />
      {recording.length ? (
        recording.map((lecture) => (
          <Card key={lecture.id}>
            <Text style={styles.emptyTitle}>{lecture.title || "Lecture"}</Text>
            <Text style={{ color: "#657485", marginTop: 4 }}>{lecture.status}</Text>
          </Card>
        ))
      ) : (
        <EmptyState title="No live lectures" body="Recording lectures will appear here." />
      )}
    </Screen>
  );
}
