"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL ?? "http://localhost:3001";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  age: number | null;
  verifiedGender: string | null;
  elo: number;
  isVIP: boolean;
  freeGenderMatchesLeft: number;
  authProvider: string;
  createdAt: string;
  loginCount?: number;
  lastLoginAt?: string | null;
}

interface RegisterPayload {
  email: string;
  password: string;
  username: string;
  age?: number;
  verified_gender?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterPayload) => Promise<void>;
  googleLogin: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<AuthUser>) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`${SIGNALING_URL}/api/auth/me`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${SIGNALING_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch {}
    if (!res.ok) {
      throw new Error((data && data.detail) || `HTTP ${res.status} ${res.statusText}`);
    }
    if (!data?.user) throw new Error("Invalid server response.");
    setUser(data.user);
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const res = await fetch(`${SIGNALING_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch {}
    if (!res.ok) {
      throw new Error((data && data.detail) || `HTTP ${res.status} ${res.statusText}`);
    }
    if (!data?.user) throw new Error("Invalid server response.");
    setUser(data.user);
  }, []);

  const googleLogin = useCallback(async (idToken: string) => {
    const res = await fetch(`${SIGNALING_URL}/api/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ idToken }),
    });
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch {}
    if (!res.ok) {
      throw new Error((data && data.detail) || `HTTP ${res.status} ${res.statusText}`);
    }
    if (!data?.user) throw new Error("Invalid server response.");
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    await fetch(`${SIGNALING_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
    setUser(null);
  }, []);

  const updateUser = useCallback((patch: Partial<AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : null));
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await fetch(`${SIGNALING_URL}/api/auth/me`, {
      credentials: "include",
      cache: "no-store",
    }).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json().catch(() => null);
    if (data?.user) setUser(data.user);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, login, register, googleLogin, logout, updateUser, refreshUser }),
    [user, isLoading, login, register, googleLogin, logout, updateUser, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
