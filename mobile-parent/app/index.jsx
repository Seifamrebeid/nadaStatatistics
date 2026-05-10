import React, { useEffect } from "react";
import { router } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { Loading } from "../components/ui";

export default function AppIndex() {
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      router.replace(user ? "/(app)" : "/(auth)/login");
    });
    return unsubscribe;
  }, []);

  return <Loading />;
}
