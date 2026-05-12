import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, RefreshControl, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { collection, getDocs, getDoc, doc, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../firebase";
import { Card, EmptyState, Header, Screen, Stat, colors, styles } from "../../components/student/ui";

export default function StudentHistoryScreen() {
  const [loading, setLoading] = useState(true);
  const [perLecture, setPerLecture] = useState([]);
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

      // All emotion records for this student
      const emotionsSnap = await getDocs(
        query(collection(db, "emotions"), where("student_id", "==", studentId))
      );
      const myEmotions = emotionsSnap.docs.map((d) => d.data());

      // Group by lecture_id
      const byLecture = {};
      myEmotions.forEach((e) => {
        if (!byLecture[e.lecture_id]) byLecture[e.lecture_id] = [];
        byLecture[e.lecture_id].push(e.engagement_score || 0);
      });

      const rows = Object.entries(byLecture).map(([lid, scores]) => ({
        lecture_id: lid,
        my_avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      }));
      setPerLecture(rows);

      const overall =
        myEmotions.length > 0
          ? myEmotions.reduce((s, e) => s + (e.engagement_score || 0), 0) / myEmotions.length
          : 0;
      setMyAvg(overall);
    } catch (error) {
      Alert.alert("History error", error.message);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header title="History" subtitle="Your engagement over time" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat label="Lectures attended" value={perLecture.length} />
        <Stat label="Average engagement" value={`${myAvg.toFixed(1)}%`} tone="success" />
      </View>

      {perLecture.length ? (
        perLecture.map((item, index) => {
          const self = Number(item.my_avg || 0);
          return (
            <Card key={item.lecture_id || index}>
              <Text style={styles.emptyTitle}>Lecture {index + 1}</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>{item.lecture_id || "No lecture id"}</Text>
              <Text style={{ color: colors.success, marginTop: 8, fontWeight: "800" }}>
                You: {self.toFixed(1)}%
              </Text>
              <View style={{ height: 8, backgroundColor: "#e8eef4", borderRadius: 999, marginTop: 8, overflow: "hidden" }}>
                <View
                  style={{
                    width: `${Math.max(0, Math.min(100, self))}%`,
                    height: "100%",
                    backgroundColor: colors.success,
                  }}
                />
              </View>
            </Card>
          );
        })
      ) : (
        <EmptyState title="No lecture history yet" body="Engagement history appears after recorded lectures finish." />
      )}
    </Screen>
  );
}
