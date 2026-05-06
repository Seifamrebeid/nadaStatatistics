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
  bg: "#f7f8fa",
  panel: "#ffffff",
  text: "#17202a",
  muted: "#657485",
  border: "#dbe3ea",
  primary: "#0f766e",
  primaryDark: "#115e59",
  danger: "#b42318",
  warning: "#b7791f",
  success: "#16803c",
  ink: "#25313d",
};

export function Screen({ children, scroll = true }) {
  const Wrapper = scroll ? ScrollView : View;
  return (
    <Wrapper
      style={styles.screen}
      contentContainerStyle={scroll ? styles.screenContent : undefined}
    >
      {children}
    </Wrapper>
  );
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
  return (
    <Card style={styles.statCard}>
      <Text style={[styles.statValue, styles[tone] || styles.primary]}>
        {String(value ?? "-")}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

export function Button({ title, onPress, disabled, variant = "primary" }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        styles[`${variant}Button`] || styles.primaryButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, styles[`${variant}ButtonText`]]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Input({ label, value, onChangeText, multiline, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholderTextColor="#8a97a4"
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

export function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
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
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 3,
  },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    minWidth: "47%",
  },
  statValue: {
    fontSize: 26,
    fontWeight: "800",
  },
  statLabel: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
  },
  primary: {
    color: colors.primary,
  },
  danger: {
    color: colors.danger,
  },
  warning: {
    color: colors.warning,
  },
  success: {
    color: colors.success,
  },
  button: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: "#eef3f6",
    borderColor: colors.border,
    borderWidth: 1,
  },
  dangerButton: {
    backgroundColor: colors.danger,
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },
  secondaryButtonText: {
    color: colors.ink,
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.88,
  },
  field: {
    marginBottom: 12,
  },
  label: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 15,
  },
  textArea: {
    minHeight: 116,
    paddingTop: 10,
    textAlignVertical: "top",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 28,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  emptyBody: {
    color: colors.muted,
    textAlign: "center",
    marginTop: 6,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
});
