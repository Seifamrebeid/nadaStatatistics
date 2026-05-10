// Parent UI kit — warm orange accent. Matches the web parent design.
// Same exported API as mobile-student so screens are copy-compatible.

import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export const colors = {
  // brand (orange)
  brand50:  "#fff7ed",
  brand100: "#ffedd5",
  brand500: "#f97316",
  brand600: "#ea580c",
  brand700: "#c2410c",
  primary:     "#f97316",
  primaryDark: "#ea580c",
  primarySoft: "#fff7ed",

  // slate
  bg:     "#f8fafc",
  panel:  "#ffffff",
  card:   "#ffffff",
  border: "#e2e8f0",
  text:   "#0f172a",
  ink:    "#1e293b",
  muted:  "#64748b",
  faint:  "#94a3b8",

  // status
  danger:  "#ef4444",
  warning: "#f59e0b",
  success: "#10b981",
  info:    "#3b82f6",
};

export function Screen({ children, scroll = true, refreshControl }) {
  if (scroll) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.screenContent}
        refreshControl={refreshControl}
      >
        {children}
      </ScrollView>
    );
  }
  return <View style={styles.screen}>{children}</View>;
}

export function Header({ title, subtitle, action }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Stat({ label, value, tone = "primary" }) {
  const toneColor = {
    primary: colors.primary,
    success: colors.success,
    warning: colors.warning,
    danger:  colors.danger,
    slate:   colors.ink,
  }[tone] || colors.primary;
  return (
    <Card style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: toneColor }]}>
        {String(value ?? "—")}
      </Text>
    </Card>
  );
}

export function Button({ title, onPress, disabled, variant = "primary", busy }) {
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  const isGhost = variant === "ghost";
  const labelStyle = isPrimary || isDanger
    ? { color: "#ffffff" }
    : { color: colors.ink };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        isPrimary && styles.primaryButton,
        variant === "secondary" && styles.secondaryButton,
        isGhost && styles.ghostButton,
        isDanger && styles.dangerButton,
        (disabled || busy) && styles.disabled,
        pressed && !(disabled || busy) && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={isPrimary || isDanger ? "#ffffff" : colors.primary} />
      ) : (
        <Text style={[styles.buttonText, labelStyle]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Input({ label, value, onChangeText, multiline, ...props }) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholderTextColor={colors.faint}
        style={[styles.input, multiline && styles.textArea]}
        {...props}
      />
    </View>
  );
}

export function EmptyState({ title, body }) {
  return (
    <Card style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </Card>
  );
}

export function Loading({ label }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
      {label ? <Text style={styles.loadingLabel}>{label}</Text> : null}
    </View>
  );
}

export function Pill({ text, tone = "slate" }) {
  const palette = {
    success: { bg: "#d1fae5", fg: "#065f46" },
    danger:  { bg: "#fee2e2", fg: "#991b1b" },
    warning: { bg: "#fef3c7", fg: "#92400e" },
    info:    { bg: "#dbeafe", fg: "#1e40af" },
    slate:   { bg: "#e2e8f0", fg: "#334155" },
    brand:   { bg: colors.brand100, fg: colors.brand700 },
  };
  const { bg, fg } = palette[tone] || palette.slate;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{text}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  screenContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 6,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  statCard: {
    flex: 1,
    minWidth: "47%",
  },
  statLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  statValue: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  button: {
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
  },
  ghostButton: {
    backgroundColor: "transparent",
  },
  dangerButton: {
    backgroundColor: colors.danger,
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 15,
  },
  disabled: { opacity: 0.5 },
  pressed:  { opacity: 0.85 },

  field: {
    marginBottom: 4,
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.panel,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 15,
  },
  textArea: {
    minHeight: 116,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 32,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  emptyBody: {
    color: colors.muted,
    textAlign: "center",
    marginTop: 6,
    fontSize: 13,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    gap: 12,
  },
  loadingLabel: {
    color: colors.muted,
    fontSize: 13,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  pillText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
