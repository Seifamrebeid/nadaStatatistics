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
import { getDoctors } from "../../api";

export default function DoctorsScreen() {
  const router = useRouter();
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    React.useCallback(() => {
      fetchDoctors();
    }, [])
  );

  const fetchDoctors = async () => {
    try {
      const response = await getDoctors();
      setDoctors(response.data);
    } catch (error) {
      Alert.alert("Error", "Failed to fetch doctors");
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
        <Text style={styles.title}>Doctors ({doctors.length})</Text>
        <TouchableOpacity
          onPress={() => router.push("/(app)/doctors/create")}
          style={styles.addButton}
        >
          <Text style={styles.addButtonText}>+ New</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={doctors}
        keyExtractor={(item) => item.doctor_id || item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() =>
              router.push({
                pathname: "/(app)/doctors/[id]",
                params: { id: item.doctor_id || item.id },
              })
            }
          >
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.email}>{item.email}</Text>
            {item.department && (
              <Text style={styles.department}>Dept: {item.department}</Text>
            )}
            <Text style={styles.id}>
              ID: {item.doctor_id || item.id}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No doctors found</Text>
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
    borderLeftColor: "#007AFF",
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  email: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  department: {
    fontSize: 13,
    color: "#888",
    marginTop: 4,
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
