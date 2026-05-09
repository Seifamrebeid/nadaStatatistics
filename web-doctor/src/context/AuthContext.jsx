import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { APP_ROLE } from "../appRole";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
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
          await signOut(auth);
          setMismatchError("User profile not found.");
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }
        const data = snap.data();
        const role = data.role;
        if (role !== APP_ROLE) {
          await signOut(auth);
          const urls = {
            student: import.meta.env.VITE_STUDENT_URL,
            doctor:  import.meta.env.VITE_DOCTOR_URL,
            admin:   import.meta.env.VITE_ADMIN_URL,
          };
          setMismatchError(
            `This is the ${APP_ROLE} portal. You're signed in as a ${role || "unknown"}.` +
              (urls[role] ? ` Please use ${urls[role]}.` : "")
          );
          setUser(null);
          setProfile(null);
        } else {
          setUser(u);
          setProfile({
            uid:       u.uid,
            role,
            linked_id: data.linked_id ?? null,
            email:     u.email,
          });
        }
      } catch (err) {
        await signOut(auth);
        setMismatchError(`Sign-in failed: ${err.message}`);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, mismatchError, setMismatchError }}>
      {children}
    </AuthContext.Provider>
  );
}
