/**
 * Admin weeks — full CRUD on weeks/{id}. Admin sees all weeks (no doctor filter).
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
} from "../../components/admin/ui";

const STATUS_OPTIONS = ["planned", "recording", "finished"];
const STATUS_TONE = { planned: "info", recording: "danger", finished: "success" };

const BLANK = {
  class_id: "", week_number: "", title: "", date: "",
  lecture_id: "", status: "planned", notes: "", active: true,
};

export default function AdminWeeks() {
  const [user, setUser] = useState(null);
  const [classes, setClasses] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [filterClass, setFilterClass] = useState("");

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
      const [cSnap, wSnap, lSnap] = await Promise.all([
        getDocs(collection(db, "classes")),
        getDocs(collection(db, "weeks")),
        getDocs(collection(db, "lectures")),
      ]);
      const cls = cSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const wks = wSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      wks.sort((a, b) => {
        const ca = cls.find((c) => c.id === a.class_id)?.name || "";
        const cb = cls.find((c) => c.id === b.class_id)?.name || "";
        if (ca !== cb) return ca.localeCompare(cb);
        return (a.week_number ?? 0) - (b.week_number ?? 0);
      });
      setClasses(cls);
      setRows(wks);
      setLectures(lSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const classMap = useMemo(() => Object.fromEntries(classes.map((c) => [c.id, c.name || c.id])), [classes]);
  const displayed = useMemo(() => filterClass ? rows.filter((r) => r.class_id === filterClass) : rows, [rows, filterClass]);

  function openCreate() { setEditing(null); setForm({ ...BLANK, class_id: classes[0]?.id || "" }); setModalOpen(true); }
  function openEdit(r) {
    setEditing(r);
    setForm({
      class_id: r.class_id || "", week_number: r.week_number != null ? String(r.week_number) : "",
      title: r.title || "", date: r.date || "", lecture_id: r.lecture_id || "",
      status: r.status || "planned", notes: r.notes || "", active: r.active !== false,
    });
    setModalOpen(true);
  }
  function close() { setModalOpen(false); setEditing(null); setForm(BLANK); }

  async function save() {
    if (!form.class_id || !form.week_number) { Alert.alert("Missing", "Class and week number are required."); return; }
    setSaving(true);
    try {
      const payload = {
        class_id: form.class_id, week_number: Number(form.week_number),
        title: form.title.trim(), date: form.date.trim(),
        lecture_id: form.lecture_id || null, status: form.status,
        notes: form.notes.trim(), active: !!form.active,
      };
      if (editing) await updateDoc(doc(db, "weeks", editing.id), payload);
      else await addDoc(collection(db, "weeks"), { ...payload, active: true, created_by: user?.uid || null, created_at: serverTimestamp() });
      close(); load();
    } catch (e) { Alert.alert("Save failed", e.message); }
    finally { setSaving(false); }
  }

  async function softDelete(r) {
    Alert.alert("Disable week?", `Week ${r.week_number} will be hidden.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Disable", style: "destructive", onPress: async () => {
        try { await updateDoc(doc(db, "weeks", r.id), { active: false }); load(); }
        catch (e) { Alert.alert("Failed", e.message); }
      }},
    ]);
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header title="Weeks" subtitle="All weeks across classes" action={<Button title="Back" onPress={() => router.back()} variant="ghost" />} />

      {err ? (
        <Card style={{ borderColor: colors.danger, backgroundColor: "#fef2f2" }}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Error</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{err}</Text>
        </Card>
      ) : null}

      <Button title="+ New week" onPress={openCreate} disabled={classes.length === 0} />

      <Card>
        <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 }}>FILTER BY CLASS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 6 }}>
          <Pressable onPress={() => setFilterClass("")} style={[local.chip, !filterClass && local.chipActive]}>
            <Text style={[local.chipText, !filterClass && local.chipTextActive]}>All</Text>
          </Pressable>
          {classes.map((c) => (
            <Pressable key={c.id} onPress={() => setFilterClass(c.id)} style={[local.chip, filterClass === c.id && local.chipActive]}>
              <Text style={[local.chipText, filterClass === c.id && local.chipTextActive]} numberOfLines={1}>{c.name || c.id}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Card>

      {displayed.map((r) => (
        <Card key={r.id}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.emptyTitle}>Week {r.week_number} · {r.title || "—"}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{classMap[r.class_id] || r.class_id}</Text>
              <Text style={{ color: colors.faint, fontSize: 11, marginTop: 4 }}>
                {r.date || "no date"} • lecture: {r.lecture_id || "—"}
              </Text>
            </View>
            <Pill text={r.status || "planned"} tone={STATUS_TONE[r.status] || "slate"} />
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Button title="Edit" onPress={() => openEdit(r)} variant="secondary" />
            <Button title={r.active === false ? "Off" : "Disable"} onPress={() => softDelete(r)} variant="danger" disabled={r.active === false} />
          </View>
        </Card>
      ))}

      {!loading && displayed.length === 0 ? <EmptyState title="No weeks" body="Add a week with '+ New week' above." /> : null}

      <Modal visible={modalOpen} animationType="slide" onRequestClose={close}>
        <Screen>
          <Header title={editing ? "Edit week" : "New week"} action={<Button title="Cancel" onPress={close} variant="ghost" />} />
          <Card>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 }}>CLASS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 6, marginBottom: 8 }}>
              {classes.map((c) => (
                <Pressable key={c.id} onPress={() => setForm({ ...form, class_id: c.id })}
                  style={[local.chip, form.class_id === c.id && local.chipActive]}>
                  <Text style={[local.chipText, form.class_id === c.id && local.chipTextActive]} numberOfLines={1}>{c.name || c.id}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Input label="Week number" value={form.week_number} onChangeText={(v) => setForm({ ...form, week_number: v })} keyboardType="number-pad" editable={!saving} />
            <Input label="Title" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} editable={!saving} />
            <Input label="Date (YYYY-MM-DD)" value={form.date} onChangeText={(v) => setForm({ ...form, date: v })} editable={!saving} />

            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginTop: 4 }}>LINKED LECTURE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 6, marginBottom: 8 }}>
              <Pressable onPress={() => setForm({ ...form, lecture_id: "" })} style={[local.chip, !form.lecture_id && local.chipActive]}>
                <Text style={[local.chipText, !form.lecture_id && local.chipTextActive]}>None</Text>
              </Pressable>
              {lectures.map((l) => (
                <Pressable key={l.id} onPress={() => setForm({ ...form, lecture_id: l.id })}
                  style={[local.chip, form.lecture_id === l.id && local.chipActive]}>
                  <Text style={[local.chipText, form.lecture_id === l.id && local.chipTextActive]} numberOfLines={1}>{l.title || l.id}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 }}>STATUS</Text>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 6, marginBottom: 8 }}>
              {STATUS_OPTIONS.map((s) => (
                <Pressable key={s} onPress={() => setForm({ ...form, status: s })}
                  style={[local.chip, form.status === s && local.chipActive]}>
                  <Text style={[local.chipText, form.status === s && local.chipTextActive]}>{s}</Text>
                </Pressable>
              ))}
            </View>

            <Input label="Notes" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} multiline editable={!saving} />

            {editing ? (
              <Pressable onPress={() => setForm({ ...form, active: !form.active })} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
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
  chipText: { color: colors.ink, fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  chipTextActive: { color: "#ffffff" },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderColor: colors.border, borderWidth: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff" },
  checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
});
