import React, { useCallback, useState } from "react";
import { Alert, Linking, RefreshControl, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { API_URL, getLectures, normalize } from "../../api";
import { Button, Card, EmptyState, Header, Screen, colors, styles } from "../../components/ui";

export default function StudentLecturesScreen() {
  const [loading, setLoading] = useState(true);
  const [lectures, setLectures] = useState([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLectures((await getLectures()).map(normalize));
    } catch (error) {
      Alert.alert("Lectures error", error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openReport = (lecture) => {
    const id = lecture.id || lecture.lecture_id;
    Linking.openURL(`${API_URL}/api/lectures/${id}/report`);
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header title="Lectures" subtitle="Enrolled sessions and reports" />
      {lectures.map((lecture) => {
        const id = lecture.id || lecture.lecture_id;
        const isLive = lecture.status === "recording";
        return (
          <Card key={id}>
            <Text style={styles.emptyTitle}>{lecture.title || lecture.subject_name || id}</Text>
            <Text style={{ color: colors.muted, marginTop: 5 }}>
              {[lecture.doctor_name || lecture.doctor_id, lecture.scheduled_at || lecture.date].filter(Boolean).join(" | ")}
            </Text>
            <Text style={{ color: isLive ? colors.danger : colors.primary, marginTop: 7, fontWeight: "800" }}>
              {isLive ? "Live now" : lecture.status || "scheduled"}
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              {isLive ? (
                <Button title="Open live" onPress={() => router.push({ pathname: "/(app)/live", params: { lectureId: id } })} />
              ) : null}
              <Button title="Report" onPress={() => openReport(lecture)} variant="secondary" />
            </View>
          </Card>
        );
      })}
      {!lectures.length ? <EmptyState title="No enrolled lectures" body="Ask your doctor or admin to enroll you in a class." /> : null}
    </Screen>
  );
}
