/**
 * Horizontal pill row to switch between the parent's linked children.
 * Render at the top of any tab that's child-scoped (Lectures, Grades,
 * Attendance). Reads from ChildContext.
 */

import React from "react";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { useChildren } from "../context/ChildContext";
import { colors } from "./ui";

export default function ChildSwitcher() {
  const { children: kids, selectedId, setSelected, loading } = useChildren();

  if (loading) return null;
  if (!kids || kids.length === 0) return null;
  if (kids.length === 1) {
    return (
      <View style={[styles.bar, styles.singleBar]}>
        <Text style={styles.singleLabel}>
          {kids[0].name || kids[0].id}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.bar}
    >
      {kids.map((k) => {
        const active = k.id === selectedId;
        return (
          <Pressable
            key={k.id}
            onPress={() => setSelected(k.id)}
            style={({ pressed }) => [
              styles.pill,
              active && styles.pillActive,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>
              {k.name || k.id}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
    marginBottom: 4,
  },
  singleBar: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    borderColor: colors.brand100,
    borderWidth: 1,
  },
  singleLabel: {
    color: colors.brand700,
    fontWeight: "700",
    fontSize: 13,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "600",
  },
  pillTextActive: {
    color: "#ffffff",
  },
});
