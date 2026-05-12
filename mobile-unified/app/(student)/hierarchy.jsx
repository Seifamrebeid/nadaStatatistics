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

export default function StudentHierarchy() {
  const [studentId, setStudentId] = useState(null);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [lectures, setLectures] = useState([]);
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
      const [clsSnap, lecSnap] = await Promise.all([
        getDocs(query(collection(db, "classes"), where("enrolled_student_ids", "array-contains", studentId))),
        getDocs(query(collection(db, "lectures"), where("enrolled_student_ids", "array-contains", studentId))),
      ]);
      const myClasses = clsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const myLectures = lecSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Load only the subjects we need.
      const subjectIds = [...new Set(myClasses.map((c) => c.subject_id).filter(Boolean))];
      const subjectMap = {};
      await Promise.all(subjectIds.map(async (sid) => {
        try {
          const s = await getDoc(doc(db, "subjects", sid));
          subjectMap[sid] = s.exists() ? (s.data().name || sid) : sid;
        } catch { subjectMap[sid] = sid; }
      }));

      myClasses.sort((a, b) => (subjectMap[a.subject_id] || "").localeCompare(subjectMap[b.subject_id] || ""));
      myLectures.sort((a, b) => {
        const ta = a.scheduled_at?.toMillis?.() ?? 0;
        const tb = b.scheduled_at?.toMillis?.() ?? 0;
        return tb - ta;
      });

      setClasses(myClasses.map((c) => ({ ...c, subject_name: subjectMap[c.subject_id] || c.subject_id })));
      setSubjects(subjectIds.map((sid) => ({ id: sid, name: subjectMap[sid] || sid })));
      setLectures(myLectures);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header
        title="My classes"
        subtitle="Subjects → classes → recent lectures"
        action={<Button title="Back" onPress={() => router.back()} variant="ghost" />}
      />

      {err ? (
        <Card style={{ borderColor: colors.danger, backgroundColor: "#fef2f2" }}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Error</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{err}</Text>
        </Card>
      ) : null}

      {subjects.map((subj) => {
        const subjClasses = classes.filter((c) => c.subject_id === subj.id);
        const subjLectures = lectures.filter((l) =>
          subjClasses.some((c) => c.id === l.class_id)
        );
        return (
          <Card key={subj.id}>
            <Text style={styles.emptyTitle}>{subj.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
              {subjClasses.length} class{subjClasses.length === 1 ? "" : "es"} • {subjLectures.length} lecture{subjLectures.length === 1 ? "" : "s"}
            </Text>

            {subjClasses.map((c) => (
              <View key={c.id} style={{ marginTop: 10, paddingTop: 10, borderTopColor: colors.border, borderTopWidth: 1 }}>
                <Text style={{ color: colors.ink, fontWeight: "700", fontSize: 13 }}>
                  {c.name || c.id} {c.section ? `· Section ${c.section}` : ""}
                </Text>
              </View>
            ))}

            {subjLectures.slice(0, 3).map((lec) => {
              const live = lec.status === "recording";
              return (
                <View
                  key={lec.id}
                  style={{ marginTop: 10, paddingTop: 8, borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.ink, fontWeight: "600", fontSize: 13 }} numberOfLines={1}>
                      {lec.title || lec.id}
                    </Text>
                    {lec.scheduled_at ? (
                      <Text style={{ color: colors.faint, fontSize: 11, marginTop: 2 }}>{fmtDate(lec.scheduled_at)}</Text>
                    ) : null}
                  </View>
                  <Pill text={live ? "LIVE" : lec.status || "scheduled"} tone={live ? "danger" : lec.status === "finished" ? "success" : "info"} />
                </View>
              );
            })}
          </Card>
        );
      })}

      {!loading && subjects.length === 0 ? (
        <EmptyState
          title="No classes yet"
          body="Once your admin enrolls you in classes, the hierarchy will show up here."
        />
      ) : null}
    </Screen>
  );
}
