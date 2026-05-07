import React from "react";
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from "react-native";
import { colors, radii, spacing } from "./theme";

export default function SearchBar({ value, onChangeText, placeholder = "Search...", autoFocus }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>🔍</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.slate400}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        style={styles.input}
        returnKeyType="search"
      />
      {value ? (
        <TouchableOpacity onPress={() => onChangeText("")} hitSlop={10}>
          <Text style={styles.clear}>✕</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 40,
    gap: spacing.sm,
  },
  icon: { fontSize: 14, opacity: 0.5 },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.slate900,
    padding: 0,
  },
  clear: {
    color: colors.slate400,
    fontSize: 14,
    paddingHorizontal: 4,
  },
});
