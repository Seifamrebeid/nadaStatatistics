/**
 * Live transcript viewer (pushed via /live?lectureId=<id>).
 *
 * Two-step data flow (mirrors web-student StudentLiveLecture):
 *   1. onSnapshot(lectures/{lectureId}) → reads transcript_id + status
 *   2. once transcript_id is known, onSnapshot(transcripts/{transcript_id}/segments)
 *
 * The previous version queried transcripts/{lectureId}/segments directly which
 * silently returned no rows because the transcript doc id is auto-generated,
 * not equal to the lecture id.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  collection, doc, onSnapshot, orderBy, query,
} from "firebase/firestore";
import { db } from "../../firebase";
import {
  Button, Card, EmptyState, Header, Pill, Screen, colors, styles,
} from "../../components/student/ui";

const isRtl = (text = "") => /[؀-ۿ]/.test(text);

export default function StudentLiveLecture() {
  const params = useLocalSearchParams();
  const lectureId = params.lectureId ? String(params.lectureId) : "";

  const [lectureTitle, setLectureTitle] = useState("");
  const [isLive, setIsLive] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [transcriptId, setTranscriptId] = useState(null);
  const [segments, setSegments] = useState([]);
  const [err, setErr] = useState(null);
  const scrollRef = useRef(null);

  // Step 1: subscribe to the lecture doc to discover transcript_id + status.
  useEffect(() => {
    if (!lectureId) {
      setErr("No lecture id provided.");
      return;
    }
    const unsub = onSnapshot(
      doc(db, "lectures", lectureId),
      (snap) => {
        if (!snap.exists()) {
          setErr("Lecture not found.");
          return;
        }
        const data = snap.data();
        setLectureTitle(data.title || lectureId);
        setIsLive(data.status === "recording");
        setCompleted(data.status === "finished" || !!data.finalized_at);
        if (data.transcript_id) setTranscriptId(data.transcript_id);
      },
      (e) => setErr(e.message),
    );
    return unsub;
  }, [lectureId]);

  // Step 2: once transcript_id is known, subscribe to the segments subcollection.
  useEffect(() => {
    if (!transcriptId) return;
    const segUnsub = onSnapshot(
      query(collection(db, "transcripts", transcriptId, "segments"), orderBy("chunk_index")),
      (snap) => {
        setSegments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        requestAnimationFrame(() => scrollRef.current?.scrollToEnd?.({ animated: true }));
      },
      (e) => setErr(e.message),
    );
    return segUnsub;
  }, [transcriptId]);

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(student)/transcripts");
  }, []);

  if (err) {
    return (
      <Screen>
        <Header title="Live transcript" />
        <Card style={{ borderColor: colors.danger, backgroundColor: "#fef2f2" }}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Error</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{err}</Text>
        </Card>
        <Button title="Back" onPress={back} variant="secondary" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title={lectureTitle || "Lecture"}
        subtitle={completed ? "Full transcript" : isLive ? "Live captions — updating as the doctor speaks" : "Waiting for lecture to start…"}
        action={<Button title="Back" onPress={back} variant="ghost" />}
      />

      <View style={{ flexDirection: "row", gap: 6 }}>
        {isLive ? <Pill text="LIVE" tone="danger" /> : null}
        {completed ? <Pill text="Completed" tone="success" /> : null}
        {!isLive && !completed ? <Pill text="Scheduled" tone="info" /> : null}
      </View>

      <Card style={{ minHeight: 380 }}>
        <ScrollView ref={scrollRef} style={{ maxHeight: 440 }}>
          {segments.length > 0 ? (
            segments.map((seg) => (
              <View
                key={seg.id}
                style={{ borderBottomWidth: 1, borderBottomColor: "#edf1f5", paddingVertical: 9 }}
              >
                <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700" }}>
                  {Number(seg.start || 0).toFixed(1)}s – {Number(seg.end || 0).toFixed(1)}s
                </Text>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 16,
                    lineHeight: 24,
                    marginTop: 4,
                    textAlign: isRtl(seg.text) ? "right" : "left",
                    writingDirection: isRtl(seg.text) ? "rtl" : "ltr",
                  }}
                >
                  {seg.text}
                </Text>
              </View>
            ))
          ) : (
            <Text style={{ color: colors.muted, textAlign: "center", paddingVertical: 80 }}>
              {!transcriptId
                ? isLive ? "Transcription starting…" : "No transcript yet"
                : "Waiting for first segment…"}
            </Text>
          )}
        </ScrollView>
      </Card>

      <EmptyState
        title={`${segments.length} segment${segments.length === 1 ? "" : "s"}`}
        body={completed ? "Lecture finished." : isLive ? "Captions update automatically." : "Live captions will appear when the lecture starts."}
      />
    </Screen>
  );
}
