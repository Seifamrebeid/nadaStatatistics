import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../components/ui";

const tabIcons = {
  index: ["home-outline", "home"],
  lectures: ["book-outline", "book"],
  live: ["radio-outline", "radio"],
  history: ["analytics-outline", "analytics"],
  profile: ["person-circle-outline", "person-circle"],
};

const tabBarIcon = (name) => ({ color, focused, size }) => {
  const [outline, filled] = tabIcons[name];
  return <Ionicons name={focused ? filled : outline} size={size} color={color} />;
};

export default function StudentTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: "#6b7785",
        tabBarStyle: {
          height: 68,
          paddingTop: 7,
          paddingBottom: 9,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: tabBarIcon("index") }} />
      <Tabs.Screen name="lectures" options={{ title: "Lectures", tabBarIcon: tabBarIcon("lectures") }} />
      <Tabs.Screen name="live" options={{ title: "Live", tabBarIcon: tabBarIcon("live") }} />
      <Tabs.Screen name="history" options={{ title: "History", tabBarIcon: tabBarIcon("history") }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: tabBarIcon("profile") }} />
    </Tabs>
  );
}
