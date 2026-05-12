import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, signOutUser } from "../firebase";
import { useRole, VALID_ROLES } from "../context/RoleContext";

export default function AppIndex() {
  const router = useRouter();
  const { role, setRole, hydrated } = useRole();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!hydrated) return;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setChecking(false);
        router.replace("/(auth)/login");
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const dbRole = snap.exists() ? snap.data()?.role : null;
        // If the stored role conflicts with the auth user's actual role, sign out.
        if (role && dbRole && role !== dbRole) {
          await signOutUser();
          setRole(null);
          router.replace("/(auth)/login");
          return;
        }
        const effective = role || dbRole;
        if (!effective || !VALID_ROLES.includes(effective)) {
          await signOutUser();
          setRole(null);
          router.replace("/(auth)/login");
          return;
        }
        if (effective !== role) await setRole(effective);
        router.replace(`/(${effective})`);
      } catch {
        router.replace("/(auth)/login");
      } finally {
        setChecking(false);
      }
    });
    return unsubscribe;
  }, [hydrated]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc" }}>
      <ActivityIndicator size="large" color="#4f46e5" />
    </View>
  );
}
