import React, { useCallback, useEffect, useState } from "react";
import { Alert, RefreshControl, Text, View } from "react-native";
import { router } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import {
  Button, Card, Header, Pill, Screen, colors, styles,
} from "../../components/admin/ui";

export default function AdminSettings() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [healthy, setHealthy] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  const pingDb = useCallback(async () => {
    setLoading(true); setHealthy(null);
    try {
      await getDoc(doc(db, "_health", "ping"));
      setHealthy(true);
    } catch {
      setHealthy(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { pingDb(); }, [pingDb]);

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={pingDb} />}>
      <Header title="Settings" subtitle="System information" action={<Button title="Back" onPress={() => router.back()} variant="ghost" />} />

      <Card>
        <Text style={styles.emptyTitle}>Account</Text>
        <Row label="Email" value={user?.email || "—"} />
        <Row label="UID" value={user?.uid || "—"} mono />
        <Row label="Role" value="admin" />
      </Card>

      <Card>
        <Text style={styles.emptyTitle}>Firebase</Text>
        <Row label="Project" value="fridgechef-jt50c" mono />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 13 }}>Connection</Text>
          {healthy == null ? <Pill text="checking" tone="info" /> : healthy ? <Pill text="ok" tone="success" /> : <Pill text="error" tone="danger" />}
        </View>
        <Button title="Re-check" onPress={pingDb} variant="secondary" />
      </Card>

      <Card>
        <Text style={styles.emptyTitle}>Companion apps</Text>
        <Row label="Student app port" value="19006" mono />
        <Row label="Doctor app port" value="19007" mono />
        <Row label="Admin app port" value="(this)" />
        <Row label="Parent app port" value="19009" mono />
      </Card>

      <Card>
        <Text style={styles.emptyTitle}>Capture app</Text>
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 6 }}>
          Tune Whisper / Deepgram model, language, and audio settings in
          {" "}<Text style={{ fontFamily: "monospace" }}>classroom-app-python/.env</Text> on the
          classroom PC.
        </Text>
      </Card>
    </Screen>
  );
}

function Row({ label, value, mono = false }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 12, fontWeight: "600", fontFamily: mono ? "monospace" : undefined, maxWidth: "60%", textAlign: "right" }} numberOfLines={1}>{value}</Text>
    </View>
  );
}
