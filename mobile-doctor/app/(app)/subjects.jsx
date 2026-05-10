/**
 * Doctor subjects — CRUD on subjects/{id}. Mirrors web-doctor DoctorSubjects.
 * Lists this doctor's subjects, allows add / edit / soft-delete.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import {
  Button, Card, EmptyState, Header, Input, Pill, Screen, colors, styles,
} from "../../components/ui";

const BLANK = { name: "", code: "", description: "", active: true };

export default function DoctorSubjects() {
  const [doctorId, setDoctorId] = useState(null);
  const [user, setUser] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) return;
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) setDoctorId(snap.data().linked_id || null);
      } catch { /* ignore */ }
    });
    return unsub;
  }, []);

  const load = useCallback(async () => {
    if (!doctorId) return;
    setLoading(true); setErr(null);
    try {
      const snap = await getDocs(
        query(collection(db, "subjects"), where("doctor_id", "==", doctorId))
      );
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setRows(list);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setEditing(null); setForm(BLANK); setModalOpen(true); }
  function openEdit(r) {
    setEditing(r);
    setForm({ name: r.name || "", code: r.code || "", description: r.description || "", active: r.active !== false });
    setModalOpen(true);
  }
  function close() { setModalOpen(false); setEditing(null); setForm(BLANK); }

  async function save() {
    if (!form.name.trim()) { Alert.alert("Missing name", "Subject name is required."); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, "subjects", editing.id), {
          name: form.name.trim(),
          code: form.code.trim(),
          description: form.description.trim(),
          active: !!form.active,
        });
      } else {
        await addDoc(collection(db, "subjects"), {
          name: form.name.trim(),
          code: form.code.trim(),
          description: form.description.trim(),
          doctor_id: doctorId,
          active: true,
          created_by: user?.uid || null,
          created_at: serverTimestamp(),
        });
      }
      close();
      load();
    } catch (e) {
      Alert.alert("Save failed", e.message);
    } finally {
      setSaving(false);
    }
  }

  async function softDelete(r) {
    Alert.alert("Disable subject?", `${r.name} will be hidden but not deleted.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disable", style: "destructive",
        onPress: async () => {
          try {
            await updateDoc(doc(db, "subjects", r.id), { active: false });
            load();
          } catch (e) {
            Alert.alert("Failed", e.message);
          }
        },
      },
    ]);
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header
        title="Subjects"
        subtitle="Subjects you teach"
        action={<Button title="Back" onPress={() => router.back()} variant="ghost" />}
      />

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
                {r.code || "(no code)"}
              </Text>
              {r.description ? (
                <Text style={{ color: colors.faint, fontSize: 12, marginTop: 4 }} numberOfLines={2}>{r.description}</Text>
              ) : null}
            </View>
            <Pill text={r.active === false ? "inactive" : "active"} tone={r.active === false ? "slate" : "success"} />
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Button title="Edit" onPress={() => openEdit(r)} variant="secondary" />
            <Button title={r.active === false ? "Already off" : "Disable"} onPress={() => softDelete(r)} variant="danger" disabled={r.active === false} />
          </View>
        </Card>
      ))}

      {!loading && rows.length === 0 ? (
        <EmptyState title="No subjects" body="Tap '+ New subject' to add your first one." />
      ) : null}

      <Modal visible={modalOpen} animationType="slide" transparent={false} onRequestClose={close}>
        <Screen>
          <Header
            title={editing ? "Edit subject" : "New subject"}
            action={<Button title="Cancel" onPress={close} variant="ghost" />}
          />
          <Card>
            <Input label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} editable={!saving} />
            <Input label="Code" value={form.code} onChangeText={(v) => setForm({ ...form, code: v })} editable={!saving} />
            <Input label="Description" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline editable={!saving} />
            {editing ? (
              <Pressable
                onPress={() => setForm({ ...form, active: !form.active })}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}
              >
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
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderColor: colors.border,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
});
