/**
 * Doctor classes — CRUD on classes/{id}. Mirrors web-doctor DoctorClasses.
 * Limited to the doctor's subjects. Includes a student picker for enrollment.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import {
  Button, Card, EmptyState, Header, Input, Pill, Screen, colors, styles,
} from "../../components/doctor/ui";

const BLANK = {
  subject_id: "",
  name: "",
  section: "",
  academic_year: String(new Date().getFullYear()),
  term: "",
  enrolled_student_ids: [],
  active: true,
};

export default function DoctorClasses() {
  const [doctorId, setDoctorId] = useState(null);
  const [user, setUser] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [studentFilter, setStudentFilter] = useState("");

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
      const [subjSnap, clsSnap, studSnap] = await Promise.all([
        getDocs(query(collection(db, "subjects"), where("doctor_id", "==", doctorId))),
        getDocs(collection(db, "classes")),
        getDocs(query(collection(db, "students"), where("active", "==", true))),
      ]);
      const mySubjects = subjSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const subjIds = new Set(mySubjects.map((s) => s.id));
      const myClasses = clsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => subjIds.has(c.subject_id));
      myClasses.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setSubjects(mySubjects);
      setStudents(studSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setRows(myClasses);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => { load(); }, [load]);

  const subjectMap = useMemo(() => Object.fromEntries(subjects.map((s) => [s.id, s.name || s.id])), [subjects]);

  function openCreate() {
    setEditing(null);
    setForm({ ...BLANK, subject_id: subjects[0]?.id || "" });
    setStudentFilter("");
    setModalOpen(true);
  }
  function openEdit(r) {
    setEditing(r);
    setForm({
      subject_id: r.subject_id || "",
      name: r.name || "",
      section: r.section || "",
      academic_year: r.academic_year || String(new Date().getFullYear()),
      term: r.term || "",
      enrolled_student_ids: r.enrolled_student_ids || [],
      active: r.active !== false,
    });
    setStudentFilter("");
    setModalOpen(true);
  }
  function close() { setModalOpen(false); setEditing(null); setForm(BLANK); }

  function toggleStudent(id) {
    setForm((prev) => {
      const set = new Set(prev.enrolled_student_ids);
      if (set.has(id)) set.delete(id); else set.add(id);
      return { ...prev, enrolled_student_ids: [...set] };
    });
  }

  async function save() {
    if (!form.subject_id || !form.name.trim()) {
      Alert.alert("Missing fields", "Subject and class name are required.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, "classes", editing.id), {
          subject_id: form.subject_id,
          name: form.name.trim(),
          section: form.section.trim(),
          academic_year: form.academic_year.trim(),
          term: form.term.trim(),
          enrolled_student_ids: form.enrolled_student_ids,
          active: !!form.active,
        });
      } else {
        await addDoc(collection(db, "classes"), {
          subject_id: form.subject_id,
          name: form.name.trim(),
          section: form.section.trim(),
          academic_year: form.academic_year.trim(),
          term: form.term.trim(),
          enrolled_student_ids: form.enrolled_student_ids,
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
    Alert.alert("Disable class?", `${r.name} will be hidden but not deleted.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disable", style: "destructive",
        onPress: async () => {
          try {
            await updateDoc(doc(db, "classes", r.id), { active: false });
            load();
          } catch (e) {
            Alert.alert("Failed", e.message);
          }
        },
      },
    ]);
  }

  const filteredStudents = useMemo(() => {
    const t = studentFilter.trim().toLowerCase();
    if (!t) return students;
    return students.filter((s) =>
      (s.name || "").toLowerCase().includes(t) ||
      (s.id || "").toLowerCase().includes(t) ||
      (s.email || "").toLowerCase().includes(t)
    );
  }, [students, studentFilter]);

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header
        title="Classes"
        subtitle="Classes under your subjects"
        action={<Button title="Back" onPress={() => router.back()} variant="ghost" />}
      />

      {err ? (
        <Card style={{ borderColor: colors.danger, backgroundColor: "#fef2f2" }}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Error</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{err}</Text>
        </Card>
      ) : null}

      <Button title="+ New class" onPress={openCreate} disabled={subjects.length === 0} />
      {subjects.length === 0 ? (
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: -4 }}>
          You need a subject first. Add one from Subjects.
        </Text>
      ) : null}

      {rows.map((r) => (
        <Card key={r.id}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.emptyTitle}>{r.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                {subjectMap[r.subject_id] || r.subject_id} • Section {r.section || "—"}
              </Text>
              <Text style={{ color: colors.faint, fontSize: 11, marginTop: 4 }}>
                {r.academic_year || "—"} • {r.term || "—"} • {(r.enrolled_student_ids || []).length} students
              </Text>
            </View>
            <Pill text={r.active === false ? "inactive" : "active"} tone={r.active === false ? "slate" : "success"} />
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Button title="Edit" onPress={() => openEdit(r)} variant="secondary" />
            <Button title={r.active === false ? "Off" : "Disable"} onPress={() => softDelete(r)} variant="danger" disabled={r.active === false} />
          </View>
        </Card>
      ))}

      {!loading && rows.length === 0 ? (
        <EmptyState title="No classes yet" body="Create your first class by tapping '+ New class' above." />
      ) : null}

      <Modal visible={modalOpen} animationType="slide" transparent={false} onRequestClose={close}>
        <Screen>
          <Header
            title={editing ? "Edit class" : "New class"}
            action={<Button title="Cancel" onPress={close} variant="ghost" />}
          />
          <Card>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 }}>SUBJECT</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 6, marginBottom: 8 }}>
              {subjects.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => setForm({ ...form, subject_id: s.id })}
                  style={[local.chip, form.subject_id === s.id && local.chipActive]}
                >
                  <Text style={[local.chipText, form.subject_id === s.id && local.chipTextActive]} numberOfLines={1}>
                    {s.name || s.id}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Input label="Class name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} editable={!saving} />
            <Input label="Section" value={form.section} onChangeText={(v) => setForm({ ...form, section: v })} editable={!saving} />
            <Input label="Academic year" value={form.academic_year} onChangeText={(v) => setForm({ ...form, academic_year: v })} editable={!saving} />
            <Input label="Term" value={form.term} onChangeText={(v) => setForm({ ...form, term: v })} editable={!saving} />

            {editing ? (
              <Pressable
                onPress={() => setForm({ ...form, active: !form.active })}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, marginBottom: 8 }}
              >
                <View style={[local.checkbox, form.active && local.checkboxActive]}>
                  {form.active ? <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>✓</Text> : null}
                </View>
                <Text style={{ color: colors.ink, fontWeight: "600" }}>Active</Text>
              </Pressable>
            ) : null}

            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginTop: 6 }}>
              ENROLLED ({form.enrolled_student_ids.length})
            </Text>
            <Input value={studentFilter} onChangeText={setStudentFilter} placeholder="Search students…" autoCapitalize="none" />
            <View style={{ maxHeight: 320, gap: 4 }}>
              {filteredStudents.slice(0, 40).map((s) => {
                const checked = form.enrolled_student_ids.includes(s.id);
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
                  Showing first 40 of {filteredStudents.length}. Refine search to see more.
                </Text>
              ) : null}
            </View>

            <Button title={saving ? "Saving…" : "Save"} onPress={save} busy={saving} />
          </Card>
        </Screen>
      </Modal>
    </Screen>
  );
}

const local = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    maxWidth: 220,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#ffffff",
  },
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
  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
});
