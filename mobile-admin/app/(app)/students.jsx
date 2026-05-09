import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import Screen from "../../components/Screen";
import ScreenHeader from "../../components/ScreenHeader";
import SearchBar from "../../components/SearchBar";
import FilterChips from "../../components/FilterChips";
import EmptyState from "../../components/EmptyState";
import Button from "../../components/Button";
import { colors, radii, shadow, spacing } from "../../components/theme";

export default function StudentsScreen() {
  const router = useRouter();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(""); // "" | "active" | "inactive" | "enrolled"

  const fetchStudents = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, "students"));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setStudents(data);
    } catch (error) {
      Alert.alert("Error", "Failed to fetch students");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchStudents();
    }, [fetchStudents]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStudents();
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (statusFilter === "active"   && s.active === false) return false;
      if (statusFilter === "inactive" && s.active !== false) return false;
      if (statusFilter === "enrolled" && !s.face_photo_url) return false;
      if (!q) return true;
      const hay = `${s.name || ""} ${s.email || ""} ${s.id || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [students, search, statusFilter]);

  return (
    <Screen>
      <ScreenHeader
        title="Students"
        subtitle={`${filtered.length} of ${students.length}`}
        right={
          <Button
            title="+ New"
            size="sm"
            onPress={() => router.push("/(app)/students/create")}
          />
        }
      />

      <View style={styles.controls}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search name, email, ID..." />
      </View>
      <FilterChips
        value={statusFilter}
        onChange={setStatusFilter}
        options={[
          { value: "active",   label: "Active" },
          { value: "inactive", label: "Inactive" },
          { value: "enrolled", label: "Face enrolled" },
        ]}
      />

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.brand600} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand600} />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.card}
              onPress={() =>
                router.push({
                  pathname: "/(app)/students/[id]",
                  params: { id: item.id },
                })
              }
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(item.name || "?").slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{item.name || "Unnamed"}</Text>
                <Text style={styles.sub} numberOfLines={1}>{item.email || "—"}</Text>
                <Text style={styles.id} numberOfLines={1}>ID: {item.id}</Text>
              </View>
              {item.face_photo_url ? (
                <View style={styles.pill}>
                  <Text style={styles.pillText}>face</Text>
                </View>
              ) : null}
              <Text style={styles.chev}>›</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="🎓"
              title={students.length === 0 ? "No students yet" : "No matches"}
              message={
                students.length === 0
                  ? "Tap \"+ New\" to add the first student."
                  : "Try a different search or filter."
              }
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadow.card,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.brand100,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: colors.brand700, fontWeight: "700" },
  name: { fontSize: 15, fontWeight: "600", color: colors.slate900 },
  sub:  { fontSize: 13, color: colors.slate500, marginTop: 2 },
  id:   { fontSize: 11, color: colors.slate400, marginTop: 2 },
  pill: {
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.brand50,
  },
  pillText: { color: colors.brand700, fontSize: 11, fontWeight: "600" },
  chev: { fontSize: 22, color: colors.slate300 },
});
