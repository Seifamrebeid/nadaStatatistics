import React, { useCallback, useMemo, useState } from "react";
import { Alert, RefreshControl, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { getLectures, getNotifications, getStudents, normalize, sendNotification } from "../../api";
import { Button, Card, EmptyState, Header, Input, Screen, colors, styles } from "../../components/ui";

export default function DoctorMessagesScreen() {
  const [lectures, setLectures] = useState([]);
  const [students, setStudents] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    lecture_id: "",
    student_ids: "",
    subject: "",
    body: "",
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [lectureRows, studentRows, historyRows] = await Promise.all([
        getLectures(),
        getStudents().catch(() => []),
        getNotifications().catch(() => []),
      ]);
      setLectures(lectureRows.map(normalize));
      setStudents(studentRows.map(normalize));
      setHistory(historyRows.map(normalize));
    } catch (error) {
      Alert.alert("Messages error", error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const selectedLecture = useMemo(
    () => lectures.find((lecture) => String(lecture.id || lecture.lecture_id) === String(form.lecture_id)),
    [lectures, form.lecture_id],
  );

  const send = async () => {
    if (!form.lecture_id || !form.subject || !form.body) {
      Alert.alert("Missing fields", "Choose a lecture, subject, and message.");
      return;
    }
    setSending(true);
    try {
      const payload = {
        lecture_id: form.lecture_id,
        subject: form.subject,
        body: form.body,
      };
      const ids = form.student_ids
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      if (ids.length) payload.student_ids = ids;
      await sendNotification(payload);
      setForm({ ...form, subject: "", body: "", student_ids: "" });
      await load();
      Alert.alert("Sent", "Message submitted to the backend.");
    } catch (error) {
      Alert.alert("Send failed", error.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header title="Messages" subtitle="Email students in your lectures" />

      <Card>
        <Text style={styles.emptyTitle}>Compose</Text>
        <Input
          label="Lecture ID"
          value={form.lecture_id}
          onChangeText={(lecture_id) => setForm({ ...form, lecture_id })}
          placeholder={lectures[0] ? String(lectures[0].id || lectures[0].lecture_id) : "lecture id"}
        />
        {selectedLecture ? (
          <Text style={{ color: colors.primary, marginBottom: 10 }}>
            {selectedLecture.title || selectedLecture.subject_name || "Selected lecture"}
          </Text>
        ) : null}
        <Input
          label="Student IDs"
          value={form.student_ids}
          onChangeText={(student_ids) => setForm({ ...form, student_ids })}
          placeholder="Leave blank for all enrolled, or comma-separated IDs"
        />
        <Input
          label="Subject"
          value={form.subject}
          onChangeText={(subject) => setForm({ ...form, subject })}
        />
        <Input
          label="Body"
          value={form.body}
          onChangeText={(body) => setForm({ ...form, body })}
          multiline
        />
        <Button title={sending ? "Sending..." : "Send email"} onPress={send} disabled={sending} />
      </Card>

      <Header title="Available Lectures" subtitle={`${lectures.length} lecture records`} />
      {lectures.slice(0, 5).map((lecture) => (
        <Card key={lecture.id || lecture.lecture_id}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>
            {lecture.id || lecture.lecture_id}
          </Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>
            {lecture.title || lecture.subject_name || "Lecture"}
          </Text>
        </Card>
      ))}
      {!lectures.length ? <EmptyState title="No lectures" body="Create a lecture before sending messages." /> : null}

      <Header title="Sent History" subtitle={`${history.length} records`} />
      {history.length ? (
        history.slice(0, 12).map((item, index) => (
          <Card key={item.id || `${item.created_at}-${index}`}>
            <Text style={styles.emptyTitle}>{item.subject || "Message"}</Text>
            <Text style={{ color: colors.muted, marginTop: 5 }}>
              {item.created_at || item.sent_at || "No date"} | {item.status || "submitted"}
            </Text>
          </Card>
        ))
      ) : (
        <EmptyState title="No sent messages" body="Sent email audit entries will appear here." />
      )}

      <Text style={{ color: colors.muted, fontSize: 12 }}>
        Student lookup loaded {students.length} records for ID reference.
      </Text>
    </Screen>
  );
}
