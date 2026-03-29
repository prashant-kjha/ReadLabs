import { createContext, useContext, useState, useEffect } from "react";
import api from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null);
  const [role, setRole]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("readlab_user");
    if (stored) {
      const parsed = JSON.parse(stored);
      setUser(parsed);
      setRole(parsed.role);
      api.defaults.headers.common["Authorization"] = `Bearer ${parsed.access_token}`;
    }
    setLoading(false);
  }, []);

  const login = (userData) => {
    localStorage.setItem("readlab_user", JSON.stringify(userData));
    api.defaults.headers.common["Authorization"] = `Bearer ${userData.access_token}`;
    setUser(userData);
    setRole(userData.role);
  };

  const logout = () => {
    localStorage.removeItem("readlab_user");
    delete api.defaults.headers.common["Authorization"];
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
