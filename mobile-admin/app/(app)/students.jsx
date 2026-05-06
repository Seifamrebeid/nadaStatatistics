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
import { useRouter } from "expo-router";
import { auth } from "../../firebase";
import axios from "axios";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function StudentsScreen() {
  const router = useRouter();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const res = await axios.get(`${API_URL}/api/students`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStudents(res.data);
    } catch (error) {
      Alert.alert("Error", "Failed to fetch students");
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
        <Text style={styles.title}>Students ({students.length})</Text>
        <TouchableOpacity
          onPress={() => router.push("/(app)/students/create")}
          style={styles.addButton}
        >
          <Text style={styles.addButtonText}>+ New</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={students}
        keyExtractor={(item) => item.student_id || item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.studentCard}
            onPress={() =>
              router.push({
                pathname: "/(app)/students/[id]",
                params: { id: item.student_id || item.id },
              })
            }
          >
            <Text style={styles.studentName}>{item.name}</Text>
            <Text style={styles.studentEmail}>{item.email}</Text>
            <Text style={styles.studentId}>
              ID: {item.student_id || item.id}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No students found</Text>
          </View>
        }
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
    justifyContent: "space-between",
    alignItems: "center",
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
  },
  addButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#007AFF",
    borderRadius: 6,
  },
  addButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  studentCard: {
    margin: 10,
    padding: 15,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#eee",
  },
  studentName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  studentEmail: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  studentId: {
    fontSize: 12,
    color: "#999",
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
