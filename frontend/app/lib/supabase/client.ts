/**
 * supabase/client
 * ---------------
 * The single browser Supabase client for Emoggle.
 *
 * Only two things are exposed to the browser bundle: the project
 * URL and the publishable (anon) key. Both are safe to ship — the
 * anon key carries no privileges of its own, every table is
 * guarded by row-level security, and `auth.uid()` decides what a
 * session may touch. The service-role key must never appear in
 * this directory, in any `NEXT_PUBLIC_*` variable, or anywhere
 * else the bundler can reach.
 *
 * Configuration is optional on purpose. Emoggle shipped for a long
 * time without Supabase and still has to run when the variables
 * are missing (a fork, a preview branch, a local checkout that
 * never got an `.env.local`). `getSupabaseClient()` returns null
 * in that case and the profile layer falls back to the browser's
 * own storage, exactly as the app behaved before.
 *
 * The client is created lazily. Next.js renders this module on the
 * server during the initial pass, where there is no `window` for
 * the auth library to persist a session into, so construction
 * waits until the first call from the browser.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* Next.js only inlines `process.env.NEXT_PUBLIC_*` when it is
   written out in full, so both spellings are read literally.
   Supabase is migrating "anon key" to "publishable key"; either
   variable name works and the newer one wins. */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  "";

/** Where supabase-js persists the session. Namespaced like every
 *  other Emoggle key so "clear site data" tooling groups it with
 *  the rest, and so a future key rename is a one-line change. */
export const SUPABASE_AUTH_STORAGE_KEY = "emoggle_supabase_auth";

let client: SupabaseClient | null = null;

/** True when both variables are present. Safe to call on the
 *  server — it reads the build-time values, not the browser. */
export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_KEY.length > 0;
}

/**
 * The shared client, or null when Supabase is not configured or
 * we are still on the server. Callers must handle null rather
 * than assume a client exists — that null path is what keeps the
 * game playable without a database.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (!isSupabaseConfigured()) return null;
  if (client) return client;

  client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      // Keep the anonymous session across reloads and tabs. This is
      // what stops every page load from minting a new user.
      persistSession: true,
      autoRefreshToken: true,
      storageKey: SUPABASE_AUTH_STORAGE_KEY,
      // Emoggle has no OAuth redirect, so there is never a session
      // in the URL to parse. Leaving this on makes the library scan
      // every navigation for a token it will never find.
      detectSessionInUrl: false,
    },
  });
  return client;
}
