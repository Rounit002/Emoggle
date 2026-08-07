"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

export interface UserProfile {
  isVIP?: boolean;
  elo?: number;
  userId?: string;
  deviceId?: string;
}

const STORAGE_KEY = "emoggle:user-profile";
const DEVICE_ID_KEY = "emoggle:device-id";
const LEGACY_VIP_RECEIPT_KEY = "emoggle:vip-receipt";
const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL ?? "http://localhost:3001";

function getOrCreateDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;

    const newId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Math.random().toString(36).slice(2)}-${Date.now()}`;
    window.localStorage.setItem(DEVICE_ID_KEY, newId);
    return newId;
  } catch {
    return `${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}

function parseProfile(value: string | null): UserProfile | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      // VIP is intentionally not restored from browser-controlled profile data.
      isVIP: false,
      elo:
        typeof parsed.elo === "number" && Number.isFinite(parsed.elo)
          ? parsed.elo
          : undefined,
      userId: typeof parsed.userId === "string" ? parsed.userId : undefined,
      deviceId:
        typeof parsed.deviceId === "string"
          ? parsed.deviceId
          : getOrCreateDeviceId(),
    };
  } catch {
    return null;
  }
}

interface UserProfileContextValue {
  profile: UserProfile | null;
  saveProfile: (profile: UserProfile) => void;
  clearProfile: () => void;
}

const UserProfileContext = createContext<UserProfileContextValue | null>(null);

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    const loaded = parseProfile(window.localStorage.getItem(STORAGE_KEY));
    window.localStorage.removeItem(LEGACY_VIP_RECEIPT_KEY);
    const deviceId = getOrCreateDeviceId();
    const sanitized: UserProfile = {
      ...(loaded ?? {}),
      deviceId,
      isVIP: false,
    };

    // Rewriting the stored object also removes legacy name, birth-date, age,
    // gender, and verification fields from this browser.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    queueMicrotask(() => setProfile(sanitized));

    if (!sanitized.userId) return;

    fetch(
      `${SIGNALING_URL}/api/users/me?id=${encodeURIComponent(sanitized.userId)}`,
      { cache: "no-store" },
    )
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) {
            const cleaned = { ...sanitized, userId: undefined };
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
            setProfile(cleaned);
          }
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        const currentDeviceId = getOrCreateDeviceId();
        const synced: UserProfile = {
          ...sanitized,
          elo:
            typeof data.elo === "number" && Number.isFinite(data.elo)
              ? data.elo
              : sanitized.elo,
          isVIP: data.isVIP === true,
          userId: typeof data.id === "string" ? data.id : sanitized.userId,
          deviceId: currentDeviceId,
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(synced));
        setProfile(synced);
      })
      .catch(() => {
        // The app remains usable when the signaling server is offline.
      });
  }, []);

  const value = useMemo<UserProfileContextValue>(
    () => ({
      profile,
      saveProfile: (nextProfile) => {
        const normalized: UserProfile = {
          ...nextProfile,
          // RevenueCat owns client-side VIP access; callers cannot persist it.
          isVIP: profile?.isVIP === true,
          deviceId: getOrCreateDeviceId(),
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        setProfile(normalized);
      },
      clearProfile: () => {
        window.localStorage.removeItem(STORAGE_KEY);
        setProfile({ deviceId: getOrCreateDeviceId() });
      },
    }),
    [profile],
  );

  return (
    <UserProfileContext.Provider value={value}>
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile() {
  const context = useContext(UserProfileContext);
  if (!context) {
    throw new Error("useUserProfile must be used inside UserProfileProvider");
  }
  return context;
}
