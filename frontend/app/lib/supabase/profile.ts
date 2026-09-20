/**
 * supabase/profile
 * ----------------
 * Every Supabase query Emoggle makes lives in this file.
 *
 * The rest of the app talks to `PlayerNameContext`, which talks to
 * this module. No component imports the Supabase client directly:
 * keeping the queries in one place is what lets the fallback path
 * (Supabase unconfigured or unreachable) stay a single decision
 * rather than a check repeated in every consumer.
 *
 * Identity model
 *  - Players never sign up. On first visit we mint a Supabase
 *    *anonymous* user; its UUID is the permanent `user_id` for
 *    this browser and the primary key of the player's `profiles`
 *    row. Supabase persists the session itself, so a reload
 *    resumes the same user instead of creating another one.
 *  - This is deliberately separate from the signaling server's own
 *    anonymous user (`UserProfileContext`), which owns matchmaking
 *    identity, ELO and VIP entitlements. The two are not merged
 *    here — that would be a much larger change than storing a name.
 *
 * Privacy
 *  - The only player data that reaches Supabase is a display name.
 *  - Nothing from the camera pipeline is ever written here: no
 *    frames, no images, no MediaPipe landmarks, no face geometry,
 *    no biometric derivative of any kind. Face processing stays in
 *    the browser and its output stays on the socket. Adding such a
 *    field to this file would be a privacy regression, not a
 *    feature.
 */

import type { AuthError, PostgrestError, User } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "./client";

export { isSupabaseConfigured };

/** A row of `public.profiles`, in the app's camelCase shape. */
export interface PlayerProfile {
  /** Supabase auth user UUID. Also the row's primary key. */
  id: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

interface ProfileRow {
  id: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

const PROFILES_TABLE = "profiles";
const PROFILE_COLUMNS = "id, display_name, created_at, updated_at";

/** Postgres unique-violation. Two tabs racing to create the first
 *  profile is the realistic cause; the loser re-reads the winner's
 *  row instead of failing, which is what keeps the table free of
 *  duplicate rows for one user. */
const UNIQUE_VIOLATION = "23505";

/** PostgREST's "expected exactly one row, got none". On an update
 *  it means the player has no row yet, not that anything failed. */
const NO_ROWS_RETURNED = "PGRST116";

function toProfile(row: ProfileRow): PlayerProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Raised for anything the caller cannot fix by retrying — a failed
 * policy check, a violated constraint, a missing session. The
 * `retryable` flag is what the retry helper reads.
 */
export class ProfileError extends Error {
  readonly code: string | null;
  readonly retryable: boolean;

  constructor(message: string, code: string | null, retryable: boolean) {
    super(message);
    this.name = "ProfileError";
    this.code = code;
    this.retryable = retryable;
  }
}

/**
 * Decide whether an operation is worth repeating.
 *
 * PostgREST answers a rejected policy or a violated constraint
 * with a SQLSTATE code, and repeating those produces the same
 * rejection forever. A transport failure — offline, DNS, a 5xx
 * from the edge — arrives with no code at all, and those are the
 * ones a retry can actually clear.
 */
function classify(error: PostgrestError | AuthError, status?: number): ProfileError {
  const code = "code" in error && error.code ? String(error.code) : null;
  const httpStatus = status ?? ("status" in error ? error.status : undefined);
  const retryable =
    code === null || (typeof httpStatus === "number" && httpStatus >= 500);
  return new ProfileError(error.message, code, retryable);
}

/** Small bounded backoff. Three attempts over roughly a second is
 *  enough to ride out a dropped request without making a player
 *  wait at the name prompt. */
async function withRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable = error instanceof ProfileError ? error.retryable : true;
      if (!retryable || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
    }
  }
  throw lastError;
}

function requireClient() {
  const client = getSupabaseClient();
  if (!client) {
    throw new ProfileError("Supabase is not configured in this environment", "no-client", false);
  }
  return client;
}

/* ─── Auth ──────────────────────────────────────────────────────── */

/**
 * Serializes anonymous sign-in. Two components mounting in the
 * same tick must not each create a user, so every caller awaits
 * the same promise.
 */
let pendingSignIn: Promise<User> | null = null;

/**
 * The Supabase user for this browser, or null when there is no
 * session yet. Read-only — it never creates one, so callers that
 * merely want to know who is here (diagnostics, a later feature)
 * cannot accidentally mint an account.
 */
export async function getCurrentUser(): Promise<User | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw classify(error);
  return data.session?.user ?? null;
}

/** True only for a session created through Google OAuth. */
export function isGoogleUser(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.app_metadata?.provider === "google") return true;
  return user.identities?.some((identity) => identity.provider === "google") ?? false;
}

/** Send the player to Google, returning them to the page they started from. */
export async function signInWithGoogle(): Promise<void> {
  const client = requireClient();
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/` },
  });
  if (error) throw classify(error);
}

/**
 * The Supabase user for this browser, creating an anonymous one on
 * first visit.
 *
 * The existing session always wins. `getSession()` reads the
 * persisted session that supabase-js keeps in browser storage, so
 * a reload, a navigation or a reopened tab resumes the same UUID
 * and `signInAnonymously` is never reached again.
 */
export async function ensureAnonymousUser(): Promise<User> {
  const client = requireClient();

  const existing = await getCurrentUser();
  if (existing) return existing;

  if (pendingSignIn) return pendingSignIn;

  pendingSignIn = (async () => {
    // One last read before creating anything: another tab may have
    // signed in while this call was queued behind the check above.
    const raced = await getCurrentUser();
    if (raced) return raced;

    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw classify(error);
    if (!data.user) {
      throw new ProfileError("Supabase returned no user for the anonymous sign-in", null, true);
    }
    return data.user;
  })();

  try {
    return await pendingSignIn;
  } finally {
    pendingSignIn = null;
  }
}

/**
 * End the Supabase session. Used by the "clear all my data" flow:
 * without it the next visit would restore the same profile and the
 * name the player just asked us to forget would reappear.
 */
export async function signOut(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  await client.auth.signOut();
}

/* ─── Profile ───────────────────────────────────────────────────── */

/**
 * This player's profile row, or null when they do not have one
 * yet. Row-level security restricts the result to `auth.uid()`, so
 * passing another player's id returns null rather than their data.
 */
export async function getProfile(userId: string): Promise<PlayerProfile | null> {
  const client = requireClient();
  return withRetry(async () => {
    const { data, error, status } = await client
      .from(PROFILES_TABLE)
      .select(PROFILE_COLUMNS)
      .eq("id", userId)
      // `maybeSingle` treats "no row" as a null result instead of an
      // error, which is the normal state for a first-time player.
      .maybeSingle<ProfileRow>();
    if (error) throw classify(error, status);
    return data ? toProfile(data) : null;
  });
}

/**
 * Create this player's profile.
 *
 * `id` is supplied explicitly and the insert policy requires it to
 * equal `auth.uid()`, so a tampered client cannot write a row that
 * belongs to somebody else. A unique violation means a concurrent
 * tab won the race; the existing row is returned rather than
 * overwritten, because the first name the player chose is the one
 * they chose.
 */
export async function createProfile(
  userId: string,
  displayName: string,
): Promise<PlayerProfile> {
  const client = requireClient();
  return withRetry(async () => {
    const { data, error, status } = await client
      .from(PROFILES_TABLE)
      .insert({ id: userId, display_name: displayName })
      .select(PROFILE_COLUMNS)
      .single<ProfileRow>();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        const existing = await getProfile(userId);
        if (existing) return existing;
      }
      throw classify(error, status);
    }
    return toProfile(data);
  });
}

/** Change the stored display name. Scoped to `auth.uid()` by the
 *  update policy, so this can only ever rewrite the caller's row. */
export async function updateDisplayName(
  userId: string,
  displayName: string,
): Promise<PlayerProfile> {
  const client = requireClient();
  return withRetry(async () => {
    const { data, error, status } = await client
      .from(PROFILES_TABLE)
      .update({ display_name: displayName })
      .eq("id", userId)
      .select(PROFILE_COLUMNS)
      .single<ProfileRow>();
    if (error) throw classify(error, status);
    return toProfile(data);
  });
}

/**
 * Write `displayName` for `userId` whether or not a row exists.
 *
 * The context cannot always know which it needs: a row may have
 * appeared in another tab since this one booted. Update first —
 * the common case after the first session — and fall back to an
 * insert when the update matched nothing.
 */
export async function saveDisplayName(
  userId: string,
  displayName: string,
): Promise<PlayerProfile> {
  try {
    return await updateDisplayName(userId, displayName);
  } catch (error) {
    // `.single()` on an update that matched no row is reported as an
    // error, not as an empty result. That is the "no row yet" signal.
    const noRow = error instanceof ProfileError && error.code === NO_ROWS_RETURNED;
    if (!noRow) throw error;
    return createProfile(userId, displayName);
  }
}
