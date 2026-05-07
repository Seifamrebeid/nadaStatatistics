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
import { getAdmins } from "../../api";
import Screen from "../../components/Screen";
import ScreenHeader from "../../components/ScreenHeader";
import SearchBar from "../../components/SearchBar";
import EmptyState from "../../components/EmptyState";
import { colors, radii, shadow, spacing } from "../../components/theme";

export default function AdminsScreen() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const fetchAdmins = useCallback(async () => {
    try {
      const response = await getAdmins();
      setAdmins(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      Alert.alert("Error", "Failed to fetch admins");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAdmins();
    }, [fetchAdmins]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAdmins();
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return admins;
    return admins.filter((a) => {
      const hay = `${a.name || ""} ${a.email || ""} ${a.admin_id || a.id || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [admins, search]);

  return (
    <Screen>
      <ScreenHeader title="Admins" subtitle={`${filtered.length} of ${admins.length}`} />

      <View style={styles.controls}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search name, email..." />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.brand600} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.admin_id || item.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand600} />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>🛡️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{item.name || "Unnamed"}</Text>
                <Text style={styles.sub} numberOfLines={1}>{item.email || "—"}</Text>
                <Text style={styles.id} numberOfLines={1}>ID: {item.admin_id || item.id}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="🛡️"
              title={admins.length === 0 ? "No admins yet" : "No matches"}
              message={admins.length === 0 ? "Admins are bootstrapped via the web console." : "Try a different search."}
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
  list: { padding: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
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
    backgroundColor: "#fef3c7",
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 18 },
  name: { fontSize: 15, fontWeight: "600", color: colors.slate900 },
  sub:  { fontSize: 13, color: colors.slate500, marginTop: 2 },
  id:   { fontSize: 11, color: colors.slate400, marginTop: 2 },
});
