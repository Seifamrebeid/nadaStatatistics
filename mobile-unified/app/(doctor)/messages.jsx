import React, { useCallback, useMemo, useState } from "react";
import { Alert, RefreshControl, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import { Button, Card, EmptyState, Header, Input, Screen, colors, styles } from "../../components/doctor/ui";

export default function DoctorMessagesScreen() {
  const [lectures, setLectures] = useState([]);
  const [students, setStudents] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [doctorId, setDoctorId] = useState(null);
  const [form, setForm] = useState({
    lecture_id: "",
    student_ids: "",
    subject: "",
    body: "",
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) { setLoading(false); return; }

      const userSnap = await getDoc(doc(db, "users", user.uid));
      const linkedId = userSnap.exists() ? userSnap.data().linked_id : null;
      setDoctorId(linkedId);

      // Fetch lectures
      let lectureRows = [];
      if (linkedId) {
        const lecSnap = await getDocs(
          query(collection(db, "lectures"), where("doctor_id", "==", linkedId))
        );
        lectureRows = lecSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
      setLectures(lectureRows);

      // Fetch students
      const studentSnap = await getDocs(
        query(collection(db, "students"), where("active", "==", true))
      );
      setStudents(studentSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      // Fetch notification history for this doctor
      let historyRows = [];
      if (linkedId) {
        try {
          const histSnap = await getDocs(
            query(collection(db, "notifications"), where("sender_doctor_id", "==", linkedId))
          );
          historyRows = histSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch {
          historyRows = [];
        }
      }
      setHistory(historyRows);
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
    () => lectures.find((lecture) => String(lecture.id) === String(form.lecture_id)),
    [lectures, form.lecture_id],
  );

  const send = async () => {
    if (!form.lecture_id || !form.subject || !form.body) {
      Alert.alert("Missing fields", "Choose a lecture, subject, and message.");
      return;
    }
    setSending(true);
    try {
      const idList = form.student_ids
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

      // Resolve recipient emails from students list (if IDs provided) or use enrolled IDs
      const targetIds = idList.length > 0 ? idList : (selectedLecture?.enrolled_student_ids || []);
      const recipientStudents = students.filter((s) => targetIds.includes(s.id));
      const recipientEmails = recipientStudents.map((s) => s.email).filter(Boolean);

      await addDoc(collection(db, "notifications"), {
        sender_doctor_id: doctorId,
        lecture_id: form.lecture_id,
        recipient_student_ids: targetIds,
        recipient_emails: recipientEmails,
        subject: form.subject,
        body: form.body,
        sent_at: serverTimestamp(),
        status: "sent",
      });

      setForm({ ...form, subject: "", body: "", student_ids: "" });
      await load();
      Alert.alert("Sent", "Message saved to notifications.");
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
          placeholder={lectures[0] ? String(lectures[0].id) : "lecture id"}
        />
        {selectedLecture ? (
          <Text style={{ color: colors.primary, marginBottom: 10 }}>
            {selectedLecture.title || "Selected lecture"}
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
        <Card key={lecture.id}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>
            {lecture.id}
          </Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>
            {lecture.title || "Lecture"}
          </Text>
        </Card>
      ))}
      {!lectures.length ? <EmptyState title="No lectures" body="Create a lecture before sending messages." /> : null}

      <Header title="Sent History" subtitle={`${history.length} records`} />
      {history.length ? (
        history.slice(0, 12).map((item, index) => (
          <Card key={item.id || index}>
            <Text style={styles.emptyTitle}>{item.subject || "Message"}</Text>
            <Text style={{ color: colors.muted, marginTop: 5 }}>
              {item.sent_at
                ? String(item.sent_at.toDate ? item.sent_at.toDate().toISOString() : item.sent_at)
                : "No date"}{" "}
              | {item.status || "sent"}
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
