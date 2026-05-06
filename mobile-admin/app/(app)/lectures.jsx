import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { getLectures } from "../../api";

export default function LecturesScreen() {
  const router = useRouter();
  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    React.useCallback(() => {
      fetchLectures();
    }, [])
  );

  const fetchLectures = async () => {
    try {
      const response = await getLectures();
      setLectures(response.data);
    } catch (error) {
      Alert.alert("Error", "Failed to fetch lectures");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Lectures ({lectures.length})</Text>
        <TouchableOpacity
          onPress={() => router.push("/(app)/lectures/create")}
          style={styles.addButton}
        >
          <Text style={styles.addButtonText}>+ New</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={lectures}
        keyExtractor={(item) => item.lecture_id || item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() =>
              router.push({
                pathname: "/(app)/lectures/[id]",
                params: { id: item.lecture_id || item.id },
              })
            }
          >
            <Text style={styles.subject}>{item.subject_name}</Text>
            <Text style={styles.doctor}>
              👨‍⚕️ {item.doctor_name || "N/A"}
            </Text>
            <View style={styles.meta}>
              <Text style={styles.date}>{item.date || "No date"}</Text>
              <Text style={styles.students}>
                {item.enrolled_count || 0} students
              </Text>
            </View>
            <Text style={styles.id}>
              ID: {item.lecture_id || item.id}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No lectures found</Text>
          </View>
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  backButton: {
    fontSize: 16,
    color: "#007AFF",
    fontWeight: "600",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    flex: 1,
    marginLeft: 10,
  },
  addButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  list: {
    padding: 10,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#34C759",
  },
  subject: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  doctor: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  date: {
    fontSize: 13,
    color: "#888",
  },
  students: {
    fontSize: 13,
    color: "#888",
  },
  id: {
    fontSize: 12,
    color: "#aaa",
    marginTop: 4,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 50,
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
  },
});
