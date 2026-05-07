import { initializeApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  connectAuthEmulator,
  inMemoryPersistence,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";

// Phones on Wi-Fi can't reach the laptop's 127.0.0.1; they need the laptop's
// LAN IP. Set EXPO_PUBLIC_EMULATOR_HOST in .env to your laptop's IPv4 (e.g.
// 192.168.1.42). Falls back to localhost so a web preview / iOS simulator
// running on the same machine still works.
const EMULATOR_HOST = process.env.EXPO_PUBLIC_EMULATOR_HOST || "127.0.0.1";

const firebaseConfig = {
  projectId:
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "emotion-detection-dev",
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
  if (!auth.emulatorConfig) {
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, {
      disableWarnings: true,
    });
  }
  if (!db.emulatorConfig) {
    connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
  }
  if (!storage.emulatorConfig) {
    connectStorageEmulator(storage, EMULATOR_HOST, 9199);
  }
}
