import React, { useCallback, useMemo, useState } from "react";
import { Alert, Modal, Pressable, RefreshControl, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { createLecture, deleteLecture, getLectures, normalize, updateLecture } from "../../api";
import { Button, Card, EmptyState, Header, Input, Screen, colors, styles } from "../../components/ui";

const emptyForm = {
  title: "",
  subject_name: "",
  class_name: "",
  scheduled_at: "",
  status: "scheduled",
};

export default function DoctorLecturesScreen() {
  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(undefined);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLectures((await getLectures()).map(normalize));
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
    () => [...lectures].sort((a, b) => String(b.scheduled_at || "").localeCompare(String(a.scheduled_at || ""))),
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
      subject_name: lecture.subject_name || "",
      class_name: lecture.class_name || "",
      scheduled_at: lecture.scheduled_at || lecture.date || "",
      status: lecture.status || "scheduled",
    });
  };

  const closeForm = () => {
    setEditing(undefined);
    setForm(emptyForm);
  };

  const save = async () => {
    if (!form.title && !form.subject_name) {
      Alert.alert("Missing title", "Add a lecture title or subject.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateLecture(editing.id || editing.lecture_id, form);
      } else {
        await createLecture(form);
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
            await deleteLecture(lecture.id || lecture.lecture_id);
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
            <Card key={lecture.id || lecture.lecture_id}>
              <Text style={styles.emptyTitle}>{lecture.title || lecture.subject_name || "Lecture"}</Text>
              <Text style={{ color: colors.muted, marginTop: 5 }}>
                {[lecture.class_name, lecture.week_name, lecture.scheduled_at || lecture.date].filter(Boolean).join(" | ")}
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
            <Input label="Subject" value={form.subject_name} onChangeText={(subject_name) => setForm({ ...form, subject_name })} />
            <Input label="Class" value={form.class_name} onChangeText={(class_name) => setForm({ ...form, class_name })} />
            <Input label="Scheduled at" value={form.scheduled_at} onChangeText={(scheduled_at) => setForm({ ...form, scheduled_at })} placeholder="2026-05-06T09:00:00" />
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
