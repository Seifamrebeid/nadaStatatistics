import { initializeApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  connectAuthEmulator,
  inMemoryPersistence,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";

// Shared Firebase config across all apps. In dev, routes to local emulator.
// In prod, remove the emulator connections (env-based).
const firebaseConfig = {
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "nada-stats-dev",
  apiKey: "fake-api-key-for-emulator",
  authDomain: "localhost",
};

const app = initializeApp(firebaseConfig);
let auth;

try {
  auth = initializeAuth(app, {
    persistence: inMemoryPersistence,
  });
} catch (error) {
  auth = getAuth(app);
}

export { auth };
export const db = getFirestore(app);
export const storage = getStorage(app);

// Dev: connect to emulator suite
const isDev = process.env.NODE_ENV !== "production";
if (isDev) {
  // Avoid double-initialization errors
  if (!auth.emulatorConfig) {
    connectAuthEmulator(auth, "http://172.20.10.2:9099", {
      disableWarnings: true,
    });
  }
  if (!db.emulatorConfig) {
    connectFirestoreEmulator(db, "172.20.10.2", 8080);
  }
  if (!storage.emulatorConfig) {
    connectStorageEmulator(storage, "172.20.10.2", 9199);
  }
}
