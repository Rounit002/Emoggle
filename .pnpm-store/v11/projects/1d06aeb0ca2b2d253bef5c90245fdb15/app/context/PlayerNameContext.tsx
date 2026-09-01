"use client";

/**
 * PlayerNameContext
 * -----------------
 * The user's display name, kept in localStorage only.
 *
 * Why a context (instead of reading the storage utility directly
 * from each component)?
 *  - Every component that needs the name has to react when it
 *    changes (e.g. after the edit-name flow finishes). A React
 *    context gives us a single subscription point — no manual
 *    event plumbing, no prop-drilling.
 *  - Keeps the localStorage import out of every consumer.
 *
 * The context is intentionally separate from `UserProfileContext`:
 *  - UserProfile covers server-issued identity (userId, VIP, etc.)
 *  - PlayerName covers the human-facing display name (local only)
 *
 * Keeping them apart means a server outage never blocks the
 * "what's your name" gate — the homepage can render the modal
 * even if /api/session is offline.
 */

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getName, setName, validateName } from "../lib/storage";

interface PlayerNameContextValue {
  /** The stored name, or null if the user hasn't set one yet. */
  name: string | null;
  /** Has the initial storage read finished? Components that gate
   *  on a real name should wait for `isHydrated` before deciding
   *  whether to show the entry modal. */
  isHydrated: boolean;
  /** Persist a new name. Returns the cleaned value, or null when
   *  the input is invalid. */
  save: (raw: string) => string | null;
  /** Drop the stored name. Used by the "Clear my data" flow. */
  clear: () => void;
}

const PlayerNameContext = createContext<PlayerNameContextValue | null>(null);

export function PlayerNameProvider({ children }: { children: ReactNode }) {
  const [name, setNameState] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setNameState(getName());
    setIsHydrated(true);
  }, []);

  const save = useCallback((raw: string) => {
    const cleaned = setName(raw);
    if (cleaned) setNameState(cleaned);
    return cleaned;
  }, []);

  const clear = useCallback(() => {
    // Storage helper doesn't expose a clear-by-key; use the same
    // validation gate as setName so we never write garbage.
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem("emoggle_user_name");
    } catch {
      /* ignore */
    }
    setNameState(null);
  }, []);

  const value = useMemo<PlayerNameContextValue>(
    () => ({ name, isHydrated, save, clear }),
    [name, isHydrated, save, clear],
  );

  return <PlayerNameContext.Provider value={value}>{children}</PlayerNameContext.Provider>;
}

export function usePlayerName(): PlayerNameContextValue {
  const ctx = useContext(PlayerNameContext);
  if (!ctx) {
    throw new Error("usePlayerName must be used inside PlayerNameProvider");
  }
  return ctx;
}

/** Re-exported for components that just want to validate without
 *  pulling the full context. */
export { validateName };
