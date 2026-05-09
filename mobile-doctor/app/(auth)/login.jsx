import React, { useState } from "react";
import { Alert, Text, View } from "react-native";
import { router } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getDoc, doc } from "firebase/firestore";
import { auth, db, signOutUser } from "../../firebase";
import { Button, Card, Header, Input, Screen, colors } from "../../components/ui";

async function assertDoctor(user) {
  const snap = await getDoc(doc(db, "users", user.uid));
  const data = snap.exists() ? snap.data() : null;
  if (data?.role && data.role !== "doctor") {
    await signOutUser();
    throw new Error("This account belongs to another portal.");
  }
}

const QUICK = { email: "mona.saeeed@nada.edu", password: "Doctor@123" };

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePasswordLogin = async () => {
    if (!email || !password) {
      Alert.alert("Missing details", "Enter your email and password.");
      return;
    }

    setLoading(true);
    try {
      const credentials = await signInWithEmailAndPassword(auth, email, password);
      await assertDoctor(credentials.user);
      router.replace("/(app)");
    } catch (error) {
      Alert.alert("Login failed", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={{ minHeight: 620, justifyContent: "center" }}>
        <Header
          title="Doctor Portal"
          subtitle="Monitor lectures, analytics, and student messages."
        />
        <Card>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!loading}
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />
          <Button
            title="Quick fill"
            onPress={() => { setEmail(QUICK.email); setPassword(QUICK.password); }}
            variant="ghost"
          />
          <Button
            title={loading ? "Signing in..." : "Sign in"}
            onPress={handlePasswordLogin}
            disabled={loading}
          />
        </Card>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
          Use a doctor account. Admin and student accounts are signed out from this app.
        </Text>
      </View>
    </Screen>
  );
}
