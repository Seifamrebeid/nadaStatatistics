import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../components/ui";

const tabIcons = {
  index: ["home-outline", "home"],
  lectures: ["book-outline", "book"],
  live: ["pulse-outline", "pulse"],
  analytics: ["bar-chart-outline", "bar-chart"],
  messages: ["mail-outline", "mail"],
  profile: ["person-circle-outline", "person-circle"],
};

function tabBarIcon(name) {
  return ({ color, focused, size }) => {
    const [outline, filled] = tabIcons[name];
    return (
      <Ionicons
        name={focused ? filled : outline}
        size={size}
        color={color}
      />
    );
  };
}

export default function DoctorTabs() {
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
          borderTopColor: "#dbe3ea",
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Home", tabBarIcon: tabBarIcon("index") }}
      />
      <Tabs.Screen
        name="lectures"
        options={{ title: "Lectures", tabBarIcon: tabBarIcon("lectures") }}
      />
      <Tabs.Screen
        name="live"
        options={{ title: "Live", tabBarIcon: tabBarIcon("live") }}
      />
      <Tabs.Screen
        name="analytics"
        options={{ title: "Analytics", tabBarIcon: tabBarIcon("analytics") }}
      />
      <Tabs.Screen
        name="messages"
        options={{ title: "Messages", tabBarIcon: tabBarIcon("messages") }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarIcon: tabBarIcon("profile") }}
      />
    </Tabs>
  );
}
