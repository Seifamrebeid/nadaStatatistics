import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../firebase";
import api from "../services/api";
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
      // Role-mismatch gate. Calls /api/me, compares role to APP_ROLE.
      try {
        const { data } = await api.get("/api/me");
        const role = Array.isArray(data.role) ? data.role[0] : data.role;
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
            uid:       unwrap(data.uid),
            role:      role,
            linked_id: unwrap(data.linked_id),
            email:     unwrap(data.email),
          });
        }
      } catch (err) {
        await signOut(auth);
        setMismatchError(`Sign-in failed: ${err.response?.data?.error || err.message}`);
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

function unwrap(v) { return Array.isArray(v) ? v[0] : v; }
