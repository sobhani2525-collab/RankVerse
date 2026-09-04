"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { loginUser, registerUser, getMe } from "./api";

interface User {
  id: string;
  email: string;
  username: string;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("rankverse_token");
    if (stored) {
      setToken(stored);
      getMe(stored)
        .then(setUser)
        .catch(() => {
          localStorage.removeItem("rankverse_token");
          localStorage.removeItem("rankverse_refresh_token");
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  async function login(email: string, password: string) {
    const tokens = await loginUser({ email, password });
    localStorage.setItem("rankverse_token", tokens.access_token);
    localStorage.setItem("rankverse_refresh_token", tokens.refresh_token);
    setToken(tokens.access_token);
    const me = await getMe(tokens.access_token);
    setUser(me);
  }

  async function register(email: string, username: string, password: string) {
    await registerUser({ email, username, password });
    await login(email, password);
  }

  function logout() {
    localStorage.removeItem("rankverse_token");
    localStorage.removeItem("rankverse_refresh_token");
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ token, user, isAuthenticated: !!token, loading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
