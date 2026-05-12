import React, { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { router } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { getDoc, doc } from "firebase/firestore";
import { auth, db, signOutUser } from "../../firebase";
import { Button, Card, Header, Screen, colors, styles } from "../../components/doctor/ui";

export default function ProfileScreen() {
  const [user, setUser] = useState(auth.currentUser);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(db, "users", firebaseUser.uid));
          setProfile(snap.exists() ? snap.data() : null);
        } catch {
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
    });
    return unsubscribe;
  }, []);

  const logout = async () => {
    try {
      await signOutUser();
      router.replace("/(auth)/login");
    } catch (error) {
      Alert.alert("Logout failed", error.message);
    }
  };

  return (
    <Screen>
      <Header title="Profile" subtitle="Doctor account and portal session" />
      <Card>
        <Text style={styles.emptyTitle}>{user?.email || "Signed-in doctor"}</Text>
        <Text style={{ color: colors.muted, marginTop: 8 }}>UID: {user?.uid || "unknown"}</Text>
      </Card>
      {profile ? (
        <Card>
          <Text style={styles.emptyTitle}>Account Details</Text>
          <Text style={{ color: colors.muted, marginTop: 8 }}>Role: {profile.role || "doctor"}</Text>
          {profile.linked_id ? (
            <Text style={{ color: colors.muted, marginTop: 4 }}>Doctor ID: {profile.linked_id}</Text>
          ) : null}
        </Card>
      ) : null}
      <Header title="Management" />
      <View style={{ gap: 8 }}>
        <Button title="Attendance" onPress={() => router.push("/(doctor)/attendance")} variant="secondary" />
        <Button title="Notifications" onPress={() => router.push("/(doctor)/notifications")} variant="secondary" />
        <Button title="Subjects" onPress={() => router.push("/(doctor)/subjects")} variant="secondary" />
        <Button title="Classes" onPress={() => router.push("/(doctor)/classes")} variant="secondary" />
        <Button title="Weeks" onPress={() => router.push("/(doctor)/weeks")} variant="secondary" />
        <Button title="Hierarchy" onPress={() => router.push("/(doctor)/hierarchy")} variant="secondary" />
        <Button title="Student search" onPress={() => router.push("/(doctor)/student-search")} variant="secondary" />
        <Button title="Analytics" onPress={() => router.push("/(doctor)/analytics")} variant="secondary" />
        <Button title="Messages" onPress={() => router.push("/(doctor)/messages")} variant="secondary" />
      </View>

      <Button title="Sign out" onPress={logout} variant="danger" />
    </Screen>
  );
}
