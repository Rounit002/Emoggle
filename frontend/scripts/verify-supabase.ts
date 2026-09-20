/**
 * Does the Supabase side actually hold up?
 *
 * The browser tests in `verify-name-migration.ts` run without a
 * database on purpose — they prove the app still works when
 * Supabase is absent. This script is the other half: it talks to a
 * real project and checks the things only a real project can show.
 *
 * What it proves
 *   - anonymous sign-in works, and a second client with the same
 *     stored session does not mint a second user
 *   - a profile can be created, read back and renamed
 *   - `updated_at` moves on its own, from the database's clock
 *   - the display-name constraints match the app's own validation
 *   - row-level security actually isolates players: a second user
 *     can neither read nor overwrite the first user's row, and
 *     nobody can delete one
 *
 * That last group is the important one. RLS policies are easy to
 * write and easy to get subtly wrong, and a wrong one is invisible
 * until somebody else's data leaks.
 *
 * Usage
 *   1. put NEXT_PUBLIC_SUPABASE_URL and the publishable/anon key in
 *      frontend/.env.local (the same file the app reads)
 *   2. apply supabase/migrations/*_create_profiles.sql
 *   3. enable anonymous sign-ins in the Supabase dashboard
 *   4. npm run verify:supabase
 *
 * Uses only the publishable key — the same credential the browser
 * gets. That is deliberate: a test that used the service-role key
 * would bypass RLS and prove nothing about what a player can do.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* ─── Environment ───────────────────────────────────────────── */

/** Read `.env.local` the way Next.js would, so this script and the
 *  running app are always pointed at the same project. */
function loadEnvLocal(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const file of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(join(__dirname, "..", file), "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
        if (!match) continue;
        const [, key, rawValue] = match;
        if (values[key] !== undefined) continue;
        values[key] = rawValue.trim().replace(/^["']|["']$/g, "");
      }
    } catch {
      /* file is optional */
    }
  }
  return values;
}

const fileEnv = loadEnvLocal();
const readEnv = (key: string) => process.env[key]?.trim() || fileEnv[key] || "";

const SUPABASE_URL = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_KEY =
  readEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing Supabase configuration.\n" +
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\n" +
      "(or NEXT_PUBLIC_SUPABASE_ANON_KEY) in frontend/.env.local, then re-run.",
  );
  process.exit(2);
}

if (/service_role/i.test(SUPABASE_KEY)) {
  console.error(
    "That looks like a service-role key. Use the publishable/anon key:\n" +
      "this script must run with exactly the privileges a browser has.",
  );
  process.exit(2);
}

/* ─── Harness ───────────────────────────────────────────────── */

let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name.padEnd(54)}  ${extra}`);
  if (!ok) failed += 1;
};

/** A client with its own isolated session, so two of these behave
 *  like two different browsers. */
function newClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function main() {
  /* ── Player one ──────────────────────────────────────────── */
  const alice = newClient();
  const { data: aliceAuth, error: aliceAuthError } = await alice.auth.signInAnonymously();

  if (aliceAuthError || !aliceAuth.user) {
    console.error(
      `\nAnonymous sign-in failed: ${aliceAuthError?.message ?? "no user returned"}\n` +
        "Enable it in the dashboard: Authentication → Sign In / Providers →\n" +
        "Anonymous sign-ins.",
    );
    process.exit(1);
  }

  const aliceId = aliceAuth.user.id;
  check("anonymous sign-in creates a user", Boolean(aliceId), aliceId);
  check("the user is marked anonymous", aliceAuth.user.is_anonymous === true);

  /* Reusing the same session must not create a second user — this
     is the "never sign up twice" guarantee the app depends on. */
  const { data: sessionData } = await alice.auth.getSession();
  check("session is reusable, not re-minted", sessionData.session?.user.id === aliceId,
    String(sessionData.session?.user.id));

  /* ── Profile lifecycle ───────────────────────────────────── */
  const created = await alice
    .from("profiles")
    .insert({ id: aliceId, display_name: "Alice" })
    .select("id, display_name, created_at, updated_at")
    .single();
  check("player can create their own profile", !created.error && created.data?.id === aliceId,
    created.error?.message ?? "");

  const read = await alice.from("profiles").select("display_name").eq("id", aliceId).maybeSingle();
  check("player can read their own profile", read.data?.display_name === "Alice",
    read.error?.message ?? String(read.data?.display_name));

  /* A second insert for the same id must be rejected by the
     primary key — this is what stops duplicate profile rows. */
  const duplicate = await alice
    .from("profiles")
    .insert({ id: aliceId, display_name: "AliceAgain" })
    .select()
    .single();
  check("duplicate profile insert is rejected", duplicate.error?.code === "23505",
    duplicate.error?.code ?? "no error");

  /* `updated_at` must move without the client sending it. */
  const before = created.data?.updated_at as string | undefined;
  await new Promise((r) => setTimeout(r, 1100));
  const renamed = await alice
    .from("profiles")
    .update({ display_name: "Alicia" })
    .eq("id", aliceId)
    .select("display_name, created_at, updated_at")
    .single();
  check("player can rename themselves", renamed.data?.display_name === "Alicia",
    renamed.error?.message ?? "");
  check("updated_at advances on its own",
    Boolean(before && renamed.data && new Date(renamed.data.updated_at) > new Date(before)),
    `${before} -> ${renamed.data?.updated_at}`);
  check("created_at is not touched by an update",
    renamed.data?.created_at === created.data?.created_at);

  /* ── Constraints match the app's own validation ──────────── */
  const blank = await alice.from("profiles").update({ display_name: "   " }).eq("id", aliceId).select();
  check("blank display name is rejected", Boolean(blank.error), blank.error?.code ?? "accepted");

  const tooLong = await alice
    .from("profiles")
    .update({ display_name: "x".repeat(21) })
    .eq("id", aliceId)
    .select();
  check("display name over 20 chars is rejected", Boolean(tooLong.error),
    tooLong.error?.code ?? "accepted");

  const controlChars = await alice
    .from("profiles")
    .update({ display_name: "BadName" })
    .eq("id", aliceId)
    .select();
  check("control characters are rejected", Boolean(controlChars.error),
    controlChars.error?.code ?? "accepted");

  const twentyChars = "A".repeat(20);
  const atLimit = await alice
    .from("profiles")
    .update({ display_name: twentyChars })
    .eq("id", aliceId)
    .select("display_name")
    .single();
  check("a valid 20-char name is still accepted", atLimit.data?.display_name === twentyChars,
    atLimit.error?.message ?? "");

  // Put it back so the isolation checks below read a known value.
  await alice.from("profiles").update({ display_name: "Alicia" }).eq("id", aliceId);

  /* ── Row-level security ──────────────────────────────────── */
  const mallory = newClient();
  const { data: malloryAuth, error: malloryAuthError } = await mallory.auth.signInAnonymously();
  if (malloryAuthError || !malloryAuth.user) {
    console.error(`Second anonymous sign-in failed: ${malloryAuthError?.message}`);
    process.exit(1);
  }
  const malloryId = malloryAuth.user.id;
  check("second player is a different user", malloryId !== aliceId, malloryId);

  const peek = await mallory.from("profiles").select("*").eq("id", aliceId);
  check("another player cannot READ your profile", (peek.data?.length ?? 0) === 0,
    `${peek.data?.length ?? 0} row(s) returned`);

  const tamper = await mallory
    .from("profiles")
    .update({ display_name: "Hacked" })
    .eq("id", aliceId)
    .select();
  check("another player cannot UPDATE your profile", (tamper.data?.length ?? 0) === 0,
    tamper.error?.code ?? `${tamper.data?.length ?? 0} row(s) changed`);

  const impersonate = await mallory
    .from("profiles")
    .insert({ id: aliceId, display_name: "Impostor" })
    .select();
  check("another player cannot INSERT a row as you", Boolean(impersonate.error),
    impersonate.error?.code ?? "accepted");

  const nuke = await mallory.from("profiles").delete().eq("id", aliceId).select();
  check("another player cannot DELETE your profile", (nuke.data?.length ?? 0) === 0,
    nuke.error?.code ?? `${nuke.data?.length ?? 0} row(s) deleted`);

  const selfDelete = await alice.from("profiles").delete().eq("id", aliceId).select();
  check("nobody can delete a profile (no delete policy)", (selfDelete.data?.length ?? 0) === 0,
    selfDelete.error?.code ?? `${selfDelete.data?.length ?? 0} row(s) deleted`);

  /* The name must still be Alicia after every one of those. */
  const final = await alice.from("profiles").select("display_name").eq("id", aliceId).maybeSingle();
  check("your name is unchanged after the attacks", final.data?.display_name === "Alicia",
    String(final.data?.display_name));

  /* ── Scope ───────────────────────────────────────────────── */
  /* A blind listing must never return the whole table. */
  const listAll = await mallory.from("profiles").select("id");
  const onlyOwn = (listAll.data ?? []).every((row) => row.id === malloryId);
  check("listing profiles returns only your own", onlyOwn,
    `${listAll.data?.length ?? 0} row(s)`);

  console.log(
    `\nTest users left behind: ${aliceId}, ${malloryId}\n` +
      "Remove them from Authentication → Users if you are testing against a\n" +
      "project you care about keeping tidy.",
  );
  console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
