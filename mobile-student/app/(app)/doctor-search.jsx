import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import {
  Button, Card, EmptyState, Header, Input, Screen, Stat, colors, styles,
} from "../../components/ui";

export default function StudentDoctorSearch() {
  const [doctors, setDoctors] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const snap = await getDocs(
        query(collection(db, "doctors"), where("active", "==", true))
      );
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setDoctors(rows);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    if (!search.trim()) return doctors;
    const t = search.trim().toLowerCase();
    return doctors.filter((d) =>
      (d.name || "").toLowerCase().includes(t) ||
      (d.department || "").toLowerCase().includes(t)
    );
  }, [doctors, search]);

  const departments = useMemo(() => {
    return new Set(doctors.map((d) => d.department).filter(Boolean)).size;
  }, [doctors]);

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header
        title="Find a doctor"
        subtitle="Browse active doctors and their departments"
        action={<Button title="Back" onPress={() => router.back()} variant="ghost" />}
      />

      {err ? (
        <Card style={{ borderColor: colors.danger, backgroundColor: "#fef2f2" }}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Error</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{err}</Text>
        </Card>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat label="Doctors" value={doctors.length} />
        <Stat label="Departments" value={departments} tone="slate" />
        <Stat label="Showing" value={filtered.length} tone="info" />
      </View>

      <Input
        label="Search"
        value={search}
        onChangeText={setSearch}
        placeholder="Name or department"
        autoCorrect={false}
        autoCapitalize="none"
      />

      {filtered.map((d) => (
        <Card key={d.id}>
          <Text style={styles.emptyTitle}>{d.name || d.id}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
            {d.department || "—"}
          </Text>
          <Text style={{ color: colors.faint, fontSize: 11, marginTop: 4 }}>
            ID: {d.id}
          </Text>
        </Card>
      ))}

      {!loading && filtered.length === 0 ? (
        <EmptyState
          title="No doctors found"
          body={search ? "Try a different name or department." : "No active doctors at the moment."}
        />
      ) : null}
    </Screen>
  );
}
