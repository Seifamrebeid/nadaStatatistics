import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, signOutUser } from "../../firebase";
import { useRole } from "../../context/RoleContext";

const ROLES = [
  {
    key: "admin",
    title: "Admin",
    subtitle: "Operate the platform",
    accent: "#059669",
    accentSoft: "#d1fae5",
    quick: { email: "admin@classroom.local", password: "admin-password-change-me" },
  },
  {
    key: "doctor",
    title: "Doctor",
    subtitle: "Monitor lectures & students",
    accent: "#4f46e5",
    accentSoft: "#e0e7ff",
    quick: { email: "mona.saeeed@nada.edu", password: "Doctor@123" },
  },
  {
    key: "student",
    title: "Student",
    subtitle: "Lectures & engagement",
    accent: "#0ea5e9",
    accentSoft: "#e0f2fe",
    quick: { email: "nadasoska2005@gmail.com", password: "123456789" },
  },
  {
    key: "parent",
    title: "Parent",
    subtitle: "Your child's progress",
    accent: "#db2777",
    accentSoft: "#fce7f3",
    quick: { email: "seif.amr.ebeid05@gmail.com", password: "123456789" },
  },
];

export default function LoginScreen() {
  const router = useRouter();
  const { setRole } = useRole();
  const [selectedRole, setSelectedRole] = useState("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const roleSpec = useMemo(
    () => ROLES.find((r) => r.key === selectedRole) || ROLES[0],
    [selectedRole],
  );

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Missing info", "Please enter email and password.");
      return;
    }
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      const dbRole = snap.exists() ? snap.data()?.role : null;
      if (dbRole && dbRole !== selectedRole) {
        await signOutUser();
        throw new Error(
          `This account is a ${dbRole} account, but you chose ${selectedRole}.`,
        );
      }
      await setRole(selectedRole);
      router.replace(`/(${selectedRole})`);
    } catch (error) {
      Alert.alert("Login failed", error.message.replace(/^Firebase:\s*/, ""));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = () => {
    if (!roleSpec.quick) {
      Alert.alert("Not available", "No quick-fill credentials for this role.");
      return;
    }
    setEmail(roleSpec.quick.email);
    setPassword(roleSpec.quick.password);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: "#f8fafc" }}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandWrap}>
          <View style={[styles.logo, { backgroundColor: roleSpec.accent }]}>
            <Text style={styles.logoText}>N</Text>
          </View>
          <Text style={styles.brand}>NadaStatistics</Text>
          <Text style={styles.tagline}>Sign in to your portal</Text>
        </View>

        <Text style={styles.sectionLabel}>I am a…</Text>
        <View style={styles.rolesRow}>
          {ROLES.map((r) => {
            const active = r.key === selectedRole;
            return (
              <Pressable
                key={r.key}
                onPress={() => setSelectedRole(r.key)}
                style={[
                  styles.roleCard,
                  {
                    borderColor: active ? r.accent : "#e2e8f0",
                    backgroundColor: active ? r.accentSoft : "#ffffff",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.roleTitle,
                    { color: active ? r.accent : "#0f172a" },
                  ]}
                >
                  {r.title}
                </Text>
                <Text style={styles.roleSubtitle}>{r.subtitle}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>
            Sign in to your {roleSpec.title.toLowerCase()} account.
          </Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            editable={!loading}
            placeholderTextColor="#94a3b8"
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
            placeholderTextColor="#94a3b8"
          />

          {roleSpec.quick ? (
            <Pressable onPress={handleQuickFill} style={styles.ghostBtn}>
              <Text style={[styles.ghostBtnText, { color: roleSpec.accent }]}>
                Quick fill
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={handleLogin}
            disabled={loading}
            style={[
              styles.primaryBtn,
              { backgroundColor: roleSpec.accent, opacity: loading ? 0.6 : 1 },
            ]}
          >
            <Text style={styles.primaryBtnText}>
              {loading ? "Signing in…" : `Sign in as ${roleSpec.title}`}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.footnote}>
          Accounts are role-locked. Sign in with the role that matches your
          account.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 32,
    justifyContent: "center",
  },
  brandWrap: { alignItems: "center", marginBottom: 24 },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  logoText: { color: "#ffffff", fontSize: 26, fontWeight: "700" },
  brand: { fontSize: 22, fontWeight: "700", color: "#0f172a" },
  tagline: { fontSize: 13, color: "#64748b", marginTop: 4 },
  sectionLabel: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  rolesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  roleCard: {
    flexGrow: 1,
    flexBasis: "47%",
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  roleTitle: { fontSize: 15, fontWeight: "700" },
  roleSubtitle: { fontSize: 12, color: "#64748b", marginTop: 2 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  title: { fontSize: 20, fontWeight: "700", color: "#0f172a" },
  subtitle: { fontSize: 13, color: "#64748b", marginTop: 4, marginBottom: 14 },
  label: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0f172a",
  },
  ghostBtn: { alignSelf: "flex-start", paddingVertical: 10, marginTop: 8 },
  ghostBtnText: { fontWeight: "600", fontSize: 14 },
  primaryBtn: {
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
  footnote: {
    textAlign: "center",
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 20,
  },
});
