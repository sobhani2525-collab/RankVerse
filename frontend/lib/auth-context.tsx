"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { loginUser, registerUser } from "./api";

interface AuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("rankverse_token");
    if (stored) setToken(stored);
    setLoading(false);
  }, []);

  async function login(email: string, password: string) {
    const tokens = await loginUser({ email, password });
    localStorage.setItem("rankverse_token", tokens.access_token);
    localStorage.setItem("rankverse_refresh_token", tokens.refresh_token);
    setToken(tokens.access_token);
  }

  async function register(email: string, username: string, password: string) {
    await registerUser({ email, username, password });
    await login(email, password);
  }

  function logout() {
    localStorage.removeItem("rankverse_token");
    localStorage.removeItem("rankverse_refresh_token");
    setToken(null);
  }

  return (
    <AuthContext.Provider
      value={{ token, isAuthenticated: !!token, loading, login, register, logout }}
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
