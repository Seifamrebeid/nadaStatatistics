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
import { useFocusEffect } from "expo-router";
import { getDoctors } from "../../api";
import Screen from "../../components/Screen";
import ScreenHeader from "../../components/ScreenHeader";
import SearchBar from "../../components/SearchBar";
import FilterChips from "../../components/FilterChips";
import EmptyState from "../../components/EmptyState";
import { colors, radii, shadow, spacing } from "../../components/theme";

export default function DoctorsScreen() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("");

  const fetchDoctors = useCallback(async () => {
    try {
      const response = await getDoctors();
      setDoctors(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      Alert.alert("Error", "Failed to fetch doctors");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchDoctors();
    }, [fetchDoctors]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDoctors();
    setRefreshing(false);
  };

  const departmentOptions = useMemo(() => {
    const set = new Set();
    for (const d of doctors) if (d.department) set.add(String(d.department));
    return Array.from(set).sort().map((v) => ({ value: v, label: v }));
  }, [doctors]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return doctors.filter((d) => {
      if (dept && String(d.department || "") !== dept) return false;
      if (!q) return true;
      const hay = `${d.name || ""} ${d.email || ""} ${d.doctor_id || d.id || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [doctors, search, dept]);

  return (
    <Screen>
      <ScreenHeader title="Doctors" subtitle={`${filtered.length} of ${doctors.length}`} />

      <View style={styles.controls}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search name, email..." />
      </View>
      {departmentOptions.length > 0 && (
        <FilterChips
          value={dept}
          onChange={setDept}
          options={departmentOptions}
          allLabel="All departments"
        />
      )}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.brand600} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.doctor_id || item.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand600} />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={[styles.avatar, { backgroundColor: colors.brand50 }]}>
                <Text style={[styles.avatarText, { color: colors.brand700 }]}>
                  {(item.name || "?").slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{item.name || "Unnamed"}</Text>
                <Text style={styles.sub} numberOfLines={1}>{item.email || "—"}</Text>
                {item.department ? (
                  <Text style={styles.dept} numberOfLines={1}>Dept: {item.department}</Text>
                ) : null}
                <Text style={styles.id} numberOfLines={1}>ID: {item.doctor_id || item.id}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="🩺"
              title={doctors.length === 0 ? "No doctors yet" : "No matches"}
              message={
                doctors.length === 0
                  ? "Doctors created on the web admin will appear here."
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
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontWeight: "700" },
  name: { fontSize: 15, fontWeight: "600", color: colors.slate900 },
  sub:  { fontSize: 13, color: colors.slate500, marginTop: 2 },
  dept: { fontSize: 12, color: colors.slate600, marginTop: 2 },
  id:   { fontSize: 11, color: colors.slate400, marginTop: 2 },
});
