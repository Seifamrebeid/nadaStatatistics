import React, { useCallback, useEffect, useState } from "react";
import { Alert, Linking, RefreshControl, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { collection, getDocs, getDoc, doc, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../firebase";
import { Button, Card, EmptyState, Header, Screen, colors, styles } from "../../components/student/ui";

export default function StudentLecturesScreen() {
  const [loading, setLoading] = useState(true);
  const [lectures, setLectures] = useState([]);
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
      const snap = await getDocs(
        query(collection(db, "lectures"), where("enrolled_student_ids", "array-contains", studentId))
      );
      setLectures(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (error) {
      Alert.alert("Lectures error", error.message);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openReport = (lecture) => {
    if (lecture.report_pdf_url) {
      Linking.openURL(lecture.report_pdf_url);
    } else {
      Alert.alert("No report", "A report PDF is not available for this lecture yet.");
    }
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header title="Lectures" subtitle="Enrolled sessions and reports" />
      {lectures.map((lecture) => {
        const id = lecture.id;
        const isLive = lecture.status === "recording";
        const hasTranscript = !!lecture.transcript_id;
        return (
          <Card key={id}>
            <Text style={styles.emptyTitle}>{lecture.title || id}</Text>
            <Text style={{ color: colors.muted, marginTop: 5 }}>
              {[lecture.doctor_id, lecture.date].filter(Boolean).join(" | ")}
            </Text>
            <Text style={{ color: isLive ? colors.danger : colors.primary, marginTop: 7, fontWeight: "800" }}>
              {isLive ? "Live now" : lecture.status || "scheduled"}
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              {(isLive || hasTranscript) ? (
                <Button
                  title={isLive ? "Watch live" : "View transcript"}
                  onPress={() => router.push({ pathname: "/(student)/live", params: { lectureId: id } })}
                />
              ) : null}
              <Button title="Report" onPress={() => openReport(lecture)} variant="secondary" />
            </View>
          </Card>
        );
      })}
      {!lectures.length ? (
        <EmptyState title="No enrolled lectures" body="Ask your doctor or admin to enroll you in a class." />
      ) : null}
    </Screen>
  );
}
