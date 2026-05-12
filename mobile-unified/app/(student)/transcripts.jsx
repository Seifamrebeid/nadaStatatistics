import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../firebase";
import {
  Button, Card, EmptyState, Header, Pill, Screen, colors, styles,
} from "../../components/student/ui";

function fmtDate(value) {
  if (!value) return "";
  const d = value?.toDate ? value.toDate() : new Date(value);
  return isNaN(d) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function StudentTranscripts() {
  const [studentId, setStudentId] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) setStudentId(snap.data().linked_id || null);
      } catch { /* ignore */ }
    });
    return unsub;
  }, []);

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true); setErr(null);
    try {
      const snap = await getDocs(
        query(collection(db, "lectures"), where("enrolled_student_ids", "array-contains", studentId))
      );
      const lectures = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      lectures.sort((a, b) => {
        const ta = a.scheduled_at?.toMillis?.() ?? 0;
        const tb = b.scheduled_at?.toMillis?.() ?? 0;
        return tb - ta;
      });
      setRows(lectures);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const withT = rows.filter((l) => l.transcript_id);
  const withoutT = rows.filter((l) => !l.transcript_id);

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header
        title="Transcripts"
        subtitle="Live and completed lecture transcripts."
      />

      {err ? (
        <Card style={{ borderColor: colors.danger, backgroundColor: "#fef2f2" }}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Error</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{err}</Text>
        </Card>
      ) : null}

      {withT.length > 0 ? (
        <>
          <Header title="Available transcripts" subtitle={`${withT.length} lecture${withT.length === 1 ? "" : "s"}`} />
          {withT.map((lec) => {
            const live = lec.status === "recording";
            return (
              <Card key={lec.id}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.emptyTitle} numberOfLines={2}>{lec.title || lec.id}</Text>
                    {lec.scheduled_at ? (
                      <Text style={{ color: colors.faint, fontSize: 12, marginTop: 4 }}>{fmtDate(lec.scheduled_at)}</Text>
                    ) : null}
                  </View>
                  <Pill
                    text={live ? "LIVE" : lec.status || "scheduled"}
                    tone={live ? "danger" : lec.status === "finished" ? "success" : "info"}
                  />
                </View>
                <Button
                  title={live ? "Watch live" : "View transcript"}
                  onPress={() => router.push({ pathname: "/(student)/live", params: { lectureId: lec.id } })}
                />
              </Card>
            );
          })}
        </>
      ) : null}

      {withoutT.length > 0 ? (
        <>
          <Header title="No transcript yet" />
          {withoutT.map((lec) => (
            <Card key={lec.id} style={{ opacity: 0.55 }}>
              <Text style={styles.emptyTitle} numberOfLines={2}>{lec.title || lec.id}</Text>
              <Text style={{ color: colors.faint, fontSize: 12, marginTop: 4 }}>
                {lec.scheduled_at ? fmtDate(lec.scheduled_at) : ""} • {lec.status || "scheduled"}
              </Text>
            </Card>
          ))}
        </>
      ) : null}

      {!loading && rows.length === 0 ? (
        <EmptyState
          title="No enrolled lectures"
          body="Your lectures will appear here once you're enrolled in a class."
        />
      ) : null}
    </Screen>
  );
}
