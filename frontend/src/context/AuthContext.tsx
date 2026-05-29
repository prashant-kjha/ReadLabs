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

// Validates that a parsed localStorage value is shaped like a session before we
// trust it. Guards against corrupted/tampered/garbage stored values. We only
// require the fields the app actually depends on (a role to route on and an
// access token to authenticate with) so the check stays lenient toward the
// real login payload, which is the source of truth for the rest.
function isValidUserData(value: unknown): value is UserData {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.role === "string" && typeof v.access_token === "string";
}

// SECURITY TRADEOFF: auth tokens are stored in localStorage, which is readable by
// any script running on this origin (XSS exposure). The more secure alternative —
// httpOnly cookies — is not feasible in this architecture: the frontend is a
// static SPA served from Cloudflare Pages talking to a *separate* FastAPI API on
// a different origin (Cloud Run), so there is no same-origin backend that can set
// httpOnly cookies for these requests. We mitigate via short-lived access tokens
// + refresh, CSP headers, and dependency hygiene. A full httpOnly-cookie
// migration (e.g. an auth-proxy/BFF on the same origin) is a documented future
// item and is intentionally out of scope here — attempting it now would break login.

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("readlabs_user");
    if (stored) {
      try {
        const candidate: unknown = JSON.parse(stored);
        if (isValidUserData(candidate)) {
          setUser(candidate);
          setRole(candidate.role);
        } else {
          // Corrupted/unexpected shape — clear it so we don't trust it.
          localStorage.removeItem("readlabs_user");
        }
      } catch {
        // Corrupted JSON — clear it instead of hanging.
        localStorage.removeItem("readlabs_user");
      }
    }
    setLoading(false);
  }, []);

  const login = async (userData: UserData) => {
    await supabase.auth.setSession({
      access_token: userData.access_token,
      refresh_token: userData.refresh_token,
    });
    localStorage.setItem("readlabs_user", JSON.stringify(userData));
    setUser(userData);
    setRole(userData.role);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("readlabs_user");
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
