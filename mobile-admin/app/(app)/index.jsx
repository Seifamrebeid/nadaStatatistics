import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { auth, db } from "../../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import Screen from "../../components/Screen";
import Card from "../../components/Card";
import Button from "../../components/Button";
import { colors, radii, spacing, shadow } from "../../components/theme";

const TILES = [
  { key: "students",       label: "Students",     icon: "👥", route: "/(app)/students",        accent: colors.brand500 },
  { key: "doctors",        label: "Doctors",      icon: "🩺", route: "/(app)/doctors",         accent: colors.info },
  { key: "admins",         label: "Admins",       icon: "🛡️", route: "/(app)/admins",          accent: colors.warning },
  { key: "parents",        label: "Parents",      icon: "👨‍👩‍👧", route: "/(app)/parents",         accent: "#f97316" },
  { key: "lectures",       label: "Lectures",     icon: "📚", route: "/(app)/lectures",        accent: "#8b5cf6" },
  { key: "subjects",       label: "Subjects",     icon: "📖", route: "/(app)/subjects",        accent: colors.brand600 },
  { key: "classes",        label: "Classes",      icon: "🏫", route: "/(app)/classes",         accent: colors.info },
  { key: "weeks",          label: "Weeks",        icon: "🗓️", route: "/(app)/weeks",           accent: "#06b6d4" },
  { key: "attendance",     label: "Attendance",   icon: "✅", route: "/(app)/attendance",      accent: colors.success },
  { key: "grades",         label: "Grades",       icon: "📊", route: "/(app)/grades",          accent: "#ec4899" },
  { key: "analytics",      label: "Analytics",    icon: "📈", route: "/(app)/analytics",       accent: colors.brand500 },
  { key: "student-search", label: "Search",       icon: "🔍", route: "/(app)/student-search",  accent: colors.warning },
  { key: "settings",       label: "Settings",     icon: "⚙️", route: "/(app)/settings",        accent: "#64748b" },
];

export default function AdminHomeScreen() {
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const [studSnap, docSnap, lecSnap] = await Promise.all([
        getDocs(query(collection(db, "students"), where("active", "==", true))),
        getDocs(query(collection(db, "doctors"), where("active", "==", true))),
        getDocs(collection(db, "lectures")),
      ]);
      setStats({
        students: studSnap.size,
        doctors: docSnap.size,
        lectures: lecSnap.size,
      });
    } catch (error) {
      console.error("Failed to fetch dashboard stats:", error);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        await fetchStats();
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [fetchStats]);

  const onRefresh = async () => {
    if (!user) return;
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/(auth)/login");
    } catch (error) {
      Alert.alert("Logout failed", error.message);
    }
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.brand600} />
        </View>
      </Screen>
    );
  }

  const initials = (user?.email || "?").slice(0, 2).toUpperCase();

  return (
    <Screen>
      <View style={styles.topbar}>
        <View style={styles.brandRow}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>N</Text>
          </View>
          <View>
            <Text style={styles.brand}>NadaAdmin</Text>
            <Text style={styles.brandSub}>Mobile console</Text>
          </View>
        </View>
        <Button title="Log out" variant="secondary" size="sm" onPress={handleLogout} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand600} />
        }
      >
        {user && (
          <Card style={styles.welcome}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.welcomeTitle}>Welcome back</Text>
              <Text style={styles.welcomeSub} numberOfLines={1}>
                {user.email}
              </Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Admin</Text>
            </View>
          </Card>
        )}

        {stats && (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={styles.sectionTitle}>Overview</Text>
            <View style={styles.statsRow}>
              <Stat label="Students" value={String(stats.students)} />
              <Stat label="Doctors"  value={String(stats.doctors)} />
              <Stat label="Lectures" value={String(stats.lectures)} />
            </View>
          </Card>
        )}

        <Text style={styles.menuTitle}>Manage</Text>
        <View style={styles.tiles}>
          {TILES.map((t) => (
            <TouchableOpacity
              key={t.key}
              activeOpacity={0.85}
              onPress={() => router.push(t.route)}
              style={styles.tile}
            >
              <View style={[styles.tileIcon, { backgroundColor: t.accent + "22" }]}>
                <Text style={{ fontSize: 22 }}>{t.icon}</Text>
              </View>
              <Text style={styles.tileLabel}>{t.label}</Text>
              <Text style={styles.tileChev}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logo: {
    width: 36, height: 36, borderRadius: radii.md,
    backgroundColor: colors.brand600,
    alignItems: "center", justifyContent: "center",
    ...shadow.card,
  },
  logoText: { color: colors.white, fontWeight: "700" },
  brand: { fontSize: 16, fontWeight: "700", color: colors.slate900 },
  brandSub: { fontSize: 11, color: colors.slate500 },
  scroll: { padding: spacing.lg, paddingBottom: 40 },
  welcome: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.brand100,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: colors.brand700, fontWeight: "700" },
  welcomeTitle: { fontSize: 14, fontWeight: "700", color: colors.slate900 },
  welcomeSub: { fontSize: 12, color: colors.slate500, marginTop: 2 },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.brand50,
  },
  badgeText: { color: colors.brand700, fontSize: 11, fontWeight: "600" },
  sectionTitle: {
    fontSize: 13, fontWeight: "700", color: colors.slate700,
    marginBottom: spacing.sm,
  },
  statsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
  statLabel: {
    fontSize: 10, color: colors.slate500, fontWeight: "600",
    letterSpacing: 0.5, textTransform: "uppercase",
  },
  statValue: { fontSize: 14, fontWeight: "600", color: colors.slate800, marginTop: 2 },
  menuTitle: {
    fontSize: 11, color: colors.slate500, fontWeight: "700",
    letterSpacing: 0.6, textTransform: "uppercase",
    marginTop: spacing.xl, marginBottom: spacing.sm, marginLeft: 4,
  },
  tiles: { gap: spacing.sm },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  tileIcon: {
    width: 40, height: 40, borderRadius: radii.md,
    alignItems: "center", justifyContent: "center",
    marginRight: spacing.md,
  },
  tileLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.slate800 },
  tileChev: { fontSize: 20, color: colors.slate400 },
});
