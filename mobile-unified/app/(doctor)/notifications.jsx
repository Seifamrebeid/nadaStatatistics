/**
 * Doctor notifications — send a message to enrolled students of a lecture, plus
 * a history list. Mirrors web-doctor DoctorNotifications.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, where,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import {
  Button, Card, EmptyState, Header, Input, Pill, Screen, colors, styles,
} from "../../components/doctor/ui";

function fmtTs(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return isNaN(d) ? "—" : d.toLocaleString();
}

export default function DoctorNotifications() {
  const [doctorId, setDoctorId] = useState(null);
  const [lectures, setLectures] = useState([]);
  const [students, setStudents] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState(null);

  // form
  const [lectureId, setLectureId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) setDoctorId(snap.data().linked_id || null);
      } catch { /* ignore */ }
    });
    return unsub;
  }, []);

  const load = useCallback(async () => {
    if (!doctorId) return;
    setLoading(true); setErr(null);
    try {
      const [lecSnap, studSnap, notifSnap] = await Promise.all([
        getDocs(query(collection(db, "lectures"), where("doctor_id", "==", doctorId))),
        getDocs(collection(db, "students")),
        getDocs(query(collection(db, "notifications"), where("sender_doctor_id", "==", doctorId))),
      ]);
      setLectures(lecSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setStudents(studSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      const rows = notifSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => {
        const ta = a.sent_at?.toMillis?.() ?? 0;
        const tb = b.sent_at?.toMillis?.() ?? 0;
        return tb - ta;
      });
      setHistory(rows);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => { load(); }, [load]);

  const recipients = useMemo(() => {
    if (!lectureId) return [];
    const lec = lectures.find((l) => l.id === lectureId);
    if (!lec) return [];
    const ids = new Set(lec.enrolled_student_ids || []);
    return students.filter((s) => ids.has(s.id));
  }, [lectureId, lectures, students]);

  async function send() {
    if (!lectureId) { Alert.alert("Pick a lecture", "Select the lecture this message is for."); return; }
    if (!subject.trim() || !body.trim()) { Alert.alert("Missing fields", "Subject and body are required."); return; }
    setSending(true);
    try {
      await addDoc(collection(db, "notifications"), {
        sender_doctor_id: doctorId,
        lecture_id: lectureId,
        recipient_student_ids: recipients.map((r) => r.id),
        recipient_emails: recipients.map((r) => r.email).filter(Boolean),
        subject: subject.trim(),
        body: body.trim(),
        status: "sent",
        sent_at: serverTimestamp(),
      });
      Alert.alert("Sent", `Notification sent to ${recipients.length} student${recipients.length === 1 ? "" : "s"}.`);
      setSubject(""); setBody(""); setLectureId("");
      load();
    } catch (e) {
      Alert.alert("Send failed", e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header
        title="Notifications"
        subtitle="Send a message to lecture attendees"
        action={<Button title="Back" onPress={() => router.back()} variant="ghost" />}
      />

      {err ? (
        <Card style={{ borderColor: colors.danger, backgroundColor: "#fef2f2" }}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Error</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{err}</Text>
        </Card>
      ) : null}

      <Card>
        <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 }}>LECTURE</Text>
        <View style={local.row}>
          {lectures.map((l) => (
            <Pressable
              key={l.id}
              onPress={() => setLectureId(l.id)}
              style={[local.chip, lectureId === l.id && local.chipActive]}
            >
              <Text style={[local.chipText, lectureId === l.id && local.chipTextActive]} numberOfLines={1}>
                {l.title || l.id}
              </Text>
            </Pressable>
          ))}
        </View>
        {lectureId ? (
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>
            {recipients.length} recipient{recipients.length === 1 ? "" : "s"}
          </Text>
        ) : null}

        <Input label="Subject" value={subject} onChangeText={setSubject} editable={!sending} />
        <Input label="Body" value={body} onChangeText={setBody} multiline editable={!sending} />
        <Button title={sending ? "Sending…" : "Send notification"} onPress={send} disabled={sending || !lectureId} busy={sending} />
      </Card>

      <Header title="History" subtitle={`${history.length} notification${history.length === 1 ? "" : "s"}`} />
      {history.map((n) => (
        <Card key={n.id}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.emptyTitle} numberOfLines={1}>{n.subject || "(no subject)"}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }} numberOfLines={2}>{n.body}</Text>
              <Text style={{ color: colors.faint, fontSize: 11, marginTop: 6 }}>
                {fmtTs(n.sent_at)} • {n.recipient_student_ids?.length || 0} sent
              </Text>
            </View>
            <Pill text={n.status || "sent"} tone={n.status === "failed" ? "danger" : "success"} />
          </View>
        </Card>
      ))}

      {!loading && history.length === 0 ? (
        <EmptyState
          title="No notifications yet"
          body="Send your first notification using the form above."
        />
      ) : null}
    </Screen>
  );
}

const local = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
    marginBottom: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    maxWidth: 200,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#ffffff",
  },
});
