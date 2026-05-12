import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs, getDoc, doc, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../firebase";
import {
  Button, Card, EmptyState, Header, Pill, Screen, Stat, colors, styles,
} from "../../components/student/ui";

export default function StudentHomeScreen() {
  const [loading, setLoading] = useState(true);
  const [lectures, setLectures] = useState([]);
  const [myAvg, setMyAvg] = useState(0);
  const [studentId, setStudentId] = useState(null);

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
    try {
      setLoading(true);
      const lecSnap = await getDocs(
        query(collection(db, "lectures"), where("enrolled_student_ids", "array-contains", studentId))
      );
      setLectures(lecSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const emSnap = await getDocs(
        query(collection(db, "emotions"), where("student_id", "==", studentId))
      );
      const my = emSnap.docs.map((d) => d.data());
      const avg = my.length > 0
        ? my.reduce((s, e) => s + (e.engagement_score || 0), 0) / my.length
        : 0;
      setMyAvg(avg);
    } catch (e) {
      Alert.alert("Dashboard error", e.message);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const live = lectures.filter((l) => l.status === "recording");

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header title="Home" subtitle="Your classroom snapshot" />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat label="Enrolled" value={lectures.length} />
        <Stat label="Live now" value={live.length} tone={live.length ? "danger" : "primary"} />
        <Stat label="Engagement" value={`${myAvg.toFixed(1)}%`} tone="success" />
      </View>

      {/* Quick-access grid for hidden routes */}
      <Header title="Quick links" />
      <View style={local.grid}>
        <QuickLink icon="calendar" label="Attendance" tone="info" to="/(student)/attendance" />
        <QuickLink icon="analytics" label="Engagement" tone="success" to="/(student)/engagement" />
        <QuickLink icon="search" label="Find doctor" tone="warning" to="/(student)/doctor-search" />
        <QuickLink icon="git-network" label="My classes" tone="slate" to="/(student)/hierarchy" />
        <QuickLink icon="time" label="History" tone="brand" to="/(student)/history" />
      </View>

      <Header
        title="Recent lectures"
        subtitle={`${live.length} recording`}
        action={<Button title="All" onPress={() => router.push("/(student)/lectures")} variant="secondary" />}
      />
      {lectures.slice(0, 6).map((lec) => (
        <Card key={lec.id}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.emptyTitle} numberOfLines={2}>{lec.title || lec.id}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
                {[lec.doctor_id, lec.date].filter(Boolean).join(" • ")}
              </Text>
            </View>
            <Pill
              text={lec.status === "recording" ? "LIVE" : lec.status || "scheduled"}
              tone={lec.status === "recording" ? "danger" : lec.status === "finished" ? "success" : "info"}
            />
          </View>
        </Card>
      ))}

      {!loading && lectures.length === 0 ? (
        <EmptyState
          title="No enrolled lectures"
          body="Your lectures will appear here after enrollment."
        />
      ) : null}
    </Screen>
  );
}

function QuickLink({ icon, label, tone = "slate", to }) {
  const tones = {
    info:    "#3b82f6",
    success: "#10b981",
    warning: "#f59e0b",
    danger:  "#ef4444",
    slate:   "#64748b",
    brand:   "#0ea5e9",
  };
  return (
    <Pressable
      onPress={() => router.push(to)}
      style={({ pressed }) => [local.tile, pressed && { opacity: 0.85 }]}
    >
      <View style={[local.iconWrap, { backgroundColor: `${tones[tone]}1a` }]}>
        <Ionicons name={icon} size={20} color={tones[tone]} />
      </View>
      <Text style={local.tileLabel}>{label}</Text>
    </Pressable>
  );
}

const local = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tile: {
    flexBasis: "31%",
    flexGrow: 0,
    backgroundColor: "#ffffff",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: "center",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  iconWrap: {
    height: 36,
    width: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  tileLabel: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
});
