import React, { useCallback, useMemo, useState } from "react";
import { Alert, Modal, Pressable, RefreshControl, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import { Button, Card, EmptyState, Header, Input, Screen, colors, styles } from "../../components/ui";

const emptyForm = {
  title: "",
  date: "",
  status: "scheduled",
};

export default function DoctorLecturesScreen() {
  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(undefined);
  const [doctorId, setDoctorId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) { setLoading(false); return; }

      const userSnap = await getDoc(doc(db, "users", user.uid));
      const linkedId = userSnap.exists() ? userSnap.data().linked_id : null;
      setDoctorId(linkedId);

      if (!linkedId) { setLoading(false); return; }

      const lecSnap = await getDocs(
        query(collection(db, "lectures"), where("doctor_id", "==", linkedId))
      );
      setLectures(lecSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (error) {
      Alert.alert("Lectures error", error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const sorted = useMemo(
    () => [...lectures].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))),
    [lectures],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
  };

  const openEdit = (lecture) => {
    setEditing(lecture);
    setForm({
      title: lecture.title || "",
      date: lecture.date || "",
      status: lecture.status || "scheduled",
    });
  };

  const closeForm = () => {
    setEditing(undefined);
    setForm(emptyForm);
  };

  const save = async () => {
    if (!form.title) {
      Alert.alert("Missing title", "Add a lecture title.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, "lectures", editing.id), {
          title: form.title,
          date: form.date,
          status: form.status,
        });
      } else {
        await addDoc(collection(db, "lectures"), {
          title: form.title,
          doctor_id: doctorId,
          date: form.date,
          status: form.status || "scheduled",
          enrolled_student_ids: [],
          created_at: serverTimestamp(),
        });
      }
      closeForm();
      load();
    } catch (error) {
      Alert.alert("Save failed", error.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = (lecture) => {
    Alert.alert("Delete lecture", "Delete this lecture?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await updateDoc(doc(db, "lectures", lecture.id), { active: false });
            load();
          } catch (error) {
            Alert.alert("Delete failed", error.message);
          }
        },
      },
    ]);
  };

  return (
    <>
      <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <Header title="Lectures" subtitle="Create and manage your lecture sessions" action={<Button title="New" onPress={openCreate} />} />
        {sorted.length ? (
          sorted.map((lecture) => (
            <Card key={lecture.id}>
              <Text style={styles.emptyTitle}>{lecture.title || "Lecture"}</Text>
              <Text style={{ color: colors.muted, marginTop: 5 }}>
                {[lecture.date, lecture.status].filter(Boolean).join(" | ")}
              </Text>
              <Text style={{ color: colors.primary, marginTop: 6, fontWeight: "700" }}>
                {lecture.status || "scheduled"}
              </Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <Button title="Edit" onPress={() => openEdit(lecture)} variant="secondary" />
                <Button title="Delete" onPress={() => remove(lecture)} variant="danger" />
              </View>
            </Card>
          ))
        ) : (
          <EmptyState title="No lectures yet" body="Create your first lecture session." />
        )}
      </Screen>

      <Modal visible={editing !== undefined} animationType="slide" onRequestClose={closeForm}>
        <Screen>
          <Header title={editing ? "Edit Lecture" : "New Lecture"} action={<Button title="Close" onPress={closeForm} variant="secondary" />} />
          <Card>
            <Input label="Title" value={form.title} onChangeText={(title) => setForm({ ...form, title })} />
            <Input
              label="Date"
              value={form.date}
              onChangeText={(date) => setForm({ ...form, date })}
              placeholder="2026-05-06T09:00:00"
            />
            <Input label="Status" value={form.status} onChangeText={(status) => setForm({ ...form, status })} />
            <Button title={saving ? "Saving..." : "Save lecture"} onPress={save} disabled={saving} />
          </Card>
          <Pressable onPress={closeForm} style={{ alignItems: "center", padding: 10 }}>
            <Text style={{ color: colors.muted }}>Cancel</Text>
          </Pressable>
        </Screen>
      </Modal>
    </>
  );
}
