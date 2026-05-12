import React, { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { router } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, signOutUser } from "../../firebase";
import { useChildren } from "../../context/ChildContext";
import {
  Button, Card, EmptyState, Header, Screen, colors, styles,
} from "../../components/parent/ui";

export default function ParentProfile() {
  const { children: kids, loading } = useChildren();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) { setProfile(null); return; }
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        setProfile(snap.exists() ? snap.data() : null);
      } catch {
        setProfile(null);
      }
    });
    return unsub;
  }, []);

  const handleLogout = async () => {
    try {
      await signOutUser();
      router.replace("/(auth)/login");
    } catch (e) {
      Alert.alert("Sign out failed", e.message);
    }
  };

  return (
    <Screen>
      <Header title="Profile" subtitle="Your account and linked children" />

      <Card>
        <Text style={styles.emptyTitle}>Signed in</Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>
          {user?.email || "—"}
        </Text>
        <Text style={{ color: colors.faint, fontSize: 12, marginTop: 4 }}>
          Role: parent
        </Text>
      </Card>

      <Header title={`Linked children (${kids.length})`} />
      {kids.map((c) => (
        <Card key={c.id}>
          <Text style={styles.emptyTitle}>{c.name || c.id}</Text>
          {c.email ? <Text style={{ color: colors.muted, marginTop: 4, fontSize: 12 }}>{c.email}</Text> : null}
          {c.class_id ? <Text style={{ color: colors.faint, fontSize: 11, marginTop: 4 }}>Class: {c.class_id}</Text> : null}
        </Card>
      ))}

      {!loading && kids.length === 0 ? (
        <EmptyState
          title="No children linked"
          body="Ask the admin to link your account to your child's record."
        />
      ) : null}

      <View style={{ marginTop: 12 }}>
        <Button title="Sign out" onPress={handleLogout} variant="danger" />
      </View>
    </Screen>
  );
}
