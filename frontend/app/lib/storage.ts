/**
 * storage
 * -------
 * Centralized browser-only persistence for Emoggle.
 *
 * Every key lives under the `emoggle_*` namespace (underscore form
 * for the new keys, colon form kept for migration compatibility).
 * All reads and writes are wrapped in try/catch — private browsing
 * mode, storage-disabled browsers, or quota errors all degrade
 * gracefully: the app keeps working, just without persistence.
 *
 * Design rules
 *  - No async APIs here. localStorage is synchronous; treat it as
 *    such and never block React state on it.
 *  - Every setter is best-effort. If the write fails we silently
 *    return the previous value.
 *  - Every getter returns a default-typed empty value when the key
 *    is missing or corrupted, so the caller can keep going.
 *  - All stored history entries are JSON-validated before being
 *    returned. Garbage in localStorage (older versions, hand-edited
 *    devtools entries) should never crash the UI.
 *  - Migration: the previous storage layer used colon-form keys
 *    (`emoggle:duel-history`, `emoggle:solo-history`). The first
 *    read of the new keys transparently migrates the old array
 *    forward, so existing users keep their history.
 */

const STORAGE_KEYS = {
  name: "emoggle_user_name",
  matchHistory: "emoggle_match_history",
  soloHistory: "emoggle_solo_history",
  stats: "emoggle_stats",
  countryCache: "emoggle_country_cache",
  // Legacy colon-form keys, kept for one-shot migration only.
  legacyDuelHistory: "emoggle:duel-history",
  legacySoloHistory: "emoggle:solo-history",
} as const;

export const NAME_MAX_LENGTH = 20;
/** Hard cap on every history array. 50 keeps the payload well
 *  under 50KB even if every entry is verbose. */
export const HISTORY_MAX_ENTRIES = 50;
/** Country cache lifetime in milliseconds. 24h matches the task spec. */
export const COUNTRY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/* ─── Types ──────────────────────────────────────────────────────────── */

export interface MatchHistoryEntry {
  /** Server-issued match id. Used to dedupe; also handy for debug. */
  id: string;
  /** Unix millis when the match ended. */
  ts: number;
  /** Which seat the local player was in. */
  mySeat: "a" | "b";
  /** Local player's score (0-10). */
  myScore: number;
  /** Rival's score (0-10). */
  rivalScore: number;
  /** Outcome, server-relative. */
  winner: "you" | "rival" | "tie";
  /** Tier name at the time of the match, e.g. "Actor". */
  myTier: string;
  /** ELO at the time of the match. */
  myElo: number;
  /** ELO delta (positive / negative / null if not computed). */
  myDelta: number | null;
}

export interface SoloHistoryEntry {
  emoji: string;
  score: number;
  /** Unix millis when the round ended. */
  ts: number;
}

export interface AggregateStats {
  /** Total completed match rounds (duel + solo). */
  totalMatches: number;
  /** Average across every score in both histories. */
  averageScore: number;
  /** Best score across both histories. */
  bestScore: number;
  /** Duel-specific subset for the history page. */
  duels: { played: number; won: number; tied: number; lost: number };
  /** Solo-specific subset for the history page. */
  solo: { played: number; best: number; average: number };
  /** When the stats were computed (Unix millis). */
  computedAt: number;
}

export interface CountryCache {
  countryCode: string;
  /** "🇮🇳 India" — flag + name from Intl.DisplayNames. */
  display: string;
  /** Just the flag emoji ("🇮🇳"). */
  flag: string;
  /** When the cache entry was written (Unix millis). */
  fetchedAt: number;
}

/* ─── Low-level safe wrappers ───────────────────────────────────────── */

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* quota exceeded, private mode, etc. — silently ignore */
  }
}

function safeRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function readJson<T>(raw: string | null, validate: (value: unknown) => value is T): T | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (validate(parsed)) return parsed;
  } catch {
    /* corrupted entry */
  }
  return null;
}

/* ─── Validators ────────────────────────────────────────────────────── */

function isMatchHistoryEntry(value: unknown): value is MatchHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.ts === "number" &&
    (e.mySeat === "a" || e.mySeat === "b") &&
    typeof e.myScore === "number" &&
    typeof e.rivalScore === "number" &&
    (e.winner === "you" || e.winner === "rival" || e.winner === "tie") &&
    typeof e.myTier === "string" &&
    typeof e.myElo === "number" &&
    (e.myDelta === null || typeof e.myDelta === "number")
  );
}

function isSoloHistoryEntry(value: unknown): value is SoloHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.emoji === "string" &&
    typeof e.score === "number" &&
    typeof e.ts === "number"
  );
}

function isCountryCache(value: unknown): value is CountryCache {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.countryCode === "string" &&
    typeof e.display === "string" &&
    typeof e.flag === "string" &&
    typeof e.fetchedAt === "number"
  );
}

/**
 * Legacy duel entries may have used slightly different shapes. We
 * are intentionally lenient here — anything that looks like a duel
 * row from the old code (with the same fields) is accepted.
 */
function isLegacyDuelEntry(value: unknown): value is MatchHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.ts === "number" &&
    (e.mySeat === "a" || e.mySeat === "b") &&
    typeof e.myScore === "number" &&
    typeof e.rivalScore === "number" &&
    (e.winner === "you" || e.winner === "rival" || e.winner === "tie")
  );
}

function isLegacySoloEntry(value: unknown): value is SoloHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.emoji === "string" &&
    typeof e.score === "number" &&
    typeof e.ts === "number"
  );
}

/* ─── Name ──────────────────────────────────────────────────────────── */

/**
 * Validate a user-entered name. Returns the cleaned value (trimmed,
 * length-capped) when valid, or null when the name is unusable.
 *
 * Rules:
 *  - non-empty after trimming whitespace
 *  - at most NAME_MAX_LENGTH characters
 *  - no control characters
 */
export function validateName(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > NAME_MAX_LENGTH) return null;
  // Reject control characters and most punctuation-only inputs.
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  return trimmed;
}

export function getName(): string | null {
  const raw = safeGet(STORAGE_KEYS.name);
  if (!raw) return null;
  const validated = validateName(raw);
  return validated;
}

export function setName(name: string): string | null {
  const validated = validateName(name);
  if (!validated) return null;
  safeSet(STORAGE_KEYS.name, validated);
  return validated;
}

/* ─── Match history (duels) ─────────────────────────────────────────── */

function migrateLegacyMatchHistory(): MatchHistoryEntry[] | null {
  const raw = safeGet(STORAGE_KEYS.legacyDuelHistory);
  if (!raw) return null;
  const parsed = readJson<unknown[]>(raw, (v): v is unknown[] => Array.isArray(v));
  if (!parsed) {
    // The legacy key held garbage — kill it so we don't retry.
    safeRemove(STORAGE_KEYS.legacyDuelHistory);
    return null;
  }
  const migrated = parsed.filter(isLegacyDuelEntry).slice(0, HISTORY_MAX_ENTRIES);
  if (migrated.length > 0) {
    safeSet(STORAGE_KEYS.matchHistory, JSON.stringify(migrated));
  }
  safeRemove(STORAGE_KEYS.legacyDuelHistory);
  return migrated;
}

export function getMatchHistory(): MatchHistoryEntry[] {
  const raw = safeGet(STORAGE_KEYS.matchHistory);
  const parsed = readJson<unknown[]>(raw, (v): v is unknown[] => Array.isArray(v));
  if (parsed) {
    return parsed.filter(isMatchHistoryEntry).slice(0, HISTORY_MAX_ENTRIES);
  }
  // No new-format history — try migrating from the old key.
  const migrated = migrateLegacyMatchHistory();
  return migrated ?? [];
}

/**
 * Append a new duel result to the front of the list. De-dupes by
 * `id` so a server retry doesn't double-write the same match.
 * Caps at HISTORY_MAX_ENTRIES.
 */
export function appendMatchHistory(entry: MatchHistoryEntry): MatchHistoryEntry[] {
  const current = getMatchHistory();
  if (current.some((existing) => existing.id === entry.id)) {
    return current;
  }
  const next = [entry, ...current].slice(0, HISTORY_MAX_ENTRIES);
  safeSet(STORAGE_KEYS.matchHistory, JSON.stringify(next));
  return next;
}

/* ─── Solo history ──────────────────────────────────────────────────── */

function migrateLegacySoloHistory(): SoloHistoryEntry[] | null {
  const raw = safeGet(STORAGE_KEYS.legacySoloHistory);
  if (!raw) return null;
  const parsed = readJson<unknown[]>(raw, (v): v is unknown[] => Array.isArray(v));
  if (!parsed) {
    safeRemove(STORAGE_KEYS.legacySoloHistory);
    return null;
  }
  const migrated = parsed.filter(isLegacySoloEntry).slice(0, HISTORY_MAX_ENTRIES);
  if (migrated.length > 0) {
    safeSet(STORAGE_KEYS.soloHistory, JSON.stringify(migrated));
  }
  safeRemove(STORAGE_KEYS.legacySoloHistory);
  return migrated;
}

export function getSoloHistory(): SoloHistoryEntry[] {
  const raw = safeGet(STORAGE_KEYS.soloHistory);
  const parsed = readJson<unknown[]>(raw, (v): v is unknown[] => Array.isArray(v));
  if (parsed) {
    return parsed.filter(isSoloHistoryEntry).slice(0, HISTORY_MAX_ENTRIES);
  }
  const migrated = migrateLegacySoloHistory();
  return migrated ?? [];
}

export function appendSoloHistory(entry: SoloHistoryEntry): SoloHistoryEntry[] {
  const current = getSoloHistory();
  const next = [entry, ...current].slice(0, HISTORY_MAX_ENTRIES);
  safeSet(STORAGE_KEYS.soloHistory, JSON.stringify(next));
  return next;
}

/* ─── Aggregate stats ──────────────────────────────────────────────── */

/**
 * Compute aggregate stats from both histories. Pure function — no
 * storage side-effects. The caller is expected to write the result
 * back via `setStats()` if they want it cached.
 */
export function computeStats(
  matches: MatchHistoryEntry[] = getMatchHistory(),
  solo: SoloHistoryEntry[] = getSoloHistory(),
): AggregateStats {
  const duelScores = matches.map((m) => m.myScore);
  const soloScores = solo.map((s) => s.score);
  const allScores = [...duelScores, ...soloScores];
  const totalMatches = allScores.length;
  const averageScore =
    totalMatches === 0
      ? 0
      : Number(
          (allScores.reduce((sum, value) => sum + value, 0) / totalMatches).toFixed(2),
        );
  const bestScore = totalMatches === 0 ? 0 : Math.max(...allScores);

  const duels = {
    played: matches.length,
    won: matches.filter((m) => m.winner === "you").length,
    tied: matches.filter((m) => m.winner === "tie").length,
    lost: matches.filter((m) => m.winner === "rival").length,
  };
  const soloStats = {
    played: solo.length,
    best: solo.length === 0 ? 0 : Math.max(...soloScores),
    average:
      solo.length === 0
        ? 0
        : Number((soloScores.reduce((sum, value) => sum + value, 0) / solo.length).toFixed(2)),
  };

  return {
    totalMatches,
    averageScore,
    bestScore,
    duels,
    solo: soloStats,
    computedAt: Date.now(),
  };
}

export function getStats(): AggregateStats {
  return computeStats();
}

export function setStats(stats: AggregateStats): void {
  safeSet(STORAGE_KEYS.stats, JSON.stringify(stats));
}

/* ─── Country cache ────────────────────────────────────────────────── */

export function getCountryCache(): CountryCache | null {
  const raw = safeGet(STORAGE_KEYS.countryCache);
  if (!raw) return null;
  return readJson<CountryCache>(raw, isCountryCache);
}

export function setCountryCache(entry: CountryCache): void {
  safeSet(STORAGE_KEYS.countryCache, JSON.stringify(entry));
}

export function isCountryCacheFresh(entry: CountryCache, now: number = Date.now()): boolean {
  return now - entry.fetchedAt < COUNTRY_CACHE_TTL_MS;
}

/* ─── Clear all Emoggle data ──────────────────────────────────────── */

/**
 * Wipe every `emoggle_*` (and legacy `emoggle:*`) key the app owns.
 * The server-side anonymous session token lives in `sessionStorage`
 * and is intentionally NOT cleared here — that's a separate concern
 * the user can resolve via the "Refresh access" affordance.
 */
export function clearAll(): void {
  if (typeof window === "undefined") return;
  const targets = [
    STORAGE_KEYS.name,
    STORAGE_KEYS.matchHistory,
    STORAGE_KEYS.soloHistory,
    STORAGE_KEYS.stats,
    STORAGE_KEYS.countryCache,
    STORAGE_KEYS.legacyDuelHistory,
    STORAGE_KEYS.legacySoloHistory,
  ];
  for (const key of targets) safeRemove(key);
}

/* Exposed for diagnostics / unit tests. */
export const __STORAGE_KEYS = STORAGE_KEYS;
