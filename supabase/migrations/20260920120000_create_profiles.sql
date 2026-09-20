-- ─────────────────────────────────────────────────────────────
--  profiles — the player's display name, owned by their Supabase
--  anonymous auth user.
--
--  Emoggle asks for a name before the first game and, until now,
--  kept it in the browser's localStorage. This table makes that
--  name real data: one row per auth user, readable and writable
--  only by that user.
--
--  Scope note: this table holds a display name and nothing else.
--  Face-expression processing happens entirely in the browser and
--  nothing it produces — webcam frames, images, MediaPipe
--  landmarks, face geometry, or any other biometric derivative —
--  is stored here or anywhere else in this database.
--
--  Apply with `supabase db push`, or paste into the SQL editor in
--  the Supabase dashboard. Safe to re-run.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id           uuid        primary key references auth.users (id) on delete cascade,
  display_name text        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- The three checks below mirror `validateName()` in
  -- frontend/app/lib/storage.ts and `readDisplayName()` in
  -- signaling-server/index.js exactly, so every name that is
  -- valid in the running app is valid here. Nothing stricter is
  -- imposed: names already saved by existing players must all
  -- still insert cleanly during the localStorage migration.
  --
  -- The profanity filter is deliberately NOT duplicated in SQL.
  -- It is a long, frequently-updated word list enforced on the
  -- client and again on the signaling server; encoding it as a
  -- CHECK would freeze it into a constraint that needs a
  -- migration to amend.
  constraint profiles_display_name_not_blank
    check (btrim(display_name) <> ''),
  constraint profiles_display_name_max_length
    check (char_length(display_name) <= 20),
  constraint profiles_display_name_no_control_chars
    check (display_name !~ '[[:cntrl:]]')
);

comment on table public.profiles is
  'Player display names, keyed by Supabase auth user. No biometric or camera-derived data is stored here.';
comment on column public.profiles.id is
  'Supabase auth user UUID. Anonymous users are the normal case — Emoggle has no signup screen.';

-- ─── updated_at ──────────────────────────────────────────────
-- Kept in a trigger rather than left to the client: a browser can
-- send any value it likes, and `updated_at` is only useful if it
-- is the database's own clock.
--
-- `set search_path = ''` pins every identifier inside the function
-- to a fully-qualified name, which is what stops a role with a
-- custom search_path from resolving them somewhere unexpected.

create or replace function public.handle_profiles_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.handle_profiles_updated_at();

-- ─── Row level security ──────────────────────────────────────
-- With RLS on and no policy matching, Postgres denies. So the
-- three policies below are the entire permission surface:
--
--   select  own row
--   insert  own row
--   update  own row
--
-- There is deliberately no delete policy and no policy for the
-- `anon` role. A Supabase *anonymous auth* user is not `anon` —
-- it holds the `authenticated` role with `is_anonymous: true` in
-- its JWT — so `to authenticated` covers Emoggle's players while
-- leaving the table closed to unauthenticated requests.
--
-- `(select auth.uid())` rather than a bare `auth.uid()`: the
-- scalar subquery is evaluated once per statement instead of once
-- per row, which lets the planner use the primary key.

alter table public.profiles enable row level security;

drop policy if exists "Players can read their own profile" on public.profiles;
create policy "Players can read their own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Players can create their own profile" on public.profiles;
create policy "Players can create their own profile"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

-- Both clauses are required. `using` decides which rows are
-- visible to the UPDATE; `with check` validates the row it would
-- become. Without the latter, a player could rewrite their row's
-- `id` and hand it to somebody else.
drop policy if exists "Players can update their own profile" on public.profiles;
create policy "Players can update their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
