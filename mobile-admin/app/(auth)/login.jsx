import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebase";
import Screen from "../../components/Screen";
import Button from "../../components/Button";
import { colors, radii, spacing, shadow } from "../../components/theme";

const QUICK = { email: "admin@classroom.local", password: "admin-password-change-me" };

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Missing info", "Please enter email and password.");
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace("/(app)");
    } catch (error) {
      Alert.alert("Login failed", error.message.replace(/^Firebase:\s*/, ""));
      setLoading(false);
    }
  };

  return (
    <Screen edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <View style={styles.container}>
          <View style={styles.brandWrap}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>N</Text>
            </View>
            <Text style={styles.brand}>NadaAdmin</Text>
            <Text style={styles.tagline}>Operate the platform with confidence</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to your admin account.</Text>

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              editable={!loading}
              placeholderTextColor={colors.slate400}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
              placeholderTextColor={colors.slate400}
            />

            <Button
              title="Quick fill"
              onPress={() => { setEmail(QUICK.email); setPassword(QUICK.password); }}
              variant="ghost"
              size="sm"
              style={{ marginTop: spacing.sm }}
            />
            <Button
              title={loading ? "Signing in…" : "Sign in"}
              onPress={handleLogin}
              loading={loading}
              size="lg"
              style={{ marginTop: spacing.md }}
            />
          </View>

          <Text style={styles.footnote}>Face sign-in is intentionally disabled for admins.</Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  brandWrap: {
    alignItems: "center",
    marginBottom: spacing.xxl,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    backgroundColor: colors.brand600,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
    ...shadow.raised,
  },
  logoText: { color: colors.white, fontSize: 26, fontWeight: "700" },
  brand: { fontSize: 24, fontWeight: "700", color: colors.slate900 },
  tagline: { fontSize: 13, color: colors.slate500, marginTop: 4 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.slate900 },
  subtitle: { fontSize: 13, color: colors.slate500, marginTop: 4, marginBottom: spacing.lg },
  label: {
    fontSize: 12,
    color: colors.slate600,
    fontWeight: "600",
    marginTop: spacing.md,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.slate900,
  },
  footnote: {
    textAlign: "center",
    fontSize: 12,
    color: colors.slate400,
    marginTop: spacing.xl,
  },
});
