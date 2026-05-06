import React, { useEffect, useState } from "react";
import { Alert, Text } from "react-native";
import { router } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { getMe } from "../../api";
import { auth, signOutUser } from "../../firebase";
import { Button, Card, Header, Screen, colors, styles } from "../../components/ui";

export default function ProfileScreen() {
  const [user, setUser] = useState(auth.currentUser);
  const [me, setMe] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    getMe().then((data) => setMe(data)).catch(() => setMe(null));
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
      <Header title="Profile" subtitle="Student account and portal session" />
      <Card>
        <Text style={styles.emptyTitle}>{user?.email || "Signed-in student"}</Text>
        <Text style={{ color: colors.muted, marginTop: 8 }}>UID: {user?.uid || "unknown"}</Text>
      </Card>
      <Card>
        <Text style={styles.emptyTitle}>Backend Identity</Text>
        <Text style={{ color: colors.muted, marginTop: 8 }}>
          {me ? JSON.stringify(me, null, 2) : "Identity endpoint is not available yet."}
        </Text>
      </Card>
      <Button title="Sign out" onPress={logout} variant="danger" />
    </Screen>
  );
}
