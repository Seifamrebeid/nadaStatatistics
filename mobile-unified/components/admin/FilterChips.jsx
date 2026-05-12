import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { colors, radii, spacing } from "./theme";

/**
 * Horizontal chip row. Pass:
 *   options: [{ value, label, count? }]
 *   value:   currently-selected value (string | null/"" for "All")
 *   onChange: fn(value)
 *   includeAll: prepend an "All" chip (default true)
 */
export default function FilterChips({ options, value, onChange, includeAll = true, allLabel = "All" }) {
  const items = includeAll ? [{ value: "", label: allLabel }, ...options] : options;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {items.map((opt) => {
        const active = String(value ?? "") === String(opt.value);
        return (
          <TouchableOpacity
            key={String(opt.value)}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.7}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {opt.label}
              {typeof opt.count === "number" ? ` · ${opt.count}` : ""}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.brand50,
    borderColor: colors.brand500,
  },
  chipText: {
    fontSize: 13,
    color: colors.slate600,
    fontWeight: "500",
  },
  chipTextActive: {
    color: colors.brand700,
    fontWeight: "600",
  },
});
