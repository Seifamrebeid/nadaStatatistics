import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { createStudent } from "../../../api";
import Screen from "../../../components/Screen";
import ScreenHeader from "../../../components/ScreenHeader";
import Button from "../../../components/Button";
import { colors, radii, shadow, spacing } from "../../../components/theme";

export default function CreateStudentScreen() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "" });
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!form.name || !form.email) {
      Alert.alert("Missing info", "Name and email are required.");
      return;
    }
    setLoading(true);
    try {
      const response = await createStudent(form);
      const tmp = response.data?.temporary_password;
      Alert.alert(
        "Student created",
        tmp ? `Temporary password:\n${tmp}` : "Account created.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (error) {
      Alert.alert("Error", error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="New student" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Full name"
              value={form.name}
              onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
              editable={!loading}
              placeholderTextColor={colors.slate400}
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="student@example.com"
              value={form.email}
              onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              placeholderTextColor={colors.slate400}
            />

            <Button
              title={loading ? "Creating…" : "Create student"}
              onPress={handleCreate}
              loading={loading}
              size="lg"
              style={{ marginTop: spacing.lg }}
            />
            <Button
              title="Cancel"
              onPress={() => router.back()}
              variant="ghost"
              style={{ marginTop: spacing.sm }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  label: {
    fontSize: 11,
    color: colors.slate600,
    fontWeight: "700",
    marginTop: spacing.md,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.slate900,
  },
});
