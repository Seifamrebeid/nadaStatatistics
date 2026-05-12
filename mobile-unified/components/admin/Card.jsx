import React from "react";
import { View, StyleSheet } from "react-native";
import { colors, radii, shadow, spacing } from "./theme";

/**
 * Card surface. Optional accent stripe on the left.
 *
 *   <Card accent={colors.brand500}>...</Card>
 */
export default function Card({ children, style, accent, padded = true }) {
  return (
    <View style={[styles.card, accent && { borderLeftWidth: 4, borderLeftColor: accent }, padded && { padding: spacing.lg }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
});
