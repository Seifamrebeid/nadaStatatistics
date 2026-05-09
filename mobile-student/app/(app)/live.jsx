import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, RefreshControl, ScrollView, Text, View } from "react-native";
import { collection, doc, getDocs, getDoc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useLocalSearchParams } from "expo-router";
import { auth, db } from "../../firebase";
import { Button, Card, EmptyState, Header, Screen, colors, styles } from "../../components/ui";

const isRtl = (text = "") => /[؀-ۿ]/.test(text);

export default function StudentLiveScreen() {
  const params = useLocalSearchParams();
  const scrollRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [lectures, setLectures] = useState([]);
  const [selectedId, setSelectedId] = useState(params.lectureId || "");
  const [segments, setSegments] = useState([]);
  const [completed, setCompleted] = useState(false);
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

  const loadLectures = useCallback(async () => {
    if (!studentId) return;
    try {
      setLoading(true);
      const snap = await getDocs(
        query(collection(db, "lectures"), where("enrolled_student_ids", "array-contains", studentId))
      );
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setLectures(rows);
      if (!selectedId) {
        const live = rows.find((lecture) => lecture.status === "recording");
        if (live) setSelectedId(live.id);
      }
    } catch (error) {
      Alert.alert("Live lecture error", error.message);
    } finally {
      setLoading(false);
    }
  }, [studentId, selectedId]);

  useEffect(() => {
    loadLectures();
  }, [loadLectures]);

  useEffect(() => {
    if (!selectedId) return undefined;

    const segmentsRef = collection(db, "transcripts", String(selectedId), "segments");
    const segmentsQuery = query(segmentsRef, orderBy("chunk_index"));
    const transcriptRef = doc(db, "transcripts", String(selectedId));

    const unsubscribeSegments = onSnapshot(segmentsQuery, (snapshot) => {
      setSegments(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd?.({ animated: true }));
    });
    const unsubscribeTranscript = onSnapshot(transcriptRef, (snapshot) => {
      setCompleted(snapshot.exists() && snapshot.data()?.completed === true);
    });

    return () => {
      unsubscribeSegments();
      unsubscribeTranscript();
    };
  }, [selectedId]);

  const liveLectures = useMemo(
    () => lectures.filter((lecture) => lecture.status === "recording"),
    [lectures]
  );
  const selectedLecture = lectures.find((lecture) => String(lecture.id) === String(selectedId));

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={loadLectures} />}>
      <Header
        title="Live"
        subtitle={selectedLecture ? selectedLecture.title : "Live captions"}
      />

      {!selectedId ? (
        <>
          <EmptyState title="No live lecture" body="When one of your enrolled lectures starts recording, it will appear here." />
          {liveLectures.map((lecture) => (
            <Card key={lecture.id}>
              <Text style={styles.emptyTitle}>{lecture.title}</Text>
              <Button title="Open captions" onPress={() => setSelectedId(lecture.id)} />
            </Card>
          ))}
        </>
      ) : (
        <>
          <Card>
            <Text style={styles.emptyTitle}>{completed ? "Transcript Completed" : "Live Captions"}</Text>
            <Text style={{ color: colors.muted, marginTop: 6 }}>
              {segments.length} segment{segments.length === 1 ? "" : "s"}
            </Text>
          </Card>
          <Card style={{ minHeight: 360 }}>
            <ScrollView ref={scrollRef} style={{ maxHeight: 420 }}>
              {segments.map((segment) => (
                <View key={segment.id} style={{ borderBottomWidth: 1, borderBottomColor: "#edf1f5", paddingVertical: 9 }}>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {Number(segment.start || 0).toFixed(1)}s - {Number(segment.end || 0).toFixed(1)}s
                  </Text>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 16,
                      lineHeight: 24,
                      marginTop: 4,
                      textAlign: isRtl(segment.text) ? "right" : "left",
                      writingDirection: isRtl(segment.text) ? "rtl" : "ltr",
                    }}
                  >
                    {segment.text}
                  </Text>
                </View>
              ))}
              {!segments.length ? (
                <Text style={{ color: colors.muted, textAlign: "center", paddingVertical: 80 }}>
                  Waiting for captions...
                </Text>
              ) : null}
            </ScrollView>
          </Card>
          <Button title="Choose another live lecture" onPress={() => setSelectedId("")} variant="secondary" />
        </>
      )}
    </Screen>
  );
}
