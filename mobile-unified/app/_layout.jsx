import React from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RoleProvider } from "../context/RoleContext";
import { ChildProvider } from "../context/ChildContext";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RoleProvider>
          <ChildProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </ChildProvider>
        </RoleProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
