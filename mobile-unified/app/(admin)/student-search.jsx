import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, Text, View } from "react-native";
import { router } from "expo-router";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import {
  Button, Card, EmptyState, Header, Input, Pill, Screen, Stat, colors, styles,
} from "../../components/admin/ui";

export default function AdminStudentSearch() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const snap = await getDocs(collection(db, "students"));
      const out = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      out.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setRows(out);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((s) =>
      (s.name || "").toLowerCase().includes(t) ||
      (s.id || "").toLowerCase().includes(t) ||
      (s.email || "").toLowerCase().includes(t)
    );
  }, [rows, search]);

  const counts = useMemo(() => ({
    total: rows.length,
    active: rows.filter((s) => s.active !== false).length,
    inactive: rows.filter((s) => s.active === false).length,
  }), [rows]);

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header title="Student search" subtitle="Find by name, id, or email" action={<Button title="Back" onPress={() => router.back()} variant="ghost" />} />

      {err ? (
        <Card style={{ borderColor: colors.danger, backgroundColor: "#fef2f2" }}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Error</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{err}</Text>
        </Card>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat label="Total" value={counts.total} />
        <Stat label="Active" value={counts.active} tone="success" />
        <Stat label="Inactive" value={counts.inactive} tone="slate" />
      </View>

      <Input label="Search" value={search} onChangeText={setSearch} placeholder="Name, id, or email" autoCorrect={false} autoCapitalize="none" />

      {filtered.slice(0, 80).map((s) => (
        <Card key={s.id}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.emptyTitle} numberOfLines={1}>{s.name || s.id}</Text>
              <Text style={{ color: colors.faint, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{s.email || s.id}</Text>
            </View>
            <Pill text={s.active === false ? "inactive" : "active"} tone={s.active === false ? "slate" : "success"} />
          </View>
        </Card>
      ))}

      {filtered.length > 80 ? (
        <Text style={{ color: colors.faint, fontSize: 12, textAlign: "center" }}>
          Showing first 80 of {filtered.length}.
        </Text>
      ) : null}

      {!loading && filtered.length === 0 ? (
        <EmptyState title="No students" body={search ? "Try a different search." : "No students yet."} />
      ) : null}
    </Screen>
  );
}
