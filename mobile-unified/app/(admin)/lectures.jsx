import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import Screen from "../../components/admin/Screen";
import ScreenHeader from "../../components/admin/ScreenHeader";
import SearchBar from "../../components/admin/SearchBar";
import FilterChips from "../../components/admin/FilterChips";
import EmptyState from "../../components/admin/EmptyState";
import { colors, radii, shadow, spacing } from "../../components/admin/theme";

const STATUS_COLORS = {
  scheduled: { bg: colors.slate100, fg: colors.slate700 },
  recording: { bg: "#fee2e2",       fg: "#b91c1c" },
  finished:  { bg: colors.brand50,  fg: colors.brand700 },
};

export default function LecturesScreen() {
  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const fetchLectures = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, "lectures"));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setLectures(data);
    } catch (error) {
      Alert.alert("Error", "Failed to fetch lectures");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchLectures();
    }, [fetchLectures]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLectures();
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lectures.filter((l) => {
      if (status && String(l.status || "") !== status) return false;
      if (!q) return true;
      const hay = `${l.title || ""} ${l.doctor_id || ""} ${l.id || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [lectures, search, status]);

  return (
    <Screen>
      <ScreenHeader title="Lectures" subtitle={`${filtered.length} of ${lectures.length}`} />

      <View style={styles.controls}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search title, doctor..." />
      </View>
      <FilterChips
        value={status}
        onChange={setStatus}
        options={[
          { value: "scheduled", label: "Scheduled" },
          { value: "recording", label: "Recording" },
          { value: "finished",  label: "Finished" },
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
          renderItem={({ item }) => {
            const st = String(item.status || "scheduled");
            const sc = STATUS_COLORS[st] || STATUS_COLORS.scheduled;
            const enrolledCount = Array.isArray(item.enrolled_student_ids)
              ? item.enrolled_student_ids.length
              : 0;
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.subject} numberOfLines={1}>
                    {item.title || "Untitled lecture"}
                  </Text>
                  <View style={[styles.pill, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.pillText, { color: sc.fg }]}>{st}</Text>
                  </View>
                </View>
                <Text style={styles.doctor}>🩺 {item.doctor_id || "Unassigned"}</Text>
                <View style={styles.meta}>
                  <Text style={styles.metaText}>📅 {item.date || "No date"}</Text>
                  <Text style={styles.metaText}>👥 {enrolledCount} students</Text>
                </View>
                <Text style={styles.id} numberOfLines={1}>ID: {item.id}</Text>
              </View>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="📚"
              title={lectures.length === 0 ? "No lectures yet" : "No matches"}
              message={lectures.length === 0 ? "Lectures created by doctors will appear here." : "Try a different search or filter."}
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
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  subject: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.slate900 },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  pillText: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  doctor: { fontSize: 13, color: colors.slate600, marginTop: 6 },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  metaText: { fontSize: 12, color: colors.slate500 },
  id: { fontSize: 10, color: colors.slate300, marginTop: 8 },
});
