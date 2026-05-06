import React, { useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, signOutUser } from "../../firebase";
import { APP_ROLE, faceLogin } from "../../api";
import { Button, Card, Header, Input, Screen, colors } from "../../components/ui";

async function assertDoctor(user) {
  const token = await user.getIdTokenResult(true);
  const role = token.claims?.role;
  if (role && role !== APP_ROLE) {
    await signOutUser();
    throw new Error("This account belongs to another portal.");
  }
}

export default function LoginScreen() {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState("password");
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

  const openFaceMode = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert("Camera needed", "Face sign-in needs camera permission.");
        return;
      }
    }
    setMode("face");
  };

  const handleFaceLogin = async () => {
    if (!cameraRef.current) return;
    setLoading(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.92,
        skipProcessing: false,
      });
      await faceLogin(photo);
      await assertDoctor(auth.currentUser);
      router.replace("/(app)");
    } catch (error) {
      Alert.alert("Face sign-in failed", error.message);
    } finally {
      setLoading(false);
    }
  };

  if (mode === "face") {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000" }}>
        <CameraView ref={cameraRef} facing="front" style={{ flex: 1 }} />
        <View style={{ padding: 16, backgroundColor: "#000000" }}>
          <Button
            title={loading ? "Checking face..." : "Sign in with face"}
            onPress={handleFaceLogin}
            disabled={loading}
          />
          <View style={{ height: 10 }} />
          <Button title="Use password instead" onPress={() => setMode("password")} variant="secondary" />
        </View>
      </View>
    );
  }

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
            title={loading ? "Signing in..." : "Sign in"}
            onPress={handlePasswordLogin}
            disabled={loading}
          />
          <View style={{ height: 10 }} />
          <Button title="Sign in with face" onPress={openFaceMode} variant="secondary" />
        </Card>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
          Use a doctor account. Admin and student accounts are signed out from this app.
        </Text>
      </View>
    </Screen>
  );
}
