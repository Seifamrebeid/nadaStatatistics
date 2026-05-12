import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../components/student/ui";

const tabIcons = {
  index: ["home-outline", "home"],
  lectures: ["book-outline", "book"],
  transcripts: ["document-text-outline", "document-text"],
  grades: ["school-outline", "school"],
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
      {/* Visible tabs */}
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: tabBarIcon("index") }} />
      <Tabs.Screen name="lectures" options={{ title: "Lectures", tabBarIcon: tabBarIcon("lectures") }} />
      <Tabs.Screen name="transcripts" options={{ title: "Transcripts", tabBarIcon: tabBarIcon("transcripts") }} />
      <Tabs.Screen name="grades" options={{ title: "Grades", tabBarIcon: tabBarIcon("grades") }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: tabBarIcon("profile") }} />

      {/* Hidden screens — pushed via router.push but not shown in tab bar */}
      <Tabs.Screen name="live" options={{ href: null }} />
      <Tabs.Screen name="attendance" options={{ href: null }} />
      <Tabs.Screen name="engagement" options={{ href: null }} />
      <Tabs.Screen name="doctor-search" options={{ href: null }} />
      <Tabs.Screen name="hierarchy" options={{ href: null }} />
      <Tabs.Screen name="history" options={{ href: null }} />
    </Tabs>
  );
}
