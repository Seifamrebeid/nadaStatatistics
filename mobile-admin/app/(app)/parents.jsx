/**
 * Admin parents — full CRUD. Creating a new parent:
 *   1. createUserWithEmailAndPassword in Firebase Auth (auto-generates pw if blank)
 *   2. addDoc("parents") with linked_student_ids + active=true
 *   3. setDoc("users/{newUid}", { uid, role: "parent", linked_id, email })
 *
 * Caveat: Firebase web SDK's createUserWithEmailAndPassword signs the new user in.
 * After create we sign them out and require the admin to re-authenticate. The web
 * version has the same caveat; we just show a clearer notice.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import {
  addDoc, collection, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import {
  Button, Card, EmptyState, Header, Input, Pill, Screen, colors, styles,
} from "../../components/ui";

const BLANK = {
  name: "", email: "", password: "",
  relationship: "parent", linked_student_ids: [], active: true,
};

function generatePassword() {
  return Math.random().toString(36).slice(2, 10) + "!A1";
}

export default function AdminParents() {
  const [rows, setRows] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [studentFilter, setStudentFilter] = useState("");
  const [createdPw, setCreatedPw] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [pSnap, stSnap] = await Promise.all([
        getDocs(collection(db, "parents")),
        getDocs(query(collection(db, "students"), where("active", "==", true))),
      ]);
      const parents = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      parents.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setRows(parents);
      setStudents(stSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const studentMap = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s.name || s.id])), [students]);

  function openCreate() { setEditing(null); setForm({ ...BLANK }); setStudentFilter(""); setCreatedPw(null); setModalOpen(true); }
  function openEdit(r) {
    setEditing(r);
    setForm({
      name: r.name || "", email: r.email || "", password: "",
      relationship: r.relationship || "parent",
      linked_student_ids: r.linked_student_ids || [],
      active: r.active !== false,
    });
    setStudentFilter(""); setCreatedPw(null); setModalOpen(true);
  }
  function close() { setModalOpen(false); setEditing(null); setForm(BLANK); setCreatedPw(null); }

  function toggleStudent(id) {
    setForm((p) => {
      const set = new Set(p.linked_student_ids);
      set.has(id) ? set.delete(id) : set.add(id);
      return { ...p, linked_student_ids: [...set] };
    });
  }

  async function save() {
    if (!form.name.trim() || !form.email.trim()) { Alert.alert("Missing", "Name and email are required."); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, "parents", editing.id), {
          name: form.name.trim(), email: form.email.trim(),
          relationship: form.relationship,
          linked_student_ids: form.linked_student_ids,
          active: !!form.active,
        });
        close(); load();
      } else {
        const pw = form.password.trim() || generatePassword();
        // 1. Create auth user (this signs the new user in)
        const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), pw);
        const newUid = cred.user.uid;
        // 2. Create parent doc
        const parentRef = await addDoc(collection(db, "parents"), {
          name: form.name.trim(), email: form.email.trim(),
          relationship: form.relationship,
          linked_student_ids: form.linked_student_ids,
          active: true, created_at: serverTimestamp(),
        });
        // 3. Link in /users
        await setDoc(doc(db, "users", newUid), {
          uid: newUid, role: "parent", linked_id: parentRef.id, email: form.email.trim(),
        });
        // 4. Sign the new user out — admin will need to re-login
        await signOut(auth);
        setCreatedPw(pw);
        load();
        Alert.alert(
          "Parent created",
          `Password: ${pw}\n\nYou've been signed out (Firebase web SDK limitation). Please log in again as admin.`,
          [{ text: "OK", onPress: () => router.replace("/(auth)/login") }],
        );
      }
    } catch (e) { Alert.alert("Save failed", e.message); }
    finally { setSaving(false); }
  }

  async function softDelete(r) {
    Alert.alert("Disable parent?", `${r.name} will be hidden.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Disable", style: "destructive", onPress: async () => {
        try { await updateDoc(doc(db, "parents", r.id), { active: false }); load(); }
        catch (e) { Alert.alert("Failed", e.message); }
      }},
    ]);
  }

  const filteredStudents = useMemo(() => {
    const t = studentFilter.trim().toLowerCase();
    if (!t) return students;
    return students.filter((s) =>
      (s.name || "").toLowerCase().includes(t) || (s.id || "").toLowerCase().includes(t)
    );
  }, [students, studentFilter]);

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header title="Parents" subtitle="Parent accounts and child links" action={<Button title="Back" onPress={() => router.back()} variant="ghost" />} />

      {err ? (
        <Card style={{ borderColor: colors.danger, backgroundColor: "#fef2f2" }}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Error</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{err}</Text>
        </Card>
      ) : null}

      <Button title="+ New parent" onPress={openCreate} />

      {rows.map((r) => {
        const children = (r.linked_student_ids || []).map((sid) => studentMap[sid] || sid);
        return (
          <Card key={r.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.emptyTitle}>{r.name}</Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{r.email}</Text>
                <Text style={{ color: colors.faint, fontSize: 11, marginTop: 4 }}>
                  {r.relationship || "parent"} • {children.length} child{children.length === 1 ? "" : "ren"}
                </Text>
                {children.length > 0 ? (
                  <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }} numberOfLines={2}>
                    {children.join(", ")}
                  </Text>
                ) : null}
              </View>
              <Pill text={r.active === false ? "inactive" : "active"} tone={r.active === false ? "slate" : "success"} />
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Button title="Edit" onPress={() => openEdit(r)} variant="secondary" />
              <Button title={r.active === false ? "Off" : "Disable"} onPress={() => softDelete(r)} variant="danger" disabled={r.active === false} />
            </View>
          </Card>
        );
      })}

      {!loading && rows.length === 0 ? <EmptyState title="No parents" body="Tap '+ New parent' to create the first one." /> : null}

      <Modal visible={modalOpen} animationType="slide" onRequestClose={close}>
        <Screen>
          <Header title={editing ? "Edit parent" : "New parent"} action={<Button title="Cancel" onPress={close} variant="ghost" />} />
          <Card>
            <Input label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} editable={!saving} />
            <Input label="Email" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} editable={!saving && !editing} keyboardType="email-address" autoCapitalize="none" />
            <Input label="Relationship" value={form.relationship} onChangeText={(v) => setForm({ ...form, relationship: v })} editable={!saving} placeholder="parent / guardian / etc" />
            {!editing ? (
              <Input label="Password (leave blank to auto-generate)" value={form.password} onChangeText={(v) => setForm({ ...form, password: v })} secureTextEntry editable={!saving} />
            ) : null}

            {editing ? (
              <Pressable onPress={() => setForm({ ...form, active: !form.active })} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, marginBottom: 8 }}>
                <View style={[local.checkbox, form.active && local.checkboxActive]}>
                  {form.active ? <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>✓</Text> : null}
                </View>
                <Text style={{ color: colors.ink, fontWeight: "600" }}>Active</Text>
              </Pressable>
            ) : null}

            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginTop: 6 }}>
              LINKED CHILDREN ({form.linked_student_ids.length})
            </Text>
            <Input value={studentFilter} onChangeText={setStudentFilter} placeholder="Search students…" autoCapitalize="none" />
            <View style={{ maxHeight: 320, gap: 4 }}>
              {filteredStudents.slice(0, 40).map((s) => {
                const checked = form.linked_student_ids.includes(s.id);
                return (
                  <Pressable key={s.id} onPress={() => toggleStudent(s.id)} style={local.studentRow}>
                    <View style={[local.checkbox, checked && local.checkboxActive]}>
                      {checked ? <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>✓</Text> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>{s.name || s.id}</Text>
                      <Text style={{ color: colors.faint, fontSize: 11 }} numberOfLines={1}>{s.email || s.id}</Text>
                    </View>
                  </Pressable>
                );
              })}
              {filteredStudents.length > 40 ? (
                <Text style={{ color: colors.faint, fontSize: 12, textAlign: "center", marginTop: 6 }}>
                  Showing first 40 of {filteredStudents.length}.
                </Text>
              ) : null}
            </View>

            {!editing ? (
              <Text style={{ color: colors.warning, fontSize: 12, marginTop: 12, lineHeight: 18 }}>
                Note: creating a parent will sign you out (Firebase web SDK limitation). You'll be redirected to login after.
              </Text>
            ) : null}

            <Button title={saving ? "Saving…" : "Save"} onPress={save} busy={saving} />
          </Card>
        </Screen>
      </Modal>
    </Screen>
  );
}

const local = StyleSheet.create({
  checkbox: { width: 22, height: 22, borderRadius: 6, borderColor: colors.border, borderWidth: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff" },
  checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  studentRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomColor: colors.border, borderBottomWidth: 1 },
});
