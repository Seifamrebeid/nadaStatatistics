import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, Text } from "react-native";
import { getEmotions, getLectures, normalize } from "../../api";
import { Card, EmptyState, Header, Screen, Stat, colors, styles } from "../../components/ui";

export default function LiveClassroomScreen() {
  const [lectures, setLectures] = useState([]);
  const [emotions, setEmotions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [lectureRows, emotionRows] = await Promise.all([
        getLectures(),
        getEmotions().catch(() => []),
      ]);
      setLectures(lectureRows.map(normalize));
      setEmotions(emotionRows.map(normalize));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const liveLectures = lectures.filter((lecture) => lecture.status === "recording");
  const sleepy = emotions.filter((row) => row.emotion === "sleepy" || row.state === "sleeping").length;
  const hands = emotions.filter((row) => row.gesture === "hand_raised").length;
  const toilet = emotions.filter((row) => row.gesture === "toilet_request").length;

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header title="Live" subtitle="Auto-refreshes every five seconds" />
      <Stat label="Recording lectures" value={liveLectures.length} />
      <Stat label="Sleep signals" value={sleepy} tone="danger" />
      <Stat label="Raised hands" value={hands} tone="warning" />
      <Stat label="Toilet requests" value={toilet} tone="warning" />

      {liveLectures.length ? (
        liveLectures.map((lecture) => (
          <Card key={lecture.id || lecture.lecture_id}>
            <Text style={styles.emptyTitle}>{lecture.title || lecture.subject_name || "Live lecture"}</Text>
            <Text style={{ color: colors.muted, marginTop: 5 }}>
              {lecture.class_name || lecture.week_name || "Recording"}
            </Text>
            <Text style={{ color: colors.success, marginTop: 8, fontWeight: "800" }}>
              recording
            </Text>
          </Card>
        ))
      ) : (
        <EmptyState title="No classroom is live" body="Start recording from the classroom capture app." />
      )}
    </Screen>
  );
}
