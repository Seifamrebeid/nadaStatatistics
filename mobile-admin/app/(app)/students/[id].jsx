import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { getStudent, updateStudent, deleteStudent } from "../../../api";
import Screen from "../../../components/Screen";
import ScreenHeader from "../../../components/ScreenHeader";
import Button from "../../../components/Button";
import { colors, radii, shadow, spacing } from "../../../components/theme";

export default function StudentDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [form, setForm] = useState({ name: "", email: "", active: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchStudent = useCallback(async () => {
    try {
      const response = await getStudent(id);
      const d = response.data || {};
      setForm({
        name: d.name || "",
        email: d.email || "",
        active: d.active !== false,
      });
    } catch (error) {
      Alert.alert("Error", "Failed to load student");
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useFocusEffect(
    useCallback(() => {
      fetchStudent();
    }, [fetchStudent]),
  );

  const handleSave = async () => {
    if (!form.name || !form.email) {
      Alert.alert("Missing info", "Name and email are required.");
      return;
    }
    setSaving(true);
    try {
      await updateStudent(id, form);
      Alert.alert("Saved", "Student updated.", [{ text: "OK", onPress: () => router.back() }]);
    } catch (error) {
      Alert.alert("Error", error.response?.data?.message || error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert("Delete student", "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteStudent(id);
            router.back();
          } catch (error) {
            Alert.alert("Error", error.response?.data?.message || error.message);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title="Student" />
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.brand600} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={form.name || "Student"} subtitle={`ID: ${id}`} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
              editable={!saving}
              placeholderTextColor={colors.slate400}
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={form.email}
              onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saving}
              placeholderTextColor={colors.slate400}
            />

            <View style={styles.switchRow}>
              <View>
                <Text style={[styles.label, { marginTop: 0 }]}>Active</Text>
                <Text style={styles.hint}>Inactive students cannot sign in.</Text>
              </View>
              <Switch
                value={form.active}
                onValueChange={(val) => setForm((f) => ({ ...f, active: val }))}
                disabled={saving}
                trackColor={{ true: colors.brand500, false: colors.slate200 }}
                thumbColor={colors.white}
              />
            </View>

            <Button
              title={saving ? "Saving…" : "Save changes"}
              onPress={handleSave}
              loading={saving}
              size="lg"
              style={{ marginTop: spacing.lg }}
            />
            <Button
              title="Delete student"
              onPress={handleDelete}
              variant="danger"
              disabled={saving}
              style={{ marginTop: spacing.sm }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
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
  hint: { fontSize: 12, color: colors.slate500, marginTop: 2 },
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
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
