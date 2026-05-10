import React, { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { router } from "expo-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../../firebase";
import {
  Button, Card, Header, Screen, colors,
} from "../../components/ui";

export default function AdminProfile() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return unsub;
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
      router.replace("/(auth)/login");
    } catch (e) {
      Alert.alert("Sign out failed", e.message);
    }
  };

  return (
    <Screen>
      <Header title="Profile" subtitle="Admin account" />

      <Card>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>Account</Text>
        <Row label="Email" value={user?.email || "—"} />
        <Row label="UID" value={user?.uid || "—"} mono />
        <Row label="Role" value="admin" />
      </Card>

      <Header title="Management" />
      <View style={{ gap: 8 }}>
        <Button title="Admins" onPress={() => router.push("/(app)/admins")} variant="secondary" />
        <Button title="Parents" onPress={() => router.push("/(app)/parents")} variant="secondary" />
        <Button title="Subjects" onPress={() => router.push("/(app)/subjects")} variant="secondary" />
        <Button title="Classes" onPress={() => router.push("/(app)/classes")} variant="secondary" />
        <Button title="Weeks" onPress={() => router.push("/(app)/weeks")} variant="secondary" />
      </View>

      <Header title="Reports" />
      <View style={{ gap: 8 }}>
        <Button title="Attendance" onPress={() => router.push("/(app)/attendance")} variant="secondary" />
        <Button title="Analytics" onPress={() => router.push("/(app)/analytics")} variant="secondary" />
        <Button title="Grades" onPress={() => router.push("/(app)/grades")} variant="secondary" />
        <Button title="Student search" onPress={() => router.push("/(app)/student-search")} variant="secondary" />
      </View>

      <Header title="System" />
      <View style={{ gap: 8 }}>
        <Button title="Settings" onPress={() => router.push("/(app)/settings")} variant="secondary" />
      </View>

      <Button title="Sign out" onPress={logout} variant="danger" />
    </Screen>
  );
}

function Row({ label, value, mono = false }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>{label}</Text>
      <Text
        style={{
          color: colors.ink, fontSize: 12, fontWeight: "600",
          fontFamily: mono ? "monospace" : undefined,
          maxWidth: "60%", textAlign: "right",
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
