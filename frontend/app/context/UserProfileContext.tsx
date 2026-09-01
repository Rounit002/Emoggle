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
// v2 migrates away from tokens that were previously copied from the shared
// session cookie into every open tab. The token remains tab-scoped, so a reload
// resumes the player while a separately opened tab gets a new anonymous user.
const SESSION_TOKEN_KEY = "emoggle:tab-session-token:v2";
const LEGACY_SESSION_TOKEN_KEY = "emoggle:session-token";
const LEGACY_VIP_RECEIPT_KEY = "emoggle:vip-receipt";
const SESSION_CHANNEL_NAME = "emoggle:tab-session-coordination:v1";
const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL ?? "http://localhost:3001";
const SESSION_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

function getOrCreateDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;

    const newId = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_KEY, newId);
    return newId;
  } catch {
    return crypto.randomUUID();
  }
}

function parseProfile(value: string | null): UserProfile | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      isVIP: false,
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
  sessionToken: string | null;
  isSessionReady: boolean;
  saveProfile: (profile: UserProfile) => void;
  clearProfile: () => void;
}

const UserProfileContext = createContext<UserProfileContextValue | null>(null);

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isSessionReady, setIsSessionReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loaded = parseProfile(window.localStorage.getItem(STORAGE_KEY));
    window.localStorage.removeItem(LEGACY_VIP_RECEIPT_KEY);
    const deviceId = getOrCreateDeviceId();
    const sanitized: UserProfile = {
      ...(loaded ?? {}),
      deviceId,
      isVIP: false,
    };
    window.sessionStorage.removeItem(LEGACY_SESSION_TOKEN_KEY);
    const storedToken = window.sessionStorage.getItem(SESSION_TOKEN_KEY);
    const usableToken = storedToken && SESSION_TOKEN_PATTERN.test(storedToken) ? storedToken : null;
    let activeToken = usableToken;
    const sessionChannel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(SESSION_CHANNEL_NAME);

    const handleSessionMessage = (event: MessageEvent<unknown>) => {
      if (!sessionChannel || !activeToken || !event.data || typeof event.data !== "object") return;
      const message = event.data as Record<string, unknown>;
      if (
        message.type === "probe" &&
        message.token === activeToken &&
        typeof message.requestId === "string"
      ) {
        sessionChannel.postMessage({
          type: "in-use",
          token: activeToken,
          requestId: message.requestId,
        });
      }
    };
    sessionChannel?.addEventListener("message", handleSessionMessage);

    async function tokenIsActiveInAnotherTab(token: string): Promise<boolean> {
      if (!sessionChannel) return false;
      const requestId = crypto.randomUUID();
      return new Promise((resolve) => {
        let found = false;
        const handleReply = (event: MessageEvent<unknown>) => {
          if (!event.data || typeof event.data !== "object") return;
          const message = event.data as Record<string, unknown>;
          if (
            message.type === "in-use" &&
            message.token === token &&
            message.requestId === requestId
          ) {
            found = true;
          }
        };
        sessionChannel.addEventListener("message", handleReply);
        sessionChannel.postMessage({ type: "probe", token, requestId });
        window.setTimeout(() => {
          sessionChannel.removeEventListener("message", handleReply);
          resolve(found);
        }, 100);
      });
    }

    async function bootstrapSession() {
      try {
        // Chrome can clone sessionStorage when a tab is duplicated. Reusing
        // that token would make both tabs the same anonymous player, and the
        // signaling server correctly allows only one live socket per player.
        // Ask other live tabs before resuming; a collision gets a fresh user.
        const resumeToken =
          usableToken && !(await tokenIsActiveInAnotherTab(usableToken))
            ? usableToken
            : null;
        activeToken = resumeToken;
        if (!resumeToken) window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
        const response = await fetch(`${SIGNALING_URL}/api/session`, {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            ...(resumeToken ? { Authorization: `Bearer ${resumeToken}` } : {}),
          },
          body: "{}",
        });
        if (!response.ok) throw new Error("Session service unavailable");
        const data = (await response.json()) as Record<string, unknown>;
        const nextToken =
          typeof data.socketToken === "string" && SESSION_TOKEN_PATTERN.test(data.socketToken)
            ? data.socketToken
            : null;
        if (!nextToken || typeof data.id !== "string") throw new Error("Invalid session response");
        if (cancelled) return;

        const authenticated: UserProfile = {
          deviceId,
          userId: data.id,
          elo: typeof data.elo === "number" && Number.isFinite(data.elo) ? data.elo : undefined,
          isVIP: data.isVIP === true,
        };
        window.sessionStorage.setItem(SESSION_TOKEN_KEY, nextToken);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ deviceId }));
        activeToken = nextToken;
        setSessionToken(nextToken);
        setProfile(authenticated);
      } catch {
        if (cancelled) return;
        window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ deviceId }));
        activeToken = null;
        setSessionToken(null);
        setProfile(sanitized);
      } finally {
        if (!cancelled) setIsSessionReady(true);
      }
    }

    void bootstrapSession();
    return () => {
      cancelled = true;
      activeToken = null;
      sessionChannel?.removeEventListener("message", handleSessionMessage);
      sessionChannel?.close();
    };
  }, []);

  const value = useMemo<UserProfileContextValue>(
    () => ({
      profile,
      sessionToken,
      isSessionReady,
      saveProfile: (nextProfile) => {
        const normalized: UserProfile = {
          ...nextProfile,
          userId: profile?.userId,
          isVIP: profile?.isVIP === true,
          deviceId: getOrCreateDeviceId(),
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ deviceId: normalized.deviceId }));
        setProfile(normalized);
      },
      clearProfile: () => {
        window.localStorage.removeItem(STORAGE_KEY);
        window.sessionStorage.removeItem(LEGACY_SESSION_TOKEN_KEY);
        window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
        if (sessionToken) {
          void fetch(`${SIGNALING_URL}/api/session`, {
            method: "DELETE",
            credentials: "include",
            headers: { Authorization: `Bearer ${sessionToken}` },
          }).finally(() => window.location.reload());
        } else {
          window.location.reload();
        }
      },
    }),
    [isSessionReady, profile, sessionToken],
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
