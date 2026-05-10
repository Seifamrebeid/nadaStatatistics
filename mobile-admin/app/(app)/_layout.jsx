import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../components/ui";

const tabIcons = {
  index: ["home-outline", "home"],
  students: ["people-outline", "people"],
  doctors: ["medkit-outline", "medkit"],
  lectures: ["book-outline", "book"],
  profile: ["person-circle-outline", "person-circle"],
};

const tabBarIcon = (name) => ({ color, focused, size }) => {
  const [outline, filled] = tabIcons[name];
  return <Ionicons name={focused ? filled : outline} size={size} color={color} />;
};

export default function AdminTabs() {
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
      <Tabs.Screen name="students" options={{ title: "Students", tabBarIcon: tabBarIcon("students") }} />
      <Tabs.Screen name="doctors" options={{ title: "Doctors", tabBarIcon: tabBarIcon("doctors") }} />
      <Tabs.Screen name="lectures" options={{ title: "Lectures", tabBarIcon: tabBarIcon("lectures") }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: tabBarIcon("profile") }} />

      {/* Hidden screens — pushed via router.push */}
      <Tabs.Screen name="admins" options={{ href: null }} />
      <Tabs.Screen name="attendance" options={{ href: null }} />
      <Tabs.Screen name="analytics" options={{ href: null }} />
      <Tabs.Screen name="grades" options={{ href: null }} />
      <Tabs.Screen name="classes" options={{ href: null }} />
      <Tabs.Screen name="subjects" options={{ href: null }} />
      <Tabs.Screen name="weeks" options={{ href: null }} />
      <Tabs.Screen name="parents" options={{ href: null }} />
      <Tabs.Screen name="student-search" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
