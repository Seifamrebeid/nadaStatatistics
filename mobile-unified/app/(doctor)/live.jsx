import React, { useEffect, useState } from "react";
import { RefreshControl, Text } from "react-native";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  limit,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import { Card, EmptyState, Header, Screen, Stat, colors, styles } from "../../components/doctor/ui";

export default function LiveClassroomScreen() {
  const [lectures, setLectures] = useState([]);
  const [emotions, setEmotions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubEmotions = null;

    const setup = async () => {
      try {
        const user = auth.currentUser;
        if (!user) { setLoading(false); return; }

        const userSnap = await getDoc(doc(db, "users", user.uid));
        const doctorId = userSnap.exists() ? userSnap.data().linked_id : null;
        if (!doctorId) { setLoading(false); return; }

        // Fetch doctor's lectures once
        const lecSnap = await getDocs(
          query(collection(db, "lectures"), where("doctor_id", "==", doctorId))
        );
        const allLectures = lecSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setLectures(allLectures);

        // Subscribe to real-time emotions for all doctor's lectures
        const lectureIds = allLectures.map((l) => l.id);
        if (lectureIds.length > 0) {
          const liveIds = allLectures
            .filter((l) => l.status === "recording")
            .map((l) => l.id);

          // Use the first recording lecture for live emotions, or fall back to all
          const targetIds = liveIds.length > 0 ? liveIds : lectureIds;
          const firstId = targetIds[0];

          const emotionsQuery = query(
            collection(db, "emotions"),
            where("lecture_id", "==", firstId),
            orderBy("timestamp", "desc"),
            limit(50)
          );

          unsubEmotions = onSnapshot(emotionsQuery, (snap) => {
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setEmotions(rows);
          });
        }

        setLoading(false);
      } catch {
        setLoading(false);
      }
    };

    setup();
    return () => {
      if (unsubEmotions) unsubEmotions();
    };
  }, []);

  const liveLectures = lectures.filter((lecture) => lecture.status === "recording");
  const sleepy = emotions.filter((row) => row.state === "sleeping").length;
  const hands = emotions.filter((row) => row.gesture === "hand_raised").length;
  const toilet = emotions.filter((row) => row.gesture === "toilet_request").length;

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={() => {}} />}>
      <Header title="Live" subtitle="Real-time classroom feed" />
      <Stat label="Recording lectures" value={liveLectures.length} />
      <Stat label="Sleep signals" value={sleepy} tone="danger" />
      <Stat label="Raised hands" value={hands} tone="warning" />
      <Stat label="Toilet requests" value={toilet} tone="warning" />

      {liveLectures.length ? (
        liveLectures.map((lecture) => (
          <Card key={lecture.id}>
            <Text style={styles.emptyTitle}>{lecture.title || "Live lecture"}</Text>
            <Text style={{ color: colors.muted, marginTop: 5 }}>
              {lecture.date || "Recording"}
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
