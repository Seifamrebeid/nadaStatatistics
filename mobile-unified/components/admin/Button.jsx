import React from "react";
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from "react-native";
import { colors, radii, spacing } from "./theme";

/**
 * <Button title="Save" onPress={...} variant="primary" loading busy />
 * variants: primary | secondary | ghost | danger
 * sizes:    sm | md | lg
 */
export default function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  style,
  textStyle,
  leftIcon,
}) {
  const v = variants[variant] || variants.primary;
  const sz = sizes[size] || sizes.md;
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      style={[
        styles.base,
        sz.box,
        { backgroundColor: v.bg, borderColor: v.border },
        v.border ? styles.bordered : null,
        isDisabled && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} size="small" />
      ) : (
        <>
          {leftIcon ? leftIcon : null}
          <Text style={[styles.text, sz.text, { color: v.fg }, textStyle]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const variants = {
  primary:   { bg: colors.brand600, fg: colors.white,    border: null },
  secondary: { bg: colors.white,    fg: colors.slate700, border: colors.border },
  ghost:     { bg: "transparent",   fg: colors.slate700, border: null },
  danger:    { bg: colors.danger,   fg: colors.white,    border: null },
};

const sizes = {
  sm: {
    box:  { paddingHorizontal: spacing.md, paddingVertical: 6,  borderRadius: radii.md, gap: 6 },
    text: { fontSize: 13 },
  },
  md: {
    box:  { paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radii.md, gap: 8 },
    text: { fontSize: 14 },
  },
  lg: {
    box:  { paddingHorizontal: spacing.xl, paddingVertical: 14, borderRadius: radii.lg, gap: 8 },
    text: { fontSize: 16 },
  },
};

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  bordered: { borderWidth: 1 },
  text: { fontWeight: "600" },
});
