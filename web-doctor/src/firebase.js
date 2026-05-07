import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Cloud Firebase project — shared across all six frontend apps.
const firebaseConfig = {
  apiKey: "AIzaSyAqNZKRY002a7KWct5qQLhz0hBHzRIxpXo",
  authDomain: "fridgechef-jt50c.firebaseapp.com",
  databaseURL: "https://fridgechef-jt50c-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "fridgechef-jt50c",
  storageBucket: "fridgechef-jt50c.firebasestorage.app",
  messagingSenderId: "975789258089",
  appId: "1:975789258089:web:49f21ec3da6a11bce939f8",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
