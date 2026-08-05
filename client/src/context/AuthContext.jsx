import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
const AuthContext = createContext(undefined);
export function AuthProvider({
  children
}) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const me = await api.get("/auth/me");
      setUser(me);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
      } else {
        setUser(null);
      }
    }
  }, []);
  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);
  const login = useCallback(async (email, password) => {
    const data = await api.post("/auth/login", {
      email,
      password
    });
    await refresh();
    return data;
  }, [refresh]);
  const register = useCallback(async (name, email, password) => {
    await api.post("/auth/register", {
      name,
      email,
      password
    });
    await refresh();
  }, [refresh]);
  const logout = useCallback(async () => {
    await api.post("/auth/logout");
    setUser(null);
  }, []);
  return <AuthContext.Provider value={{
    user,
    loading,
    login,
    register,
    logout,
    refresh
  }}>
      {children}
    </AuthContext.Provider>;
}
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
