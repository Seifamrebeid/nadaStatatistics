import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut as fbSignOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

// Unified auth — supports any role (admin/doctor/student/parent).
// No role lock here; the router decides which routes a given role may visit.

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export const ALLOWED_ROLES = ["admin", "doctor", "student", "parent"];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);   // { uid, role, linked_id, email }
  const [loading, setLoading] = useState(true);
  const [mismatchError, setMismatchError] = useState(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setMismatchError(null);
      if (!u) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (!snap.exists()) {
          await fbSignOut(auth);
          setMismatchError("User profile not found. Contact an administrator.");
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }
        const data = snap.data();
        const role = data.role;
        if (!ALLOWED_ROLES.includes(role)) {
          await fbSignOut(auth);
          setMismatchError(`Unknown role: ${role || "(none)"}. Contact an administrator.`);
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }
        setUser(u);
        setProfile({
          uid:       u.uid,
          role,
          linked_id: data.linked_id ?? null,
          email:     u.email,
          name:      data.name ?? null,
        });
      } catch (err) {
        await fbSignOut(auth);
        setMismatchError(`Sign-in failed: ${err.message}`);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  async function signOut() {
    await fbSignOut(auth);
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, mismatchError, setMismatchError, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
