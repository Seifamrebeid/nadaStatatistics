import { initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  inMemoryPersistence,
  initializeAuth,
  signOut,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";

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
} catch {
  auth = getAuth(app);
}

export { auth };
export const db = getFirestore(app);
export const storage = getStorage(app);

const emulatorHost = process.env.EXPO_PUBLIC_FIREBASE_HOST || "172.20.10.2";
const authHost = process.env.EXPO_PUBLIC_FIREBASE_AUTH_HOST || emulatorHost;
const firestoreHost =
  process.env.EXPO_PUBLIC_FIRESTORE_HOST || emulatorHost;
const storageHost =
  process.env.EXPO_PUBLIC_STORAGE_HOST || emulatorHost;

if (process.env.NODE_ENV !== "production") {
  if (!auth.emulatorConfig) {
    connectAuthEmulator(auth, `http://${authHost}:9099`, {
      disableWarnings: true,
    });
  }
  if (!db.emulatorConfig) {
    connectFirestoreEmulator(db, firestoreHost, 8080);
  }
  if (!storage.emulatorConfig) {
    connectStorageEmulator(storage, storageHost, 9199);
  }
}

export const signOutUser = () => signOut(auth);
