import React from "react";
import { View, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "./theme";

/**
 * Page wrapper. Ensures safe-area inset, app background, status bar style.
 */
export default function Screen({ children, style, edges = ["top", "left", "right"] }) {
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <View style={{ flex: 1 }}>{children}</View>
    </SafeAreaView>
  );
}
