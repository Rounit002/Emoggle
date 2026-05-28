"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type UserGender = "Male" | "Female";
export type MatchSeeking = "Male" | "Female" | "Anyone";

export interface UserProfile {
  username: string;
  gender: UserGender;
  dateOfBirth: string;
  age: number;
  verifiedGender: "Male" | "Female";
  isVerified: boolean;
  isVIP?: boolean;
  freeGenderMatchesLeft?: number;
  elo?: number;
  userId?: string;
}

interface UserProfileContextValue {
  profile: UserProfile | null;
  hasLoadedProfile: boolean;
  saveProfile: (profile: UserProfile) => void;
  clearProfile: () => void;
}

const STORAGE_KEY = "emoggle:user-profile";
const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL ?? "http://localhost:3001";
const UserProfileContext = createContext<UserProfileContextValue | null>(null);

function parseProfile(value: string | null): UserProfile | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<UserProfile>;
    if (
      typeof parsed.username === "string" &&
      parsed.username.trim() &&
      (parsed.gender === "Male" || parsed.gender === "Female") &&
      typeof parsed.dateOfBirth === "string" &&
      typeof parsed.age === "number" &&
      Number.isFinite(parsed.age) &&
      (parsed.verifiedGender === "Male" || parsed.verifiedGender === "Female") &&
      parsed.isVerified === true
    ) {
      return {
        username: parsed.username.trim().slice(0, 24),
        gender: parsed.gender,
        dateOfBirth: parsed.dateOfBirth,
        age: parsed.age,
        verifiedGender: parsed.verifiedGender,
        isVerified: true,
        isVIP: parsed.isVIP === true,
        freeGenderMatchesLeft:
          typeof parsed.freeGenderMatchesLeft === "number" && Number.isFinite(parsed.freeGenderMatchesLeft)
            ? parsed.freeGenderMatchesLeft
            : 5,
        userId: typeof parsed.userId === "string" ? parsed.userId : undefined,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hasLoadedProfile, setHasLoadedProfile] = useState(false);

  useEffect(() => {
    const loaded = parseProfile(window.localStorage.getItem(STORAGE_KEY));
    setProfile(loaded);
    setHasLoadedProfile(true);

    // Login validation: if a userId exists, verify it against the DB
    if (loaded?.userId) {
      fetch(`${SIGNALING_URL}/api/users/me?id=${encodeURIComponent(loaded.userId)}`, { cache: "no-store" })
        .then((res) => {
          if (!res.ok) {
            // UUID invalid or not found — clear userId so onboarding re-triggers
            if (res.status === 404) {
              const cleaned = { ...loaded, userId: undefined };
              window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
              setProfile(cleaned);
            }
            return null;
          }
          return res.json();
        })
        .then((data) => {
          if (!data) return;
          // Hydrate profile with authoritative DB values
          const synced: UserProfile = {
            ...loaded,
            elo: data.elo ?? loaded.elo,
            isVIP: data.isVIP === true,
            freeGenderMatchesLeft:
              typeof data.freeGenderMatchesLeft === "number"
                ? data.freeGenderMatchesLeft
                : loaded.freeGenderMatchesLeft,
            userId: data.id,
          };
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(synced));
          setProfile(synced);
        })
        .catch(() => { /* backend may be offline */ });
    }
  }, []);

  const value = useMemo<UserProfileContextValue>(
    () => ({
      profile,
      hasLoadedProfile,
      saveProfile: (nextProfile) => {
        const normalized = {
          ...nextProfile,
          username: nextProfile.username.trim().slice(0, 24),
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        setProfile(normalized);
      },
      clearProfile: () => {
        window.localStorage.removeItem(STORAGE_KEY);
        setProfile(null);
      },
    }),
    [hasLoadedProfile, profile]
  );

  return <UserProfileContext.Provider value={value}>{children}</UserProfileContext.Provider>;
}

export function useUserProfile() {
  const context = useContext(UserProfileContext);
  if (!context) throw new Error("useUserProfile must be used inside UserProfileProvider");
  return context;
}
