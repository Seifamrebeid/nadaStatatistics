import React from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ChildProvider } from "../context/ChildContext";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ChildProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </ChildProvider>
    </GestureHandlerRootView>
  );
}
