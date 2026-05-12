import React, { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { router } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { getDoc, doc, updateDoc } from "firebase/firestore";
import { auth, db, signOutUser } from "../../firebase";
import { Button, Card, Header, Input, Screen, colors, styles } from "../../components/student/ui";

export default function ProfileScreen() {
  const [user, setUser] = useState(auth.currentUser);
  const [studentId, setStudentId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) return;
      try {
        const userSnap = await getDoc(doc(db, "users", firebaseUser.uid));
        if (!userSnap.exists()) return;
        const linked = userSnap.data().linked_id;
        setStudentId(linked || null);
        if (linked) {
          const studentSnap = await getDoc(doc(db, "students", linked));
          if (studentSnap.exists()) {
            const data = studentSnap.data();
            setProfile(data);
            setEditName(data.name || "");
          }
        }
      } catch {
        // silently ignore
      }
    });
    return unsubscribe;
  }, []);

  const saveName = async () => {
    if (!studentId || !editName.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "students", studentId), { name: editName.trim() });
      setProfile((prev) => ({ ...prev, name: editName.trim() }));
      Alert.alert("Saved", "Your name has been updated.");
    } catch (error) {
      Alert.alert("Save failed", error.message);
    } finally {
      setSaving(false);
    }
  };

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
      <Header title="Profile" subtitle="Student account and portal session" />
      <Card>
        <Text style={styles.emptyTitle}>{user?.email || "Signed-in student"}</Text>
        <Text style={{ color: colors.muted, marginTop: 8 }}>UID: {user?.uid || "unknown"}</Text>
      </Card>
      {profile ? (
        <Card>
          <Text style={styles.emptyTitle}>Student Details</Text>
          <Text style={{ color: colors.muted, marginTop: 8 }}>Name: {profile.name || "—"}</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>Email: {profile.email || "—"}</Text>
          <Input
            label="Update name"
            value={editName}
            onChangeText={setEditName}
            editable={!saving}
            style={{ marginTop: 12 }}
          />
          <Button
            title={saving ? "Saving..." : "Save name"}
            onPress={saveName}
            disabled={saving}
            variant="secondary"
          />
        </Card>
      ) : (
        <Card>
          <Text style={{ color: colors.muted }}>Student profile not loaded yet.</Text>
        </Card>
      )}
      <Header title="More" />
      <View style={{ gap: 8 }}>
        <Button title="Attendance" onPress={() => router.push("/(student)/attendance")} variant="secondary" />
        <Button title="Engagement" onPress={() => router.push("/(student)/engagement")} variant="secondary" />
        <Button title="History" onPress={() => router.push("/(student)/history")} variant="secondary" />
        <Button title="Doctor search" onPress={() => router.push("/(student)/doctor-search")} variant="secondary" />
        <Button title="My classes" onPress={() => router.push("/(student)/hierarchy")} variant="secondary" />
      </View>

      <Button title="Sign out" onPress={logout} variant="danger" />
    </Screen>
  );
}
