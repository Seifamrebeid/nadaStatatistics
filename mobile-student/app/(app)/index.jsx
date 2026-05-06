import React, { useCallback, useMemo, useState } from "react";
import { Alert, RefreshControl, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { getLectures, getMe, getStudentComparison, normalize } from "../../api";
import { Button, Card, EmptyState, Header, Screen, Stat, colors, styles } from "../../components/ui";

export default function StudentHomeScreen() {
  const [loading, setLoading] = useState(true);
  const [lectures, setLectures] = useState([]);
  const [comparison, setComparison] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const me = normalize(await getMe());
      const studentId = me.linked_id || me.uid;
      const [lectureRows, comp] = await Promise.all([
        getLectures(),
        studentId ? getStudentComparison(studentId).catch(() => null) : Promise.resolve(null),
      ]);
      setLectures(lectureRows.map(normalize));
      setComparison(comp);
    } catch (error) {
      Alert.alert("Dashboard error", error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const liveLectures = lectures.filter((lecture) => lecture.status === "recording");
  const stats = useMemo(() => {
    const selfMean = Number(comparison?.self_mean || 0);
    const classMean = Number(comparison?.class_mean || 0);
    return { selfMean, classMean };
  }, [comparison]);

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header title="Home" subtitle="Your classroom snapshot" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat label="Enrolled lectures" value={lectures.length} />
        <Stat label="Live now" value={liveLectures.length} tone={liveLectures.length ? "danger" : "primary"} />
        <Stat label="Your engagement" value={`${stats.selfMean.toFixed(1)}%`} tone="success" />
        <Stat label="Class average" value={`${stats.classMean.toFixed(1)}%`} />
      </View>

      <Card>
        <Text style={styles.emptyTitle}>You vs Class Average</Text>
        <Text style={{ color: colors.muted, marginTop: 8 }}>
          You: {stats.selfMean.toFixed(1)}% | Class: {stats.classMean.toFixed(1)}%
        </Text>
        <View style={{ height: 10, backgroundColor: "#e8eef4", borderRadius: 999, marginTop: 12, overflow: "hidden" }}>
          <View
            style={{
              width: `${Math.max(0, Math.min(100, stats.selfMean))}%`,
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
        <Card key={lecture.id || lecture.lecture_id}>
          <Text style={styles.emptyTitle}>{lecture.title || lecture.subject_name || lecture.id || "Lecture"}</Text>
          <Text style={{ color: colors.muted, marginTop: 5 }}>
            {[lecture.doctor_name || lecture.doctor_id, lecture.scheduled_at || lecture.date].filter(Boolean).join(" | ")}
          </Text>
          <Text style={{ color: lecture.status === "recording" ? colors.danger : colors.primary, marginTop: 7, fontWeight: "800" }}>
            {lecture.status === "recording" ? "Live now" : lecture.status || "scheduled"}
          </Text>
        </Card>
      ))}
      {!lectures.length ? <EmptyState title="No enrolled lectures" body="Your lectures will appear here after enrollment." /> : null}
    </Screen>
  );
}
