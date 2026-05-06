import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { auth } from "../../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import axios from "axios";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function AdminHomeScreen() {
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        fetchDashboardData(currentUser);
      } else {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const fetchDashboardData = async (currentUser) => {
    try {
      const token = await currentUser.getIdToken();
      const res = await axios.get(`${API_URL}/health`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(res.data);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/(auth)/login");
    } catch (error) {
      Alert.alert("Logout Failed", error.message);
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
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Admin Dashboard</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {user && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome, {user.email}</Text>
          <Text style={styles.cardSubtitle}>Admin Portal</Text>
        </View>
      )}

      {stats && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>API Status</Text>
          <Text style={styles.cardText}>Status: {stats.status}</Text>
          <Text style={styles.cardText}>Mode: {stats.mode}</Text>
          <Text style={styles.cardText}>Project: {stats.project}</Text>
        </View>
      )}

      <View style={styles.menuSection}>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => router.push("/(app)/students")}
        >
          <Text style={styles.menuItemText}>👥 Manage Students</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => router.push("/(app)/doctors")}
        >
          <Text style={styles.menuItemText}>👨‍⚕️ Manage Doctors</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => router.push("/(app)/admins")}
        >
          <Text style={styles.menuItemText}>⚙️ Manage Admins</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => router.push("/(app)/lectures")}
        >
          <Text style={styles.menuItemText}>📚 Manage Lectures</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
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
    padding: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#ff3b30",
    borderRadius: 6,
  },
  logoutButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  card: {
    margin: 15,
    padding: 15,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#eee",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 14,
    color: "#666",
  },
  cardText: {
    fontSize: 14,
    color: "#555",
    marginTop: 4,
  },
  menuSection: {
    margin: 15,
  },
  menuItem: {
    paddingVertical: 16,
    paddingHorizontal: 15,
    backgroundColor: "#fff",
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#eee",
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#007AFF",
  },
});
