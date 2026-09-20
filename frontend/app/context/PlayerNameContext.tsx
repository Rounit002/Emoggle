"use client";

/**
 * PlayerNameContext
 * -----------------
 * The user's display name. Stored in Supabase, mirrored locally.
 *
 * Why a context (instead of reading the profile service directly
 * from each component)?
 *  - Every component that needs the name has to react when it
 *    changes (e.g. after the edit-name flow finishes). A React
 *    context gives us a single subscription point — no manual
 *    event plumbing, no prop-drilling.
 *  - It keeps Supabase out of every consumer. The five components
 *    that read the name call `usePlayerName()` and never see a
 *    query.
 *
 * The context is intentionally separate from `UserProfileContext`:
 *  - UserProfile covers the signaling server's identity (its own
 *    anonymous user id, ELO, VIP entitlements) — unchanged here.
 *  - PlayerName covers the human-facing display name, which now
 *    belongs to a Supabase anonymous user and its `profiles` row.
 *
 * Keeping them apart means a server outage never blocks the
 * "what's your name" gate.
 *
 * ── Where the name actually lives ──────────────────────────────
 * Supabase is the source of truth. localStorage keeps a mirror,
 * for two jobs and no others:
 *
 *   1. Migration. Players from before this table existed have a
 *      name in localStorage and no profile row. The first boot
 *      after the change seeds their row from it. The old value is
 *      never deleted — it simply stops being the authority.
 *   2. Fallback. If Supabase is unreachable, or was never
 *      configured in this environment, the mirror keeps the game
 *      playable exactly as it was before.
 *
 * ── Boot ───────────────────────────────────────────────────────
 * Reuse the Supabase session or create an anonymous user, read the
 * profile, then reconcile:
 *
 *   profile exists  →  its name wins; mirror it locally
 *   no profile, local name  →  create the row from it (migration)
 *   neither  →  leave the name null and let the UI ask
 *
 * `isHydrated` stays false until that settles, so a returning
 * player never gets the first-time modal flashed at them. A
 * bounded timeout releases the gate if the network stalls; the
 * boot keeps going and reconciles when it lands.
 *
 * ── Writes ─────────────────────────────────────────────────────
 * `save()` is deliberately synchronous and optimistic. Nobody
 * should watch a spinner to enter a game: the name applies
 * immediately, the Supabase write happens behind it, and a failed
 * write leaves a marker that the next boot drains.
 */

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  clearName,
  clearPendingName,
  getName,
  getPendingName,
  setName,
  setPendingName,
  validateName,
} from "../lib/storage";
import {
  createProfile,
  ensureAnonymousUser,
  getProfile,
  isSupabaseConfigured,
  saveDisplayName,
  signOut,
} from "../lib/supabase/profile";

/**
 * How long the first-time gate waits on Supabase before falling
 * back to the local mirror. Long enough for a slow mobile
 * handshake, short enough that a dead network doesn't look like a
 * broken page.
 */
const BOOT_TIMEOUT_MS = 6000;

export type NameSyncStatus =
  /** Resolving the session and profile. */
  | "loading"
  /** The name in `name` is what Supabase holds. */
  | "synced"
  /** No Supabase in this environment; the mirror is all there is. */
  | "local-only"
  /** Supabase is configured but did not answer. The name is
   *  applied locally and queued for the next attempt. */
  | "error";

interface PlayerNameContextValue {
  /** The player's name, or null if they haven't set one yet. */
  name: string | null;
  /** Has the initial resolution finished? Components that gate on
   *  a real name should wait for `isHydrated` before deciding
   *  whether to show the entry modal. */
  isHydrated: boolean;
  /** Persist a new name. Returns the cleaned value, or null when
   *  the input is invalid. Applies immediately; the Supabase write
   *  follows and retries on its own. */
  save: (raw: string) => string | null;
  /** Drop the stored name and end the Supabase session, so the
   *  next visit starts as a brand-new player. */
  clear: () => void;
  /** Where the name currently stands with the database. */
  syncStatus: NameSyncStatus;
  /** Push a queued name again after a failure. */
  retrySync: () => void;
  /** The Supabase auth user UUID that owns this profile, once
   *  known. Null when Supabase is unconfigured or unreachable. */
  userId: string | null;
}

const PlayerNameContext = createContext<PlayerNameContextValue | null>(null);

export function PlayerNameProvider({ children }: { children: ReactNode }) {
  const [name, setNameState] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<NameSyncStatus>("loading");
  const [userId, setUserId] = useState<string | null>(null);

  /** Set once the player types a name. A boot that finishes after
   *  that must not overwrite what they just chose. */
  const playerHasTypedRef = useRef(false);
  /** Guards against a late boot result landing after unmount. */
  const mountedRef = useRef(true);

  /**
   * Send `next` to Supabase, clearing the retry marker on success.
   *
   * This resolves its own user rather than reading one from state,
   * so it works before the boot has finished — `ensureAnonymousUser`
   * reuses the persisted session and de-duplicates concurrent
   * callers, so this never creates a second account.
   */
  const push = useCallback(async (next: string) => {
    if (!isSupabaseConfigured()) {
      // There is nothing to sync to, so the retry marker has no job
      // to do. Leaving it set would strand a permanent "unsynced"
      // flag in every environment that runs without a database.
      clearPendingName(next);
      setSyncStatus("local-only");
      return;
    }
    try {
      const user = await ensureAnonymousUser();
      if (mountedRef.current) setUserId(user.id);
      await saveDisplayName(user.id, next);
      // Only clears when the marker still holds this value: a newer
      // edit may have overtaken this one mid-flight.
      clearPendingName(next);
      if (mountedRef.current) setSyncStatus("synced");
    } catch {
      // The name is already applied locally and the marker survives,
      // so the next boot (or `retrySync`) picks it up.
      if (mountedRef.current) setSyncStatus("error");
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const cached = getName();

    if (!isSupabaseConfigured()) {
      setNameState(cached);
      setSyncStatus("local-only");
      setIsHydrated(true);
      return () => {
        mountedRef.current = false;
      };
    }

    /** Release the gate on the local mirror when Supabase is slow.
     *  The boot below keeps running either way. */
    const timer = window.setTimeout(() => {
      if (!mountedRef.current || playerHasTypedRef.current) return;
      setNameState((current) => current ?? cached);
      setIsHydrated(true);
    }, BOOT_TIMEOUT_MS);

    async function boot() {
      try {
        const user = await ensureAnonymousUser();
        if (!mountedRef.current) return;
        setUserId(user.id);

        let profile = await getProfile(user.id);
        // An edit from a previous visit that never reached the
        // server. It is newer than anything else we have, so it
        // takes precedence over both the row and the mirror.
        const pending = getPendingName();

        if (profile) {
          if (pending && pending !== profile.displayName) {
            profile = await saveDisplayName(user.id, pending);
          }
          clearPendingName();
        } else {
          // No row yet: either a queued edit or, for players who
          // predate this table, the name already in localStorage.
          const seed = pending ?? cached;
          if (seed) {
            profile = await createProfile(user.id, seed);
            clearPendingName();
          }
        }

        if (!mountedRef.current) return;
        // The player got impatient and named themselves while this
        // was in flight. Their choice is newer than the row we just
        // read, so `save()` owns the value from here.
        if (playerHasTypedRef.current) {
          setSyncStatus("synced");
          return;
        }

        if (profile) {
          setNameState(profile.displayName);
          // Refresh the mirror so the fallback path stays accurate.
          setName(profile.displayName);
        } else {
          setNameState(null);
        }
        setSyncStatus("synced");
      } catch {
        if (!mountedRef.current) return;
        // Supabase is configured but unreachable. Fall back to the
        // mirror: a database outage must not stop anyone playing.
        if (!playerHasTypedRef.current) setNameState(cached);
        setSyncStatus("error");
      } finally {
        if (mountedRef.current) setIsHydrated(true);
        window.clearTimeout(timer);
      }
    }

    void boot();

    return () => {
      mountedRef.current = false;
      window.clearTimeout(timer);
    };
  }, []);

  const save = useCallback(
    (raw: string) => {
      const cleaned = validateName(raw);
      if (!cleaned) return null;

      playerHasTypedRef.current = true;
      setNameState(cleaned);
      // Mirror first, then mark unsynced. If the tab closes between
      // here and the write landing, the next boot drains the marker.
      setName(cleaned);
      setPendingName(cleaned);
      setSyncStatus("loading");
      void push(cleaned);
      return cleaned;
    },
    [push],
  );

  const retrySync = useCallback(() => {
    const pending = getPendingName() ?? name;
    if (!pending) return;
    setSyncStatus("loading");
    void push(pending);
  }, [name, push]);

  const clear = useCallback(() => {
    clearName();
    setNameState(null);
    playerHasTypedRef.current = false;
    setUserId(null);
    // End the Supabase session too. Leaving it would restore the
    // same profile — and the same name — on the next visit, which
    // is not what "clear my name" means.
    void signOut();
  }, []);

  const value = useMemo<PlayerNameContextValue>(
    () => ({ name, isHydrated, save, clear, syncStatus, retrySync, userId }),
    [name, isHydrated, save, clear, syncStatus, retrySync, userId],
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
