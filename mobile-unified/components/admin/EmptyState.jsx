import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing } from "./theme";

export default function EmptyState({ icon = "📭", title, message }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>{icon}</Text>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {message ? <Text style={styles.msg}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: spacing.xl,
  },
  icon: { fontSize: 36, marginBottom: spacing.sm, opacity: 0.6 },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.slate700,
    marginBottom: 4,
  },
  msg: { fontSize: 13, color: colors.slate500, textAlign: "center" },
});
