import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { colors, radii, spacing } from "./theme";

/**
 * <ScreenHeader title="Students" subtitle="42 total" right={...} />
 */
export default function ScreenHeader({
  title,
  subtitle,
  right,
  onBack,
  showBack = true,
}) {
  const router = useRouter();
  const back = onBack || (() => router.back());
  return (
    <View style={styles.wrap}>
      {showBack ? (
        <TouchableOpacity onPress={back} style={styles.back} hitSlop={10}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.back} />
      )}
      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.slate100,
  },
  backText: {
    fontSize: 20,
    color: colors.slate700,
    marginTop: -2,
  },
  center: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.slate900,
  },
  subtitle: {
    fontSize: 12,
    color: colors.slate500,
    marginTop: 2,
  },
  right: {
    minWidth: 36,
    alignItems: "flex-end",
    flexDirection: "row",
    gap: spacing.xs,
  },
});
