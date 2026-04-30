import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import api from "../lib/api";
import { supabase } from "../lib/supabase";
import type { UserData } from "../types/auth";

interface AuthContextType {
  user: UserData | null;
  role: string | null;
  loading: boolean;
  login: (userData: UserData) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restore = async () => {
      const stored = localStorage.getItem("readlab_user");
      if (stored) {
        const parsed: UserData = JSON.parse(stored);
        try {
          const { data: { session } } = await supabase.auth.setSession({
            access_token: parsed.access_token,
            refresh_token: parsed.refresh_token,
          });
          if (session) {
            const updated: UserData = {
              ...parsed,
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            };
            localStorage.setItem("readlab_user", JSON.stringify(updated));
            setUser(updated);
          } else {
            setUser(parsed);
          }
          setRole(parsed.role);
        } catch {
          localStorage.removeItem("readlab_user");
        }
      }
      setLoading(false);
    };
    restore();
  }, []);

  const login = async (userData: UserData) => {
    await supabase.auth.setSession({
      access_token: userData.access_token,
      refresh_token: userData.refresh_token,
    });
    localStorage.setItem("readlab_user", JSON.stringify(userData));
    setUser(userData);
    setRole(userData.role);
  };

  const logout = async () => {
    await supabase.auth.signOut();
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

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
