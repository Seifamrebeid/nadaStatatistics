/**
 * Admin subjects — full CRUD. Admin can pick the assigned doctor (web parity).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc, collection, doc, getDocs, serverTimestamp, updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import {
  Button, Card, EmptyState, Header, Input, Pill, Screen, colors, styles,
} from "../../components/ui";

const BLANK = { name: "", code: "", description: "", doctor_id: "", active: true };

export default function AdminSubjects() {
  const [user, setUser] = useState(null);
  const [rows, setRows] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return unsub;
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [sSnap, dSnap] = await Promise.all([
        getDocs(collection(db, "subjects")),
        getDocs(collection(db, "doctors")),
      ]);
      const subs = sSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      subs.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setRows(subs);
      setDoctors(dSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const docMap = useMemo(() => Object.fromEntries(doctors.map((d) => [d.id, d.name || d.id])), [doctors]);

  function openCreate() { setEditing(null); setForm({ ...BLANK, doctor_id: doctors[0]?.id || "" }); setModalOpen(true); }
  function openEdit(r) {
    setEditing(r);
    setForm({
      name: r.name || "", code: r.code || "", description: r.description || "",
      doctor_id: r.doctor_id || "", active: r.active !== false,
    });
    setModalOpen(true);
  }
  function close() { setModalOpen(false); setEditing(null); setForm(BLANK); }

  async function save() {
    if (!form.name.trim() || !form.doctor_id) { Alert.alert("Missing", "Name and doctor are required."); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, "subjects", editing.id), {
          name: form.name.trim(), code: form.code.trim(),
          description: form.description.trim(), doctor_id: form.doctor_id,
          active: !!form.active,
        });
      } else {
        await addDoc(collection(db, "subjects"), {
          name: form.name.trim(), code: form.code.trim(),
          description: form.description.trim(), doctor_id: form.doctor_id,
          active: true, created_by: user?.uid || null, created_at: serverTimestamp(),
        });
      }
      close(); load();
    } catch (e) { Alert.alert("Save failed", e.message); }
    finally { setSaving(false); }
  }

  async function softDelete(r) {
    Alert.alert("Disable subject?", `${r.name} will be hidden.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Disable", style: "destructive", onPress: async () => {
        try { await updateDoc(doc(db, "subjects", r.id), { active: false }); load(); }
        catch (e) { Alert.alert("Failed", e.message); }
      }},
    ]);
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header title="Subjects" subtitle="All subjects across doctors" action={<Button title="Back" onPress={() => router.back()} variant="ghost" />} />

      {err ? (
        <Card style={{ borderColor: colors.danger, backgroundColor: "#fef2f2" }}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Error</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{err}</Text>
        </Card>
      ) : null}

      <Button title="+ New subject" onPress={openCreate} />

      {rows.map((r) => (
        <Card key={r.id}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.emptyTitle}>{r.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                {r.code || "(no code)"} • {docMap[r.doctor_id] || r.doctor_id || "—"}
              </Text>
              {r.description ? <Text style={{ color: colors.faint, fontSize: 12, marginTop: 4 }} numberOfLines={2}>{r.description}</Text> : null}
            </View>
            <Pill text={r.active === false ? "inactive" : "active"} tone={r.active === false ? "slate" : "success"} />
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Button title="Edit" onPress={() => openEdit(r)} variant="secondary" />
            <Button title={r.active === false ? "Off" : "Disable"} onPress={() => softDelete(r)} variant="danger" disabled={r.active === false} />
          </View>
        </Card>
      ))}

      {!loading && rows.length === 0 ? <EmptyState title="No subjects" body="Tap '+ New subject' above." /> : null}

      <Modal visible={modalOpen} animationType="slide" onRequestClose={close}>
        <Screen>
          <Header title={editing ? "Edit subject" : "New subject"} action={<Button title="Cancel" onPress={close} variant="ghost" />} />
          <Card>
            <Input label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} editable={!saving} />
            <Input label="Code" value={form.code} onChangeText={(v) => setForm({ ...form, code: v })} editable={!saving} />
            <Input label="Description" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline editable={!saving} />

            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginTop: 6 }}>DOCTOR</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 6, marginBottom: 8 }}>
              {doctors.map((d) => (
                <Pressable key={d.id} onPress={() => setForm({ ...form, doctor_id: d.id })}
                  style={[local.chip, form.doctor_id === d.id && local.chipActive]}>
                  <Text style={[local.chipText, form.doctor_id === d.id && local.chipTextActive]} numberOfLines={1}>{d.name || d.id}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {editing ? (
              <Pressable onPress={() => setForm({ ...form, active: !form.active })}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                <View style={[local.checkbox, form.active && local.checkboxActive]}>
                  {form.active ? <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>✓</Text> : null}
                </View>
                <Text style={{ color: colors.ink, fontWeight: "600" }}>Active</Text>
              </Pressable>
            ) : null}

            <Button title={saving ? "Saving…" : "Save"} onPress={save} busy={saving} />
          </Card>
        </Screen>
      </Modal>
    </Screen>
  );
}

const local = StyleSheet.create({
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "#f1f5f9", borderColor: "#e2e8f0", borderWidth: 1, maxWidth: 220 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.ink, fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#ffffff" },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderColor: colors.border, borderWidth: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff" },
  checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
});
