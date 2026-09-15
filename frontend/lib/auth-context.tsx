"use client";
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import {
  loginUser,
  registerUser,
  getMe,
  onAccessTokenRefreshed,
  ACCESS_TOKEN_STORAGE_KEY,
  REFRESH_TOKEN_STORAGE_KEY,
} from "./api";

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
  /**
   * Reads the token from a ref instead of the reactive `token` above.
   * Use this inside a callback that might run as an AuthGate
   * `requireAuth` retry (e.g. right after a guest logs in) -- a plain
   * closure over `token` was captured on the pre-login render and would
   * still see it as null even after login resolves, since React hasn't
   * re-rendered that closure's scope yet. getToken() always dereferences
   * the current value.
   */
  getToken: () => string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);

  function setTokenEverywhere(next: string | null) {
    tokenRef.current = next;
    setToken(next);
  }

  useEffect(() => {
    const stored = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    if (stored) {
      setTokenEverywhere(stored);
      getMe(stored)
        .then(setUser)
        .catch(() => {
          localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
          localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
          setTokenEverywhere(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Keeps this context's token in sync when lib/api.ts silently
    // refreshes an expired access token behind the scenes (on a 401).
    return onAccessTokenRefreshed((newToken) => {
      setTokenEverywhere(newToken);
    });
  }, []);

  async function login(email: string, password: string) {
    const tokens = await loginUser({ email, password });
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, tokens.access_token);
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, tokens.refresh_token);
    setTokenEverywhere(tokens.access_token);
    const me = await getMe(tokens.access_token);
    setUser(me);
  }

  async function register(email: string, username: string, password: string) {
    await registerUser({ email, username, password });
    await login(email, password);
  }

  function logout() {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    setTokenEverywhere(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: !!token,
        loading,
        login,
        register,
        logout,
        getToken: () => tokenRef.current,
      }}
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
