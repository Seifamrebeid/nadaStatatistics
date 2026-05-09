import React, { useCallback, useMemo, useState } from "react";
import { Alert, RefreshControl, Text, View } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useFocusEffect } from "expo-router";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import { Button, Card, EmptyState, Header, Screen, Stat, colors, styles } from "../../components/ui";

export default function DoctorAnalyticsScreen() {
  const [lectures, setLectures] = useState([]);
  const [emotions, setEmotions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) { setLoading(false); return; }

      const userSnap = await getDoc(doc(db, "users", user.uid));
      const doctorId = userSnap.exists() ? userSnap.data().linked_id : null;
      if (!doctorId) { setLoading(false); return; }

      const lecSnap = await getDocs(
        query(collection(db, "lectures"), where("doctor_id", "==", doctorId))
      );
      const lectureRows = lecSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setLectures(lectureRows);

      const lectureIds = lectureRows.map((l) => l.id);
      let emotionRows = [];
      if (lectureIds.length > 0) {
        const emotionsSnap = await getDocs(
          query(collection(db, "emotions"), where("lecture_id", "in", lectureIds.slice(0, 30)))
        );
        emotionRows = emotionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
      setEmotions(emotionRows);
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
    const sleepCount = emotions.filter((row) => row.state === "sleeping").length;
    return {
      avg: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
      sleepRate: emotions.length ? Math.round((sleepCount / emotions.length) * 100) : 0,
      samples: emotions.length,
    };
  }, [emotions]);

  const exportCsv = async () => {
    const rows = [
      ["lecture_id", "student_id", "engagement_score", "state", "gesture", "timestamp"],
      ...emotions.map((row) => [
        row.lecture_id || "",
        row.student_id || "",
        row.engagement_score || "",
        row.state || "",
        row.gesture || "",
        row.timestamp ? String(row.timestamp.toDate ? row.timestamp.toDate().toISOString() : row.timestamp) : "",
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
          <Text key={`${row.id || index}`} style={{ color: colors.muted, marginTop: 8 }}>
            {row.timestamp
              ? String(row.timestamp.toDate ? row.timestamp.toDate().toISOString() : row.timestamp)
              : "sample"}{" "}
            | {row.gesture || "none"} | {row.state || "unknown"}
          </Text>
        ))}
        {!emotions.length ? <Text style={{ color: colors.muted, marginTop: 8 }}>No emotion samples yet.</Text> : null}
      </Card>

      {!emotions.length && !loading ? (
        <EmptyState title="No emotion data" body="Emotion samples from your lectures will appear here." />
      ) : null}
    </Screen>
  );
}
