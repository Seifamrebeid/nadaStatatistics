import React, { useCallback, useMemo, useState } from "react";
import { Alert, RefreshControl, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { getMe, getStudentComparison, normalize } from "../../api";
import { Card, EmptyState, Header, Screen, Stat, colors, styles } from "../../components/ui";

export default function StudentHistoryScreen() {
  const [loading, setLoading] = useState(true);
  const [comparison, setComparison] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const me = normalize(await getMe());
      const studentId = me.linked_id || me.uid;
      setComparison(studentId ? await getStudentComparison(studentId) : null);
    } catch (error) {
      Alert.alert("History error", error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const perLecture = useMemo(() => comparison?.per_lecture || [], [comparison]);
  const selfMean = Number(comparison?.self_mean || 0);
  const classMean = Number(comparison?.class_mean || 0);

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header title="History" subtitle="Your engagement over time" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat label="Lectures attended" value={perLecture.length} />
        <Stat label="Average engagement" value={`${selfMean.toFixed(1)}%`} tone="success" />
        <Stat label="Class average" value={`${classMean.toFixed(1)}%`} />
      </View>

      {perLecture.length ? (
        perLecture.map((item, index) => {
          const self = Number(item.self || 0);
          const classValue = Number(item.class_mean || 0);
          return (
            <Card key={item.lecture_id || index}>
              <Text style={styles.emptyTitle}>Lecture {index + 1}</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>{item.lecture_id || "No lecture id"}</Text>
              <Text style={{ color: colors.success, marginTop: 8, fontWeight: "800" }}>
                You: {self.toFixed(1)}%
              </Text>
              <View style={{ height: 8, backgroundColor: "#e8eef4", borderRadius: 999, marginTop: 8, overflow: "hidden" }}>
                <View style={{ width: `${Math.max(0, Math.min(100, self))}%`, height: "100%", backgroundColor: colors.success }} />
              </View>
              <Text style={{ color: colors.muted, marginTop: 8 }}>
                Class average: {classValue.toFixed(1)}%
              </Text>
            </Card>
          );
        })
      ) : (
        <EmptyState title="No lecture history yet" body="Engagement history appears after recorded lectures finish." />
      )}
    </Screen>
  );
}
