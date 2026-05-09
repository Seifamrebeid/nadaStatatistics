import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, RefreshControl, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { collection, getDocs, getDoc, doc, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../firebase";
import { Button, Card, EmptyState, Header, Screen, Stat, colors, styles } from "../../components/ui";

export default function StudentHomeScreen() {
  const [loading, setLoading] = useState(true);
  const [lectures, setLectures] = useState([]);
  const [myAvg, setMyAvg] = useState(0);
  const [studentId, setStudentId] = useState(null);

  // Resolve the linked student ID once from auth + users collection
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          setStudentId(snap.data().linked_id || null);
        }
      } catch {
        // silently ignore
      }
    });
    return unsubscribe;
  }, []);

  const load = useCallback(async () => {
    if (!studentId) return;
    try {
      setLoading(true);

      // Lectures this student is enrolled in
      const lecSnap = await getDocs(
        query(collection(db, "lectures"), where("enrolled_student_ids", "array-contains", studentId))
      );
      const lectureRows = lecSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setLectures(lectureRows);

      // My engagement average from emotions collection
      const emotionsSnap = await getDocs(
        query(collection(db, "emotions"), where("student_id", "==", studentId))
      );
      const myEmotions = emotionsSnap.docs.map((d) => d.data());
      const avg =
        myEmotions.length > 0
          ? myEmotions.reduce((s, e) => s + (e.engagement_score || 0), 0) / myEmotions.length
          : 0;
      setMyAvg(avg);
    } catch (error) {
      Alert.alert("Dashboard error", error.message);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const liveLectures = lectures.filter((lecture) => lecture.status === "recording");

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header title="Home" subtitle="Your classroom snapshot" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat label="Enrolled lectures" value={lectures.length} />
        <Stat label="Live now" value={liveLectures.length} tone={liveLectures.length ? "danger" : "primary"} />
        <Stat label="Your engagement" value={`${myAvg.toFixed(1)}%`} tone="success" />
      </View>

      <Card>
        <Text style={styles.emptyTitle}>Your Engagement</Text>
        <Text style={{ color: colors.muted, marginTop: 8 }}>
          Average: {myAvg.toFixed(1)}%
        </Text>
        <View style={{ height: 10, backgroundColor: "#e8eef4", borderRadius: 999, marginTop: 12, overflow: "hidden" }}>
          <View
            style={{
              width: `${Math.max(0, Math.min(100, myAvg))}%`,
              height: "100%",
              backgroundColor: colors.success,
            }}
          />
        </View>
      </Card>

      <Header
        title="Recent Lectures"
        subtitle={`${liveLectures.length} recording`}
        action={<Button title="All" onPress={() => router.push("/(app)/lectures")} variant="secondary" />}
      />
      {lectures.slice(0, 6).map((lecture) => (
        <Card key={lecture.id}>
          <Text style={styles.emptyTitle}>{lecture.title || lecture.id || "Lecture"}</Text>
          <Text style={{ color: colors.muted, marginTop: 5 }}>
            {[lecture.doctor_id, lecture.date].filter(Boolean).join(" | ")}
          </Text>
          <Text style={{ color: lecture.status === "recording" ? colors.danger : colors.primary, marginTop: 7, fontWeight: "800" }}>
            {lecture.status === "recording" ? "Live now" : lecture.status || "scheduled"}
          </Text>
        </Card>
      ))}
      {!lectures.length ? (
        <EmptyState title="No enrolled lectures" body="Your lectures will appear here after enrollment." />
      ) : null}
    </Screen>
  );
}
