/**
 * RoleContext — keeps the role chosen on the login screen across the session.
 *
 * The user picks (admin | doctor | student | parent) on the login page; we
 * persist it to AsyncStorage so a warm start can route straight to the right
 * (role) group without prompting again.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "mobile-unified.selectedRole";

export const VALID_ROLES = ["admin", "doctor", "student", "parent"];

const RoleContext = createContext(null);

export function RoleProvider({ children }) {
  const [role, setRoleState] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored && VALID_ROLES.includes(stored)) setRoleState(stored);
      } catch {
        // ignore
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  const setRole = useCallback(async (next) => {
    setRoleState(next);
    try {
      if (next) await AsyncStorage.setItem(STORAGE_KEY, next);
      else await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const clearRole = useCallback(() => setRole(null), [setRole]);

  const value = useMemo(() => ({ role, setRole, clearRole, hydrated }), [role, setRole, clearRole, hydrated]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  // Fallback: if the provider isn't mounted yet (e.g. fast refresh or a
  // transient render of a child route before _layout has hydrated), return
  // a no-op shape so screens don't crash.
  if (!ctx) {
    return {
      role: null,
      setRole: async () => {},
      clearRole: () => {},
      hydrated: false,
    };
  }
  return ctx;
}
