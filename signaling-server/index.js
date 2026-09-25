const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

// Build DATABASE_URL from discrete env vars (must happen before pg pool init)
const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
if (DB_HOST && DB_USER && DB_NAME) {
  process.env.DATABASE_URL = `postgresql://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD || "")}@${DB_HOST}:${DB_PORT || 5432}/${DB_NAME}`;
}

// Startup env diagnostic
console.log("[ENV] NODE_ENV:", process.env.NODE_ENV);
console.log("[ENV] DATABASE_URL set:", !!process.env.DATABASE_URL);
console.log("[ENV] FRONTEND_URL:", process.env.FRONTEND_URL);

const express = require("express");
const { isInappropriateName, NAME_MODERATION_ERROR } = require("./nameModeration");
const { readFaceVector, computeFaceSync, variantSeedFromMatchId } = require("./faceSync");
const http = require("http");
const crypto = require("crypto");
const { Server } = require("socket.io");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const DodoPayments = require("dodopayments");
const { MIN_SUPPORT_CENTS, supportAmountInCents } = require("./supportAmount");
const { pool, initSchema } = require("./db");
const {
  SESSION_COOKIE_NAME,
  extractSessionResumeToken,
  findSessionUser,
  hashSessionToken,
  setMemorySessionStore,
  verifyToken,
  verifySocketToken,
} = require("./middleware/verifyToken");
const { resolveClientIp } = require("./clientIp");
const {
  buildMatchResultPayloads,
  clampScore,
  deadlineRoundScore,
  submittedRoundScore,
} = require("./matchScore");

const app = express();
app.disable("x-powered-by");
const configuredProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS || "", 10);
app.set(
  "trust proxy",
  Number.isInteger(configuredProxyHops) && configuredProxyHops >= 0
    ? configuredProxyHops
    : process.env.NODE_ENV === "production"
      ? 1
      : false,
);

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  // This API intentionally serves the separately hosted frontend; CORS still
  // restricts which browser origins may read responses.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  next();
});

// ─── Rate Limiters ─────────────────────────────────────────────────────────
// General API limiter: 60 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { detail: "Too many requests, please try again later." },
});

const sessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { detail: "Too many session requests. Please try again later." },
});

// Covers every HTTP path, not just /api — the unauthenticated root, /health
// and /ready probes are the cheapest thing on the server to hammer and were
// the only routes with no ceiling at all. The budget is well clear of what a
// real browser session or a platform health check uses, so it only bites a
// scripted flood.
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { detail: "Too many requests, please try again later." },
});

const defaultOrigins = [
  "http://localhost:3000",
  "https://emoggle.vercel.app",
  "https://emoggle.com",
  "https://www.emoggle.com",
];
const envOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));
console.log("[ENV] Allowed CORS origins:", allowedOrigins.join(", "));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(globalLimiter);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true },
  transports: ["websocket", "polling"],
  maxHttpBufferSize: 64 * 1024,
  perMessageDeflate: false,
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: false,
});

// ─── In-memory state (minimal; keyed by matchId for easy cleanup) ────────────
const waitingQueue = []; // { socketId, peerId, skippedSocketId }
const socketMeta = new Map(); // socketId -> { peerId, userId, country, displayName, gameMode }
const activeMatches = new Map(); // matchId -> { roomId, player1SocketId, player2SocketId, timerId, scores, gameMode }
const CELEBRITY_GAME_MODE = "celebrity";
const EMOJI_GAME_MODE = "emoji";
/*
 * FaceSync as a mode in its own right: pair with a stranger,
 * compare faces, show the number, move on. No emoji, no countdown,
 * no scan window, no ELO.
 *
 * It has its own queue because `enqueueSocket` refuses to pair
 * across modes, which is what stops someone who chose FaceSync
 * from being dropped into a ten-second emoji duel they did not ask
 * for. The cost is a split matchmaking pool.
 */
const FACE_SYNC_GAME_MODE = "facesync";

/** The three modes a client may ask for. Anything else is emoji. */
function readGameMode(value) {
  if (value === CELEBRITY_GAME_MODE) return CELEBRITY_GAME_MODE;
  if (value === FACE_SYNC_GAME_MODE) return FACE_SYNC_GAME_MODE;
  return EMOJI_GAME_MODE;
}
const ROUND_COUNTDOWN_SEC = 3;
const MATCH_DURATION_SEC = 10;
const CELEBRITY_AFFECTS_ELO = process.env.CELEBRITY_AFFECTS_ELO === "true";
// Absolute grace period after the published scan deadline. Each
// client starts its own 10-second window when the "go" packet
// (`emoji_locked`) reaches it, so an honest submission lands one
// network hop after this deadline — the grace has to cover that
// delivery before the fallback scoring kicks in. Results normally
// finalize the moment both submissions arrive; this deadline only
// stops a missing or disconnected client from leaving the other
// player waiting forever.
const SCORE_SUBMISSION_GRACE_MS = 4_000;
// How far before the published scan deadline a submission is still
// accepted. A client anchored on its own "go" packet always lands
// at or after the deadline, so this only absorbs clock-offset
// estimation error and socket jitter from an early-firing client.
const SCORE_SUBMISSION_EARLY_MS = 2_000;

/*
 * FaceSync lead-in.
 *
 * FaceSync runs between the match connecting and the 3-2-1
 * countdown, so the round timeline does not start until it has
 * resolved one way or the other. That keeps the existing countdown
 * and scan logic completely untouched — it just begins later.
 *
 * Both players report once per match: either a geometry vector, or
 * that they have nothing to offer (camera off, no face, MediaPipe
 * unavailable). Reporting "unavailable" is what keeps the failure
 * path short: the moment both sides have reported, the window ends,
 * so a pair who cannot do FaceSync waits a second or two rather
 * than the full collection window.
 *
 * COLLECT is the hard ceiling and sits above the client's own
 * give-up timer, so an honest client always reports before the
 * server stops waiting. REVEAL is the pause after a result is
 * published, covering the count-up animation and the hold.
 */
const FACE_SYNC_COLLECT_MS = 7_000;
const FACE_SYNC_REVEAL_MS = 3_800;
const DEFAULT_ELO = 1000;
const ELO_K = 32;
const RANKED_ELO_ENABLED = process.env.ENABLE_RANKED_ELO === "true";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CONNECTIONS_PER_IP = Math.max(1, Number.parseInt(process.env.MAX_CONNECTIONS_PER_IP || "8", 10) || 8);
const STATIC_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

// Pilot target supplied by the product owner. Keep the fallback deterministic
// while the Celebrity Face mode is being validated with a single reference.
const PILOT_CELEBRITY = {
  id: -1,
  name: "IShowSpeed Squint",
  category: "celebrity",
  imageUrl: "/celebrity-faces/memes/ishowspeed-squint.jpg",
  difficulty: "medium",
  expressionProfile: {
    mouthOpen: 0.0,
    mouthWidth: 0.28,
    mouthSmile: 0.0,
    mouthFrown: 0.15,
    eyeOpen: 0.08,
    eyeSquint: 0.92,
    browRaise: 0.0,
    browDown: 0.55,
    lipPucker: 0.78,
  },
};

/**
 * In-memory celebrity catalogue. Used as a fallback when the
 * database isn't reachable (local dev, fresh container, etc.) so
 * the Celebrity Face Mimic mode still pairs two players and
 * shows a real target image. The list is intentionally small and
 * varied so two different sessions are unlikely to see the same
 * celebrity twice in a row; the matcher still prefers least-used
 * rows when DB persistence is available.
 */
function pickFallbackCelebrity() {
  return {
    id: PILOT_CELEBRITY.id,
    name: PILOT_CELEBRITY.name,
    category: PILOT_CELEBRITY.category,
    imageUrl: PILOT_CELEBRITY.imageUrl,
    difficulty: PILOT_CELEBRITY.difficulty,
    expressionProfile: PILOT_CELEBRITY.expressionProfile,
    facialLandmarks: null,
  };
}
/**
 * In-memory anonymous session fallback. Used when DATABASE_URL
 * isn't configured so the celebrity arena can still pair players
 * during local dev. The fake user id is derived from the bearer
 * token so the same browser tab keeps the same identity across
 * reconnects within the process lifetime.
 */
const memorySessions = new Map(); // tokenHash -> { id, elo }
const memoryUsers = new Map();    // id -> { id, elo, is_vip }
const MEMORY_DEFAULT_ELO = 1000;

// Expose the in-memory session store to the verify-token
// middleware so the socket layer can authenticate DB-less
// dev sessions with the same hash + lookup path.
setMemorySessionStore(memorySessions);
let dbAvailable = true;
let dbWarningShown = false;

const EMOJI_PROMPTS = [
  "\u{1F600}", "\u{1F601}", "\u{1F602}", "\u{1F62E}", "\u{1F632}",
  "\u{1F609}", "\u{1F61C}", "\u{1F621}", "\u{1F624}", "\u{1F622}",
  "\u{1F62D}", "\u{1F60E}", "\u{1F928}", "\u{1F610}", "\u{1F611}",
  "\u{1F633}", "\u{1F62C}", "\u{1F60F}",
];

function pickEmoji() {
  return EMOJI_PROMPTS[Math.floor(Math.random() * EMOJI_PROMPTS.length)];
}

function pickEmojiExcept(previous) {
  if (!previous) return pickEmoji();
  const choices = EMOJI_PROMPTS.filter((e) => e !== previous);
  if (choices.length === 0) return previous;
  return choices[Math.floor(Math.random() * choices.length)];
}

function isDatabaseConnectivityError(err) {
  const code = String(err?.code || "");
  return (
    code.startsWith("08") ||
    ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "57P01", "57P02", "57P03"].includes(code)
  );
}

function warnDbFallback(err) {
  if (!isDatabaseConnectivityError(err)) {
    console.error(`[DB] Query failed without disabling persistence: ${err.message}`);
    return false;
  }
  dbAvailable = false;
  if (!dbWarningShown) {
    dbWarningShown = true;
    console.warn(`[DB] Connectivity unavailable; persistent operations are paused: ${err.message}`);
  }
  return true;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readBoundedString(value, maxLength, { allowEmpty = false } = {}) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if ((!allowEmpty && !normalized) || normalized.length > maxLength) return null;
  return normalized;
}

/**
 * Validate a client-supplied display name. Same rules as the
 * client-side `validateName` helper in `app/lib/storage.ts`:
 *  - non-empty after trimming
 *  - at most 20 characters
 *  - no ASCII control characters
 *
 * The result is kept in socketMeta (in-memory) and is relayed
 * to the partner in `match_started`. The server never writes the
 * name to the database and discards it on disconnect.
 */
function readDisplayName(value) {
  const raw = readBoundedString(value, 20);
  if (!raw) return null;
  if (/[\u0000-\u001F\u007F]/.test(raw)) return null;
  // Keep this guard inside the canonical server parser so every future
  // display-name path receives moderation, even if its caller forgets to
  // perform a separate check.
  if (isInappropriateName(raw)) return null;
  return raw;
}

/**
 * Validate a client-supplied country label. The client has
 * already formatted this as "🇮🇳 India" (flag + display name)
 * via Intl.DisplayNames, so we only bound the length and reject
 * any embedded control characters. The same value is in
 * `lib/country.ts` on the frontend.
 */
function readCountryLabel(value) {
  const raw = readBoundedString(value, 64);
  if (!raw) return null;
  if (/[\u0000-\u001F\u007F]/.test(raw)) return null;
  return raw;
}

/**
 * Validate a client-supplied 2-letter ISO country code (e.g. "IN",
 * "US"). This is the preferred wire format — small, unambiguous,
 * and lets the receiving client render the flag via regional
 * indicators regardless of how the sender formatted the display
 * string. The label is kept for backwards compatibility with
 * older clients and as a fallback when the code is missing.
 */
function readCountryCode(value) {
  if (typeof value !== "string") return null;
  const cc = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  return cc;
}

/**
 * Best-effort extraction of a 2-letter ISO code from a country
 * display string the client might have sent. Handles both
 * "🇮🇳 India" (regional indicators at the start) and plain
 * "IN" (raw code). Returns null when the string is not
 * recognisable.
 */
function extractCountryCode(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Raw 2-letter code: "IN", "US", "GB".
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  // Regional-indicator flag at the start: "🇮🇳 India".
  // Each regional indicator (U+1F1E6..U+1F1FF) maps to A..Z.
  const regionalIndicatorStart = 0x1f1e6;
  const chars = Array.from(trimmed);
  if (chars.length >= 2) {
    const c1 = chars[0].codePointAt(0);
    const c2 = chars[1].codePointAt(0);
    if (
      c1 >= regionalIndicatorStart &&
      c1 <= regionalIndicatorStart + 25 &&
      c2 >= regionalIndicatorStart &&
      c2 <= regionalIndicatorStart + 25
    ) {
      return String.fromCharCode(c1 - regionalIndicatorStart + 65) +
        String.fromCharCode(c2 - regionalIndicatorStart + 65);
    }
  }
  return null;
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
    maxAge: SESSION_TTL_MS,
  };
}

function requireTrustedMutationOrigin(req, res, next) {
  if (req.headers.authorization?.startsWith("Bearer ")) return next();
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : null;
  if (origin && allowedOrigins.includes(origin)) return next();
  if (!origin && process.env.NODE_ENV !== "production") return next();
  return res.status(403).json({ detail: "Untrusted request origin." });
}

function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    socketId: row.socket_id,
    elo: row.elo,
    isVIP: row.is_vip,
    deviceId: row.device_id ?? null,
    createdAt: row.created_at,
  };
}

function expectedEloScore(playerElo, opponentElo) {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

function calculateEloShift(playerElo, opponentElo, outcome) {
  const expected = expectedEloScore(playerElo, opponentElo);
  const delta = Math.round(ELO_K * (outcome - expected));
  return {
    oldElo: playerElo,
    newElo: playerElo + delta,
    delta,
    expected,
  };
}

function tierForElo(elo) {
  if (elo <= 1000) return "Statue";
  if (elo <= 1500) return "Novice";
  if (elo <= 2000) return "Actor";
  return "Jim Carrey";
}

function calculateMatchElo(player1Elo, player2Elo, player1Score, player2Score) {
  const player1Outcome = player1Score === player2Score ? 0.5 : player1Score > player2Score ? 1 : 0;
  const player2Outcome = player1Score === player2Score ? 0.5 : player2Score > player1Score ? 1 : 0;
  const player1 = calculateEloShift(player1Elo, player2Elo, player1Outcome);
  const player2 = calculateEloShift(player2Elo, player1Elo, player2Outcome);

  return {
    player1: { ...player1, tier: tierForElo(player1.newElo), outcome: player1Outcome },
    player2: { ...player2, tier: tierForElo(player2.newElo), outcome: player2Outcome },
  };
}

function isoFlag(code) {
  const cc = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  return cc.replace(/./g, (c) => String.fromCodePoint(127462 + c.charCodeAt(0) - 65));
}

function countryLabelFromCode(code) {
  const cc = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  const flag = isoFlag(cc);
  let name = null;
  try {
    name = new Intl.DisplayNames(["en"], { type: "region" }).of(cc);
  } catch {}
  return name ? `${flag} ${name}` : flag;
}

/* ─── Chat hygiene ──────────────────────────────────────────────────────────
 * Server-authoritative profanity scrub. Runs once on the inbound
 * chat_message before the relay, so a tampered client cannot bypass
 * it. The list is intentionally small — it's a v1 filter, not a
 * comprehensive moderation pass. A real follow-up would swap this
 * for a proper lexicon and add per-user strike tracking.
 *
 * We keep the first character of the word so the partner still gets
 * a sense of the original ("f***" instead of "****") and we don't
 * re-invent the obfuscation on every render. The pattern is
 * word-boundary, case-insensitive. Deliberately doesn't try to
 * decode leet-speak ("f1ck", "f.u.c.k") in v1 — that belongs in
 * the same follow-up as the proper lexicon.
 */
const CHAT_BANNED_WORDS = [
  "fuck", "shit", "bitch", "asshole", "bastard",
  "cunt", "dick", "piss", "slut", "whore",
  "nigger", "faggot",
];
function scrubChatText(raw) {
  if (typeof raw !== "string" || raw.length === 0) return "";
  const pattern = new RegExp(
    `\\b(${CHAT_BANNED_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
    "gi",
  );
  return raw.replace(pattern, (match) =>
    match.length <= 2
      ? "*".repeat(match.length)
      : `${match[0]}${"*".repeat(match.length - 1)}`,
  );
}

app.use(express.json({
  limit: "1mb",
  verify: (req, _res, buffer) => { req.rawBody = buffer.toString("utf8"); },
}));

// Apply rate limiting to all /api routes
app.use("/api", apiLimiter);

// ─── Anonymous authenticated sessions ───────────────────────────────────────
app.post("/api/session", sessionLimiter, requireTrustedMutationOrigin, async (req, res) => {
  const requestedDeviceId = UUID_PATTERN.test(req.body?.deviceId || "")
    ? req.body.deviceId
    : crypto.randomUUID();
  // DB-less dev mode: serve a fully in-memory session so the
  // celebrity arena (and the rest of the matchmaking pipeline)
  // can run end-to-end without a Postgres connection. Tokens
  // are still 64-hex, still validated by the socket layer.
  if (!process.env.DATABASE_URL || !dbAvailable) {
    const existingToken = extractSessionResumeToken(req);
    if (existingToken && STATIC_TOKEN_PATTERN.test(existingToken)) {
      const existing = memorySessions.get(existingToken);
      if (existing) {
        return res.json({
          id: existing.id,
          elo: existing.elo,
          isVIP: false,
          deviceId: existing.deviceId ?? requestedDeviceId,
          socketToken: existingToken,
        });
      }
    }
    const userId = crypto.randomUUID();
    const rawToken = crypto.randomBytes(32).toString("hex");
    memoryUsers.set(userId, { id: userId, elo: MEMORY_DEFAULT_ELO, is_vip: false, device_id: requestedDeviceId });
    memorySessions.set(rawToken, { id: userId, elo: MEMORY_DEFAULT_ELO, device_id: requestedDeviceId });
    return res.status(201).json({
      id: userId,
      elo: MEMORY_DEFAULT_ELO,
      isVIP: false,
      deviceId: requestedDeviceId,
      socketToken: rawToken,
    });
  }

  // Cookies are origin-wide, so using one here collapses every open tab into
  // the same anonymous user. A tab resumes only with the bearer token kept in
  // its own sessionStorage; otherwise it receives a new anonymous session.
  const existingToken = extractSessionResumeToken(req);
  if (existingToken) {
    try {
      const existingUser = await findSessionUser(existingToken);
      if (existingUser) {
        if (!existingUser.device_id) {
          await pool.query(`UPDATE users SET device_id = $1 WHERE id = $2 AND device_id IS NULL`, [requestedDeviceId, existingUser.id]);
          existingUser.device_id = requestedDeviceId;
        }
        res.cookie(SESSION_COOKIE_NAME, existingToken, sessionCookieOptions());
        return res.json({
          id: existingUser.id,
          elo: existingUser.elo,
          isVIP: existingUser.is_vip === true,
          deviceId: existingUser.device_id,
          socketToken: existingToken,
        });
      }
    } catch (err) {
      warnDbFallback(err);
      return res.status(503).json({ detail: "Session service unavailable." });
    }
  }

  const userId = crypto.randomUUID();
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(rawToken);
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO users (id, device_id) VALUES ($1, $2)
       RETURNING id, elo, is_vip`,
      [userId, requestedDeviceId],
    );
    await client.query(
      `INSERT INTO sessions (token, user_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [tokenHash, userId],
    );
    await client.query("COMMIT");
    res.cookie(SESSION_COOKIE_NAME, rawToken, sessionCookieOptions());
    return res.status(201).json({
      id: rows[0].id,
      elo: rows[0].elo,
      isVIP: rows[0].is_vip === true,
      deviceId: requestedDeviceId,
      socketToken: rawToken,
    });
  } catch (err) {
    await client?.query("ROLLBACK").catch(() => {});
    warnDbFallback(err);
    return res.status(503).json({ detail: "Could not create a session." });
  } finally {
    client?.release();
  }
});

app.get("/api/users/me", verifyToken, (req, res) => {
  return res.json({
    id: req.user.id,
    elo: req.user.elo,
    isVIP: req.user.is_vip === true,
  });
});

const SUPPORT_PRODUCT_ID = process.env.DODO_PAYMENTS_PRODUCT_ID || "";
function dodoIsConfigured() {
  return Boolean(process.env.DODO_PAYMENTS_API_KEY && process.env.DODO_PAYMENTS_WEBHOOK_KEY && SUPPORT_PRODUCT_ID);
}
function createDodoClient() {
  return new DodoPayments({
    bearerToken: process.env.DODO_PAYMENTS_API_KEY,
    webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY,
    environment: process.env.DODO_PAYMENTS_ENVIRONMENT === "test_mode" ? "test_mode" : "live_mode",
  });
}
app.post("/api/billing/checkout", sessionLimiter, requireTrustedMutationOrigin, verifyToken, async (req, res) => {
  if (!dodoIsConfigured()) return res.status(503).json({ detail: "Dodo Payments is not configured." });
  const amount = supportAmountInCents(req.body?.amount);
  if (amount === null) return res.status(400).json({ detail: "Enter a USD amount of at least $1.00, with no more than two decimal places." });
  try {
    const dodo = createDodoClient();
    const product = await dodo.products.retrieve(SUPPORT_PRODUCT_ID);
    if (product.price?.type !== "one_time_price" || product.price.currency !== "USD" ||
        product.price.pay_what_you_want !== true || product.price.price !== MIN_SUPPORT_CENTS) {
      return res.status(503).json({ detail: "Support checkout is not configured yet. Please try again later." });
    }
    const baseUrl = (process.env.DODO_PAYMENTS_RETURN_URL || "https://emoggle.com/").replace(/\/$/, "");
    const session = await dodo.checkoutSessions.create({
      product_cart: [{ product_id: SUPPORT_PRODUCT_ID, quantity: 1, amount }],
      return_url: `${baseUrl}/?support=returned`,
      cancel_url: `${baseUrl}/?support=cancelled`,
      metadata: {
        device_id: req.user.device_id,
        purpose: "emoggle_support",
        amount_cents: String(amount),
      },
    });
    if (!session.checkout_url) return res.status(502).json({ detail: "Dodo did not return a checkout URL." });
    return res.json({ checkoutUrl: session.checkout_url });
  } catch (err) {
    console.error("[Dodo] Checkout session creation failed:", err.message);
    return res.status(502).json({ detail: "Could not start Dodo checkout." });
  }
});

app.post("/api/webhooks/dodo", async (req, res) => {
  if (!process.env.DODO_PAYMENTS_WEBHOOK_KEY) return res.status(503).json({ detail: "Dodo webhook is not configured." });
  const headers = {
    "webhook-id": typeof req.headers["webhook-id"] === "string" ? req.headers["webhook-id"] : "",
    "webhook-signature": typeof req.headers["webhook-signature"] === "string" ? req.headers["webhook-signature"] : "",
    "webhook-timestamp": typeof req.headers["webhook-timestamp"] === "string" ? req.headers["webhook-timestamp"] : "",
  };
  let event;
  try {
    if (!req.rawBody) return res.status(400).json({ detail: "Webhook body is missing." });
    event = createDodoClient().webhooks.unwrap(req.rawBody, { headers });
  } catch {
    return res.status(401).json({ detail: "Invalid Dodo webhook signature." });
  }
  const eventId = headers["webhook-id"];
  if (!eventId || eventId.length > 255) return res.status(400).json({ detail: "Invalid Dodo event ID." });
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO dodo_webhook_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id`,
      [eventId],
    );
    if (inserted.rowCount === 0) {
      await client.query("COMMIT");
      return res.status(204).end();
    }
    if (event.type === "payment.succeeded") {
      const payment = event.data || {};
      const deviceId = payment.metadata?.device_id;
      const amount = Number(payment.metadata?.amount_cents);
      const chargedAmount = payment.total_amount;
      if (payment.metadata?.purpose === "emoggle_support" && payment.payment_id &&
          UUID_PATTERN.test(deviceId || "") && Number.isSafeInteger(amount) && amount >= MIN_SUPPORT_CENTS) {
        await client.query(
          `INSERT INTO support_payments (payment_id, device_id, requested_amount_cents, charged_amount_cents, currency)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (payment_id) DO NOTHING`,
          [payment.payment_id, deviceId, amount,
            Number.isSafeInteger(chargedAmount) && chargedAmount >= 0 ? chargedAmount : null,
            typeof payment.currency === "string" ? payment.currency : null],
        );
      }
    } else if (event.type === "refund.succeeded" && event.data?.is_partial !== true && event.data?.payment_id) {
      await client.query(
        `UPDATE support_payments SET refunded = true WHERE payment_id = $1`,
        [event.data.payment_id],
      );
    }
    await client.query("COMMIT");
    return res.status(204).end();
  } catch (err) {
    await client?.query("ROLLBACK").catch(() => {});
    warnDbFallback(err);
    return res.status(503).json({ detail: "Dodo event could not be recorded." });
  } finally {
    client?.release();
  }
});

app.delete("/api/session", requireTrustedMutationOrigin, verifyToken, async (req, res) => {
  try {
    await pool.query(`DELETE FROM sessions WHERE token = $1`, [req.sessionTokenHash]);
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    });
    return res.status(204).end();
  } catch (err) {
    warnDbFallback(err);
    return res.status(503).json({ detail: "Could not end the session." });
  }
});

// Proxy the private AI judge so its shared secret is never shipped to browsers.
app.post("/api/judge", sessionLimiter, requireTrustedMutationOrigin, verifyToken, async (req, res) => {
  const judgeUrl = (process.env.AI_JUDGE_URL || "").replace(/\/$/, "");
  const judgeSecret = process.env.AI_JUDGE_SHARED_SECRET || "";
  if (!judgeUrl || judgeSecret.length < 32) {
    return res.status(503).json({ detail: "AI judge is not configured." });
  }
  if (!isPlainObject(req.body) || typeof req.body.image !== "string" || req.body.image.length > 900_000) {
    return res.status(413).json({ detail: "Image payload is missing or too large." });
  }
  try {
    const upstream = await fetch(`${judgeUrl}/judge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AI-Judge-Key": judgeSecret,
      },
      body: JSON.stringify({ image: req.body.image }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await upstream.text();
    res.status(upstream.status).type("application/json").send(body.slice(0, 64 * 1024));
  } catch (err) {
    console.error("[Judge] Upstream request failed:", err.message);
    return res.status(502).json({ detail: "AI judge unavailable." });
  }
});

// Celebrity data requires a player session.
try {
  const celebrityRouter = require("./routes/celebrity");
  app.use("/api/celebrity", verifyToken, celebrityRouter);
  console.log("[Celebrity] Protected routes mounted at /api/celebrity");
} catch (e) {
  console.warn("[Celebrity] Could not mount celebrity routes:", e?.message);
}

app.get("/api/geo", (req, res) => {
  const headers = req.headers || {};
  const trustGeoHeaders = process.env.TRUST_GEO_HEADERS === "true";
  let codeHeader = trustGeoHeaders
    ? headers["cf-ipcountry"] || headers["x-vercel-ip-country"]
    : null;
  if (Array.isArray(codeHeader)) codeHeader = codeHeader[0];
  let countryCode = typeof codeHeader === "string" && codeHeader.length === 2 ? String(codeHeader).toUpperCase() : null;
  const source = countryCode ? "trusted-edge-header" : "unavailable";
  const flag = countryCode ? isoFlag(countryCode) : null;
  let countryName = null;
  try {
    if (countryCode) countryName = new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode);
  } catch {}
  const country = countryCode ? (countryName ? `${flag} ${countryName}` : flag) : null;
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ countryCode: countryCode || null, country, source });
});

async function finalizeMatchScores(matchId, match, player1Score, player2Score, winnerId) {
  const unrankedResult = () => {
    const p1Meta = socketMeta.get(match.player1SocketId);
    const p2Meta = socketMeta.get(match.player2SocketId);
    const p1Elo = p1Meta?.elo ?? match.player1Elo ?? DEFAULT_ELO;
    const p2Elo = p2Meta?.elo ?? match.player2Elo ?? DEFAULT_ELO;
    return {
      player1: { oldElo: p1Elo, newElo: p1Elo, delta: 0, tier: tierForElo(p1Elo) },
      player2: { oldElo: p2Elo, newElo: p2Elo, delta: 0, tier: tierForElo(p2Elo) },
    };
  };

  if (!dbAvailable) return unrankedResult();

  // Celebrity matches are a separate game mode. By default they do
  // NOT affect the player's ranked ELO — the spec calls this out
  // explicitly, and a future product can flip the behaviour on
  // with `CELEBRITY_AFFECTS_ELO=true` without touching the match
  // lifecycle code.
  const isCelebrity = match.gameMode === CELEBRITY_GAME_MODE;
  const eloEligible = RANKED_ELO_ENABLED && (!isCelebrity || CELEBRITY_AFFECTS_ELO);

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const p1Res = await client.query(`SELECT elo FROM users WHERE id = $1`, [match.player1Id]);
    const p2Res = await client.query(`SELECT elo FROM users WHERE id = $1`, [match.player2Id]);

    const player1Elo = p1Res.rows[0]?.elo ?? DEFAULT_ELO;
    const player2Elo = p2Res.rows[0]?.elo ?? DEFAULT_ELO;
    const elo = eloEligible
      ? calculateMatchElo(player1Elo, player2Elo, player1Score, player2Score)
      : unrankedResult();

    if (eloEligible) {
      await client.query(`UPDATE users SET elo = $1 WHERE id = $2`, [elo.player1.newElo, match.player1Id]);
      await client.query(`UPDATE users SET elo = $1 WHERE id = $2`, [elo.player2.newElo, match.player2Id]);
    }
    await client.query(
      `UPDATE matches SET status = $1, player1_score = $2, player2_score = $3, winner_id = $4, completed_at = $5 WHERE id = $6`,
      ["COMPLETED", player1Score, player2Score, winnerId, new Date(), matchId]
    );

    // Bump the celebrity's usage_count so future matchmaking can
    // bias towards under-used rows. Done in the same transaction
    // so a single failure rolls both updates back together.
    if (isCelebrity && Number.isInteger(match.celebrityId)) {
      await client.query(
        `UPDATE celebrity_faces SET usage_count = usage_count + 1 WHERE id = $1`,
        [match.celebrityId]
      );
    }

    await client.query("COMMIT");
    return elo;
  } catch (err) {
    await client?.query("ROLLBACK").catch(() => {});
    warnDbFallback(err);
    return unrankedResult();
  } finally {
    client?.release();
  }
}

// ─── Queue helpers ───────────────────────────────────────────────────────────
function removeFromQueue(socketId) {
  const idx = waitingQueue.findIndex((u) => u.socketId === socketId);
  if (idx !== -1) waitingQueue.splice(idx, 1);
}

// ─── Match cleanup (zero leaks) ─────────────────────────────────────────────
function clearMatchState(matchId) {
  const match = activeMatches.get(matchId);
  if (!match) return [];

  // Clear the countdown timer
  if (match.timerId) {
    clearInterval(match.timerId);
    match.timerId = null;
  }
  if (match.finalizationTimerId) {
    clearTimeout(match.finalizationTimerId);
    match.finalizationTimerId = null;
  }
  if (match.faceSyncTimerId) {
    clearTimeout(match.faceSyncTimerId);
    match.faceSyncTimerId = null;
  }
  // Facial geometry never outlives the match it was sent for, so
  // it goes here rather than waiting for the object to be
  // collected. Skipping to a new stranger genuinely discards the
  // previous one's data.
  if (match.faceSyncReports) match.faceSyncReports.clear();
  match.resolveFaceSync = null;

  const sockets = [match.player1SocketId, match.player2SocketId];

  // Leave room and unlink
  for (const sid of sockets) {
    const s = io.sockets.sockets.get(sid);
    if (s) s.leave(match.roomId);
  }

  activeMatches.delete(matchId);
  return sockets;
}

/**
 * Emit one immutable, player-relative result for a match. The first
 * caller that observes both scores flips resultSent before awaiting
 * persistence, so duplicate score packets and the deadline callback
 * cannot finalize the same round twice.
 */
async function finalizeMatchResult(matchId, { fillMissing = false } = {}) {
  const match = activeMatches.get(matchId);
  if (!match || match.resultSent) return false;

  if (fillMissing) {
    for (const socketId of [match.player1SocketId, match.player2SocketId]) {
      if (!Object.hasOwn(match.scores, socketId)) {
        match.scores[socketId] = deadlineRoundScore(match.liveScores[socketId] || []);
      }
    }
  }

  const p1Score = match.scores[match.player1SocketId];
  const p2Score = match.scores[match.player2SocketId];
  if (typeof p1Score !== "number" || typeof p2Score !== "number") return false;

  match.resultSent = true;
  if (match.finalizationTimerId) {
    clearTimeout(match.finalizationTimerId);
    match.finalizationTimerId = null;
  }

  const p1 = io.sockets.sockets.get(match.player1SocketId);
  const p2 = io.sockets.sockets.get(match.player2SocketId);
  const winnerSocketId =
    p1Score === p2Score
      ? null
      : p1Score > p2Score
        ? match.player1SocketId
        : match.player2SocketId;
  const winnerId =
    winnerSocketId === match.player1SocketId
      ? match.player1Id
      : winnerSocketId === match.player2SocketId
        ? match.player2Id
        : null;

  const elo = await finalizeMatchScores(matchId, match, p1Score, p2Score, winnerId);
  const resultPayloads = buildMatchResultPayloads({
    matchId,
    match,
    player1Score: p1Score,
    player2Score: p2Score,
    elo,
  });

  p1?.emit("scores_ready", { myScore: p1Score, partnerScore: p2Score });
  p2?.emit("scores_ready", { myScore: p2Score, partnerScore: p1Score });

  // Always emit the canonical `match_result` event so the front-end
  // can listen to a single channel. Celebrity rounds attach a
  // `celebrity` reference so the result screen can render the
  // "you were imitating X" line without a second round-trip.
  const isCelebrity = match.gameMode === CELEBRITY_GAME_MODE;
  const celebrityResult = isCelebrity
    ? { id: match.celebrityId ?? null, name: match.celebrityName ?? null }
    : null;
  p1?.emit("match_result", { ...resultPayloads.player1, celebrity: celebrityResult });
  p2?.emit("match_result", { ...resultPayloads.player2, celebrity: celebrityResult });

  // The result payload is now self-contained on each client. Release
  // the room/server match immediately without emitting match_ended;
  // this preserves the visible result and lets either player enter a
  // new queue independently when they choose Play Again.
  clearMatchState(matchId);
  return true;
}

function getMatchBySocket(socketId) {
  for (const [matchId, m] of activeMatches) {
    if (m.player1SocketId === socketId || m.player2SocketId === socketId) {
      return { matchId, ...m };
    }
  }
  return null;
}

// ─── Sync user on socket connection (raw UPDATE/SELECT) ─────────────────────
async function ensureUser(socketId, userId) {
  if (!UUID_PATTERN.test(userId || "")) throw new Error("Authenticated user ID is invalid");
  // DB-less dev: the in-memory user map is authoritative. The
  // socket_id field is meaningless here (we never reconnect to a
  // process restart), so we just refresh the entry.
  if (!dbAvailable) {
    const existing = memoryUsers.get(userId);
    if (!existing) throw new Error("Authenticated user no longer exists");
    existing.socketId = socketId;
    return {
      id: existing.id,
      socketId,
      elo: existing.elo,
      isVIP: existing.is_vip === true,
      deviceId: existing.device_id ?? null,
      createdAt: existing.createdAt ?? null,
    };
  }

  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query(
      `UPDATE users SET socket_id = $1 WHERE id = $2 RETURNING *`,
      [socketId, userId],
    );
    if (rows.length === 0) throw new Error("Authenticated user no longer exists");
    return mapUserRow(rows[0]);
  } catch (err) {
    warnDbFallback(err);
    throw err;
  } finally {
    client?.release();
  }
}

// ─── Start a 1v1 match ──────────────────────────────────────────────────────

/**
 * Pick a celebrity reference for a single round. Reads from the
 * DB when available (least-used-first so the catalogue gets
 * even rotation) and falls back to the in-memory catalogue when
 * the database isn't connected. Returns `null` only when both
 * the DB and the fallback catalogue are empty.
 */
async function pickMatchCelebrity(client = null) {
  if (dbAvailable) {
    const useExternalClient = Boolean(client);
    const connection = client ?? (await pool.connect());
    try {
      const { rows } = await connection.query(
        `SELECT id, name, category, image_url, difficulty, facial_landmarks, expression_profile
           FROM celebrity_faces
          WHERE name = $1
          ORDER BY usage_count ASC, RANDOM()
          LIMIT 1`,
        [PILOT_CELEBRITY.name],
      );
      const face = rows[0];
      if (face) {
        return {
          id: face.id,
          name: face.name,
          category: face.category,
          imageUrl: face.image_url,
          difficulty: face.difficulty,
          facialLandmarks: face.facial_landmarks ?? null,
          expressionProfile: face.expression_profile ?? null,
        };
      }
    } catch (err) {
      warnDbFallback(err);
    } finally {
      if (!useExternalClient) connection.release();
    }
  }
  return pickFallbackCelebrity();
}

async function startMatch(socket, partner) {
  const partnerSocket = io.sockets.sockets.get(partner.socketId);
  if (!partnerSocket) return false;

  const meta1 = socketMeta.get(socket.id);
  const meta2 = socketMeta.get(partner.socketId);
  if (!meta1 || !meta2) return false;
  if (meta1.gameMode !== meta2.gameMode) return false;

  const emoji = pickEmoji();
  const gameMode = readGameMode(meta1.gameMode);
  const isCelebrityRound = gameMode === CELEBRITY_GAME_MODE;
  const isFaceSyncRound = gameMode === FACE_SYNC_GAME_MODE;

  // Pick the celebrity target for this round at the same moment
  // we mint the match id, so both clients always see the same
  // target even if the catalogue changes mid-round.
  let matchId;
  let celebrity;
  let client;
  try {
    if (!dbAvailable) throw new Error("Database unavailable");
    client = await pool.connect();
    await client.query("BEGIN");
    const candidate = isCelebrityRound ? await pickMatchCelebrity(client) : null;
    if (isCelebrityRound && !candidate) {
      await client.query("ROLLBACK");
      socket.emit("server_error", { detail: "No celebrity references are available." });
      partnerSocket.emit("server_error", { detail: "No celebrity references are available." });
      return false;
    }
    matchId = crypto.randomUUID();
    if (isCelebrityRound) {
      await client.query(
        `INSERT INTO matches
           (id, player1_id, player2_id, current_emoji, status, game_mode, celebrity_id, celebrity_name)
         VALUES ($1, $2, $3, $4, 'ACTIVE', 'celebrity', $5, $6)`,
        [matchId, meta1.userId, meta2.userId, emoji, candidate.id > 0 ? candidate.id : null, candidate.name],
      );
    } else {
      await client.query(
        `INSERT INTO matches
           (id, player1_id, player2_id, current_emoji, status, game_mode)
         VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
        // A FaceSync round never uses the emoji, but the column is
        // NOT NULL and carrying one keeps the row shape identical
        // to every other match.
        [matchId, meta1.userId, meta2.userId, emoji, gameMode],
      );
    }
    await client.query("COMMIT");
    celebrity = candidate;
  } catch (err) {
    await client?.query("ROLLBACK").catch(() => {});
    warnDbFallback(err);
    // Local development uses isolated in-memory users when Supabase is offline.
    const allowDbLessLocalMatch = process.env.NODE_ENV !== "production";
    if ((isCelebrityRound || isFaceSyncRound) && !allowDbLessLocalMatch) {
      socket.emit("server_error", { detail: "Could not start this match. Please retry." });
      partnerSocket.emit("server_error", { detail: "Could not start this match. Please retry." });
      return false;
    }
    // DB-less local mode still pairs every game mode. Celebrity rounds receive
    // the pilot target; emoji and FaceSync rounds need no external target.
    celebrity = isCelebrityRound ? pickFallbackCelebrity() : null;
    if (isCelebrityRound && !celebrity) {
      socket.emit("server_error", { detail: "Match persistence is unavailable." });
      partnerSocket.emit("server_error", { detail: "Match persistence is unavailable." });
      return false;
    }
    matchId = crypto.randomUUID();
  } finally {
    client?.release();
  }

  const roomId = `match_${matchId}`;
  socket.join(roomId);
  partnerSocket.join(roomId);

  // ── Round schedule: one absolute timeline ──
  // The countdown deadline is shared: both clients translate it
  // into their own clock (see `app/lib/serverClock.ts`) and count
  // 3-2-1 together. The scan window published here is what the
  // server itself scores against — each client runs its own
  // 10-second window from the moment the "go" packet reaches it,
  // so a slow link costs a later finish, never a shorter round.
  //
  // The FaceSync lead-in sits in front of all of it. The timeline
  // published at match start assumes the worst case (nobody
  // reports, the collection window runs out); the real countdown
  // deadline is republished the moment FaceSync resolves, and the
  // clients adopt it through the same schedule-refinement path
  // every countdown tick already uses.
  /*
   * FaceSync rides on the emoji duel only. The celebrity arena
   * shares this matchmaking pipeline but renders its own screen and
   * never reports geometry, so opening a lead-in for it would stall
   * every celebrity round for the full collection window with
   * nothing on screen. Celebrity matches keep their exact previous
   * timeline.
   */
  const faceSyncEnabled = gameMode === EMOJI_GAME_MODE || isFaceSyncRound;

  const roundStartedAt = Date.now();
  const faceSyncEndsAt = roundStartedAt + (faceSyncEnabled ? FACE_SYNC_COLLECT_MS : 0);
  const countdownEndsAt = faceSyncEndsAt + ROUND_COUNTDOWN_SEC * 1000;
  const scanStartsAt = countdownEndsAt;
  const scanEndsAt = scanStartsAt + MATCH_DURATION_SEC * 1000;

  activeMatches.set(matchId, {
    roomId,
    player1SocketId: socket.id,
    player2SocketId: partner.socketId,
    player1Id: meta1.userId,
    player2Id: meta2.userId,
    player1Elo: meta1.elo ?? DEFAULT_ELO,
    player2Elo: meta2.elo ?? DEFAULT_ELO,
    timerId: null,
    finalizationTimerId: null,
    faceSyncTimerId: null,
    scores: {},
    liveScores: {},
    // Set upfront (not when the countdown fires) so the score
    // window guards validate against the same timeline the
    // clients were handed at match start. Both move once when the
    // FaceSync lead-in resolves and the countdown actually begins.
    countdownEndsAt,
    scanStartedAt: scanStartsAt,
    scanEndsAt,
    faceSyncEndsAt,
    /*
     * FaceSync state. `reports` holds each player's one-shot
     * submission, keyed by socket id: a validated geometry vector,
     * or null when they told us they have nothing.
     *
     * These vectors are the only facial data the server ever
     * touches. They live here, on an in-memory match object, for
     * the few seconds the lead-in lasts; they are never written to
     * the database, never logged, and go away with the match. They
     * are ~20 distance ratios, not images and not the landmark
     * mesh — nobody can be identified or reconstructed from one.
     */
    faceSyncReports: new Map(),
    faceSyncResolved: false,
    resultSent: false,
    // The emoji stays mutable until the round actually starts.
    // Once the scan timer begins we set emojiLocked=true so the
    // "change emoji" control goes dim on both clients at the same
    // moment. currentEmoji is the source of truth used by the
    // change_emoji handler to keep the swap deterministic on both
    // screens.
    currentEmoji: emoji,
    emojiLocked: false,
    gameMode,
    celebrityId: celebrity?.id ?? null,
    celebrityName: celebrity?.name ?? null,
  });

  socket.emit("usage_update", { isVIP: meta1.isVIP === true });
  partnerSocket.emit("usage_update", { isVIP: meta2.isVIP === true });

  // Celebrity payload included in the canonical match_started
  // event. The client uses this to render the reference image
  // and the local scorer uses the expression profile. Kept
  // here (rather than only in the legacy `celebrity_match_started`
  // event) so the existing emoji matchmaking pipeline doesn't
  // need a second round-trip.
  const celebrityPayload = celebrity
    ? {
        id: celebrity.id,
        name: celebrity.name,
        category: celebrity.category,
        imageUrl: celebrity.imageUrl,
        difficulty: celebrity.difficulty,
        expressionProfile: celebrity.expressionProfile,
      }
    : null;

  // Emit match_started to both players with stranger's details.
  // `partnerCountryCode` is the canonical 2-letter ISO code;
  // `partnerCountry` is kept for legacy clients (display string
  // with the flag already embedded). Newer clients should
  // prefer the code and derive the flag locally — that way a
  // sender with a broken display string can't make the partner
  // see "IN" where they should see 🇮🇳.
  // The shared timeline travels with the match payload. `serverTime`
  // is stamped per-emit so a client that has not completed a
  // `time_sync` handshake can still derive the schedule from the
  // one-way delta (target - serverTime) instead of trusting its own
  // (possibly wrong) device clock.
  // Reads the live match object rather than closing over the
  // values computed above, because the FaceSync lead-in moves the
  // countdown once it resolves and every later emit has to carry
  // the corrected timeline.
  const schedulePayload = () => {
    const current = activeMatches.get(matchId);
    return {
      serverTime: Date.now(),
      roundStartedAt,
      countdownEndsAt: current?.countdownEndsAt ?? countdownEndsAt,
      scanStartsAt: current?.scanStartedAt ?? scanStartsAt,
      scanEndsAt: current?.scanEndsAt ?? scanEndsAt,
      faceSyncEndsAt: current?.faceSyncEndsAt ?? faceSyncEndsAt,
      countdownSec: ROUND_COUNTDOWN_SEC,
      duration: MATCH_DURATION_SEC,
    };
  };

  socket.emit("match_started", {
    matchId,
    partnerPeerId: meta2.peerId,
    partnerCountry: meta2.country ?? null,
    partnerCountryCode: meta2.countryCode ?? null,
    partnerName: meta2.displayName ?? null,
    role: "receiver",
    emoji,
    celebrity: celebrityPayload,
    ...schedulePayload(),
  });
  partnerSocket.emit("match_started", {
    matchId,
    partnerPeerId: meta1.peerId,
    partnerCountry: meta1.country ?? null,
    partnerCountryCode: meta1.countryCode ?? null,
    partnerName: meta1.displayName ?? null,
    role: "caller",
    emoji,
    celebrity: celebrityPayload,
    ...schedulePayload(),
  });

  console.log(
    `[M] Match ${matchId}: ${partner.socketId} <-> ${socket.id} | mode=${gameMode}` +
      (celebrity ? ` target=${celebrity.id} (${celebrity.name})` : ` emoji=${emoji}`)
  );

  // Pre-round countdown. The tick is derived from the absolute
  // `countdownEndsAt` on every pass rather than by decrementing a
  // counter, so a busy event loop can never make one room's
  // countdown run long. Clients render their countdown from the
  // schedule too — these ticks are a redundant nudge, not the
  // source of truth. When it reaches zero the `emoji_locked`
  // broadcast is the round's "go": each client starts its own
  // 10-second scan window the moment that packet lands, so nobody
  // plays a short round because of their link.
  //
  // Unchanged apart from when it is armed: `beginCountdown` runs
  // once the FaceSync lead-in has resolved, and rebases the
  // timeline onto that moment so the countdown is always a real
  // three seconds rather than whatever the lead-in left over.
  const beginCountdown = () => {
    const active = activeMatches.get(matchId);
    if (!active || active.timerId) return;

    const startedAt = Date.now();
    active.countdownEndsAt = startedAt + ROUND_COUNTDOWN_SEC * 1000;
    active.scanStartedAt = active.countdownEndsAt;
    active.scanEndsAt = active.scanStartedAt + MATCH_DURATION_SEC * 1000;
    active.faceSyncEndsAt = startedAt;

    let lastCount = null;
    const emitTick = (count) => {
      lastCount = count;
      io.to(roomId).emit("countdown_tick", {
        matchId,
        count,
        ...schedulePayload(),
      });
    };
    emitTick(ROUND_COUNTDOWN_SEC);

    const timerId = setInterval(() => {
      const now = Date.now();
      const current = activeMatches.get(matchId);
      if (!current) {
        clearInterval(timerId);
        return;
      }
      const deadline = current.countdownEndsAt;
      const count = Math.max(0, Math.ceil((deadline - now) / 1000));
      if (count !== lastCount) emitTick(count);

      if (now < deadline) return;

      clearInterval(timerId);
      current.timerId = null;
      // The scan window is open — the emoji is locked. Either
      // client that tries to change it now gets a silent no-op.
      current.emojiLocked = true;
      if (lastCount !== 0) emitTick(0);
      // Finalization is pinned to the absolute deadline that was
      // published to the clients, so the fallback fires the same
      // distance after the scan window no matter how late this
      // interval happened to run.
      current.finalizationTimerId = setTimeout(
        () => {
          void finalizeMatchResult(matchId, { fillMissing: true }).catch((err) => {
            console.error(`[SCORE] Deadline finalization failed for ${matchId}:`, err.message);
          });
        },
        Math.max(0, current.scanEndsAt + SCORE_SUBMISSION_GRACE_MS - Date.now()),
      );
      io.to(roomId).emit("emoji_locked", {
        matchId,
        ...schedulePayload(),
      });
      console.log(`[T] Match ${matchId} scan started (emoji locked)`);
    }, 200);

    active.timerId = timerId;
  };

  /*
   * Close the FaceSync lead-in and start the round.
   *
   * Called from three places: both players have reported, the
   * collection window expired, or the match ended underneath us.
   * Idempotent via `faceSyncResolved`, because the first two can
   * race — a report landing in the same tick as the deadline.
   *
   * When a result exists the countdown is held back by REVEAL so
   * the number has time to animate and sit. When it does not, the
   * countdown starts immediately: a pair who cannot do FaceSync
   * must not be charged any dead time for it.
   */
  const resolveFaceSync = (reason) => {
    const active = activeMatches.get(matchId);
    if (!active || active.faceSyncResolved) return;
    active.faceSyncResolved = true;

    if (active.faceSyncTimerId) {
      clearTimeout(active.faceSyncTimerId);
      active.faceSyncTimerId = null;
    }

    const reports = active.faceSyncReports;
    const vectorA = reports.get(active.player1SocketId) ?? null;
    const vectorB = reports.get(active.player2SocketId) ?? null;
    const result =
      vectorA && vectorB
        ? computeFaceSync(vectorA, vectorB, variantSeedFromMatchId(matchId))
        : null;

    // Drop the geometry the instant it has been used. Nothing
    // downstream needs it and it should not outlive the
    // calculation.
    reports.clear();

    if (result) {
      io.to(roomId).emit("face_sync_result", {
        matchId,
        score: result.score,
        category: result.category,
        variant: result.variant,
        ...schedulePayload(),
      });
      // Logs that it resolved and nothing about the outcome. Even
      // the band is a per-pair similarity signal, and the match row
      // in the database carries both player ids — so a band in the
      // log is joinable back to two people. Calibrating against
      // real traffic should use deliberate aggregate telemetry,
      // not log mining.
      console.log(`[FS] Match ${matchId} face sync resolved`);
      // In FaceSync mode the reveal IS the round: there is no
      // countdown to hold back, and the match simply stays open on
      // the result until someone asks for the next stranger.
      if (isFaceSyncRound) return;
      active.faceSyncTimerId = setTimeout(() => {
        const still = activeMatches.get(matchId);
        if (still) still.faceSyncTimerId = null;
        beginCountdown();
      }, FACE_SYNC_REVEAL_MS);
      return;
    }

    io.to(roomId).emit("face_sync_skipped", { matchId, ...schedulePayload() });
    console.log(`[FS] Match ${matchId} face sync skipped (${reason})`);
    // A FaceSync round with nothing to compare has nowhere to go —
    // the client shows the miss and offers the next stranger,
    // rather than being dropped into an emoji duel it never asked
    // for.
    if (isFaceSyncRound) return;
    beginCountdown();
  };

  const startedMatch = activeMatches.get(matchId);
  if (startedMatch) {
    startedMatch.resolveFaceSync = resolveFaceSync;
  }

  if (!faceSyncEnabled) {
    // No lead-in for this mode: straight into the countdown, exactly
    // as before FaceSync existed.
    if (startedMatch) startedMatch.faceSyncResolved = true;
    beginCountdown();
    return true;
  }

  if (startedMatch) {
    startedMatch.faceSyncTimerId = setTimeout(
      () => {
        const still = activeMatches.get(matchId);
        if (still) still.faceSyncTimerId = null;
        resolveFaceSync("collection window expired");
      },
      FACE_SYNC_COLLECT_MS,
    );
  }

  return true;
}

// ─── Enqueue and attempt instant match ───────────────────────────────────────
function enqueueSocket(socket, peerId, skippedSocketId = null) {
  if (!socket?.connected || !peerId) return;
  removeFromQueue(socket.id);
  const currentMeta = socketMeta.get(socket.id);
  if (!currentMeta) return;

  for (let i = 0; i < waitingQueue.length; i++) {
    const candidate = waitingQueue[i];
    const candidateSocket = io.sockets.sockets.get(candidate.socketId);
    const candidateMeta = socketMeta.get(candidate.socketId);

    if (!candidateSocket || !candidateSocket.connected || !candidateMeta) {
      waitingQueue.splice(i, 1);
      i--;
      continue;
    }

    // Celebrity and emoji players reuse the same queue machinery, but they
    // must never be paired across modes because their targets and scoring
    // algorithms differ.
    if (candidateMeta.gameMode !== currentMeta.gameMode) continue;

    const blockedBySkip =
      candidate.socketId === skippedSocketId || candidate.skippedSocketId === socket.id;

    if (!blockedBySkip) {
      waitingQueue.splice(i, 1);
      startMatch(socket, candidate).then((ok) => {
        if (ok === false) {
          removeFromQueue(socket.id);
          removeFromQueue(candidate.socketId);
        }
      });
      return;
    }
  }

  waitingQueue.push({ socketId: socket.id, peerId, skippedSocketId });
  socket.emit("waiting");
  console.log(`[W] ${socket.id} waiting...`);
}

/* ─── Celebrity helpers ─────────────────────────────────────────────────────
 *  All celebrity-mimic state and events live in their own block so the
 *  legacy emoji-duel code above stays untouched. The flow mirrors the
 *  emoji duel — separate queue, separate start function, separate socket
 *  events — but the match stores an extra `celebrity` payload (id, name,
 *  image url, difficulty, optional pre-computed expression profile) so
 *  both clients always start the round targeting the same target.
 */

const socketAttemptsByIp = new Map();
const activeSocketsByIp = new Map();
const activeSocketByUser = new Map();
const SOCKET_EVENT_LIMITS = {
  join_queue: [6, 60_000],
  skip_user: [12, 60_000],
  stop_matching: [12, 60_000],
  chat_message: [20, 10_000],
  typing: [20, 10_000],
  report_player: [3, 60_000],
  // One report per match, and only the first is ever read. The
  // allowance covers a client retrying across a few quick skips.
  face_sync_sample: [8, 60_000],
  live_score: [120, 15_000],
  submit_score: [3, 30_000],
  change_emoji: [8, 30_000],
  time_sync: [40, 60_000],
};
// Ceiling across every event name, including ones absent from the table
// above. Without it an unrecognised event is free: Socket.IO still decodes
// the packet and runs the dispatch, so a flood of `socket.emit("x")` costs
// real work while passing straight through the per-event rules.
const SOCKET_PACKET_BUDGET = [240, 10_000];
// Rejecting a packet only surfaces an error to the caller; the socket stays
// open, so a client that never backs off can keep paying that cost forever.
// Close the connection once it is clear nobody is listening to the 429s.
const SOCKET_MAX_VIOLATIONS = 20;
// Ceiling on distinct addresses tracked for handshake throttling, so a
// wide-but-shallow flood cannot grow the map faster than it is pruned.
const MAX_TRACKED_IPS = 50_000;

const socketAttemptCleanup = setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [ip, timestamps] of socketAttemptsByIp) {
    const recent = timestamps.filter((timestamp) => timestamp >= cutoff);
    if (recent.length === 0) socketAttemptsByIp.delete(ip);
    else socketAttemptsByIp.set(ip, recent);
  }
}, 60_000);
socketAttemptCleanup.unref();

function socketClientIp(socket) {
  return resolveClientIp({
    direct: socket.request?.socket?.remoteAddress || socket.handshake?.address || null,
    forwardedHeader: socket.handshake?.headers?.["x-forwarded-for"],
    trustProxyHops: app.get("trust proxy"),
  });
}

io.use((socket, next) => {
  const ip = socketClientIp(socket);
  const now = Date.now();
  const attempts = (socketAttemptsByIp.get(ip) || []).filter((ts) => now - ts < 60_000);
  if (attempts.length >= 30) return next(new Error("Too many connection attempts"));
  if (!socketAttemptsByIp.has(ip) && socketAttemptsByIp.size >= MAX_TRACKED_IPS) {
    // The periodic sweep has not caught up with the arrival rate. Shed the
    // new address rather than letting the bookkeeping outgrow the traffic.
    return next(new Error("Server is busy, please retry"));
  }
  attempts.push(now);
  socketAttemptsByIp.set(ip, attempts);
  return next();
});
io.use(verifySocketToken);

// ─── Socket.io connection handler ────────────────────────────────────────────
io.on("connection", (socket) => {
  const clientIp = socketClientIp(socket);
  const activeForIp = activeSocketsByIp.get(clientIp) || 0;
  if (activeForIp >= MAX_CONNECTIONS_PER_IP) {
    socket.emit("server_error", { detail: "Too many active connections." });
    socket.disconnect(true);
    return;
  }
  activeSocketsByIp.set(clientIp, activeForIp + 1);

  const previousSocketId = activeSocketByUser.get(socket.user.id);
  if (previousSocketId && previousSocketId !== socket.id) {
    io.sockets.sockets.get(previousSocketId)?.disconnect(true);
  }
  activeSocketByUser.set(socket.user.id, socket.id);

  const eventWindows = new Map();
  let packetTimestamps = [];
  let rateViolations = 0;

  function rejectPacket(next, detail) {
    rateViolations += 1;
    if (rateViolations >= SOCKET_MAX_VIOLATIONS) {
      socket.emit("server_error", { detail: "Too many messages. Connection closed." });
      socket.disconnect(true);
    }
    return next(new Error(detail));
  }

  socket.use(([event], next) => {
    const now = Date.now();

    const [packetMax, packetWindowMs] = SOCKET_PACKET_BUDGET;
    packetTimestamps = packetTimestamps.filter((ts) => now - ts < packetWindowMs);
    if (packetTimestamps.length >= packetMax) return rejectPacket(next, "Too many messages");
    packetTimestamps.push(now);

    const rule = SOCKET_EVENT_LIMITS[event];
    if (!rule) return next();
    const [max, windowMs] = rule;
    const timestamps = (eventWindows.get(event) || []).filter((ts) => now - ts < windowMs);
    if (timestamps.length >= max) return rejectPacket(next, `Rate limit exceeded for ${event}`);
    timestamps.push(now);
    eventWindows.set(event, timestamps);
    return next();
  });

  console.log(`[+] Connected: ${socket.id}`);

  /*
   * Clock handshake. The client sends its own send-timestamp and we
   * echo it back alongside server time; the client halves the
   * round-trip to estimate the offset between the two clocks. Every
   * round-timing event on the wire is an absolute server timestamp,
   * so this handshake is what lets a phone whose system clock is
   * minutes off still stop its round on the same instant as the
   * desktop it is playing against. Stateless and match-independent.
   */
  socket.on("time_sync", (payload, ack) => {
    const clientSent =
      isPlainObject(payload) && Number.isFinite(payload.clientSent) ? payload.clientSent : null;
    const response = { clientSent, serverTime: Date.now() };
    if (typeof ack === "function") return ack(response);
    // Older clients without ack support still get a reply they can
    // listen for.
    socket.emit("time_sync_response", response);
  });

  socket.on("join_queue", async (payload) => {
    if (!isPlainObject(payload)) return socket.emit("server_error", { detail: "Invalid queue request." });
    const peerId = readBoundedString(payload.peerId, 128);
    if (!peerId) return socket.emit("server_error", { detail: "Invalid peer ID." });
    if (getMatchBySocket(socket.id)) {
      return socket.emit("server_error", { detail: "Already in an active match." });
    }

    // Display name + country are optional client-supplied fields.
    // The client has already validated them (see
    // `app/lib/storage.ts` and `app/lib/geo.ts`). We re-validate
    // here defensively, but never persist them — the values stay
    // in socketMeta (in-memory) for the duration of the session
    // and are discarded on disconnect.
    const displayName = readDisplayName(payload.name);
    if (payload.name != null && (!displayName || isInappropriateName(payload.name))) {
      return socket.emit("server_error", {
        code: "INVALID_DISPLAY_NAME",
        detail: isInappropriateName(payload.name)
          ? NAME_MODERATION_ERROR
          : "Invalid display name. Please choose another name (1–20 characters).",
      });
    }
    const clientCountry = readCountryLabel(payload.country);
    // Preferred wire format: a 2-letter ISO code. The receiving
    // client uses `isoFlag()` / `countryLabelFromCode()` to turn
    // this into a flag + display name, so a glitched display
    // string on the sender side can never make the partner see
    // a country code instead of a flag.
    const clientCountryCode = readCountryCode(payload.countryCode);
    const gameMode = readGameMode(payload.gameMode);

    console.log(`[Q] ${socket.id} joining ${gameMode} queue peerId=${peerId} name=${displayName ?? "(none)"} country=${clientCountryCode ?? "(none)"}`);

    let user;
    try {
      user = await ensureUser(socket.id, socket.user.id);
    } catch {
      socket.emit("server_error", { detail: "Could not initialize the authenticated user." });
      return socket.disconnect(true);
    }
    const isVIP = user.isVIP === true;

    socket.emit("user_id", { userId: user.id });
    socket.emit("usage_update", { isVIP });

    // Country preference order:
    //  1. Client-supplied label from the browser's geo lookup.
    //     This is the primary source per the spec.
    //  2. Edge geo header (cf-ipcountry / x-vercel-ip-country)
    //     when the server is configured to trust them.
    //  3. null — the partner just won't see a flag.
    const headers = socket.handshake?.headers || {};
    const trustGeoHeaders = process.env.TRUST_GEO_HEADERS === "true";
    let codeHeader = trustGeoHeaders
      ? headers["cf-ipcountry"] || headers["x-vercel-ip-country"]
      : null;
    if (Array.isArray(codeHeader)) codeHeader = codeHeader[0];
    let detectedCode = typeof codeHeader === "string" && codeHeader.length === 2 ? String(codeHeader).toUpperCase() : null;
    const edgeCountry = detectedCode ? countryLabelFromCode(detectedCode) : null;
    // Country-code preference order:
    //  1. Client-supplied 2-letter ISO code (the preferred wire
    //     format).
    //  2. Edge geo header (cf-ipcountry / x-vercel-ip-country).
    //  3. Code derived from the client-supplied display string
    //     (legacy / defensive).
    //  4. null — the partner just won't see a flag.
    const resolvedCountryCode =
      clientCountryCode || detectedCode || extractCountryCode(clientCountry);
    const resolvedCountry = clientCountry || edgeCountry || (resolvedCountryCode ? countryLabelFromCode(resolvedCountryCode) : null);

    socketMeta.set(socket.id, {
      peerId,
    userId: user.id,
    deviceId: user.deviceId ?? null,
      country: resolvedCountry,
      countryCode: resolvedCountryCode,
      displayName,
      elo: user.elo ?? DEFAULT_ELO,
      isVIP,
      gameMode,
    });

    enqueueSocket(socket, peerId);
  });

  socket.on("skip_user", () => {
    const existing = getMatchBySocket(socket.id);
    const meta = socketMeta.get(socket.id);

    if (!existing) {
      if (meta) enqueueSocket(socket, meta.peerId);
      return;
    }

    // Update DB status
    if (dbAvailable) {
      pool.query(`UPDATE matches SET status = $1 WHERE id = $2`, ["CANCELLED", existing.matchId]).catch((err) => warnDbFallback(err));
    }

    const sockets = clearMatchState(existing.matchId);
    for (const sid of sockets) {
      const s = io.sockets.sockets.get(sid);
      const m = socketMeta.get(sid);
      const skippedId = sockets.find((id) => id !== sid) ?? null;
      s?.emit("match_skipped", { bySelf: sid === socket.id });
      if (s && m) setTimeout(() => enqueueSocket(s, m.peerId, skippedId), 250);
    }

    console.log(`[S] ${socket.id} skipped match ${existing.matchId}`);
  });

  socket.on("typing", (payload) => {
    if (!isPlainObject(payload) || typeof payload.isTyping !== "boolean") return;
    const existing = getMatchBySocket(socket.id);
    if (!existing) return;
    socket.to(existing.roomId).emit("rival_typing", { isTyping: payload.isTyping });
  });

  socket.on("chat_message", (payload) => {
    if (!isPlainObject(payload)) return;
    const existing = getMatchBySocket(socket.id);
    if (!existing) return;
    if (typeof payload.text !== "string") return;
    // Cap the payload — the client already clamps to MAX_LENGTH, but
    // a tampered client can ship megabytes; bail before we echo it.
    const trimmed = payload.text.slice(0, 500);
    if (!trimmed.trim()) return;
    const cleanText = scrubChatText(trimmed);
    // Only relay to the partner — the sender already added their
    // own message to their own bubble optimistically (fromSelf:
    // true), and a server echo would land a second bubble flagged
    // as fromSelf:false. The sender keeps their original typing;
    // the partner sees the server's scrubbed text. Asymmetric on
    // purpose — the scrubber protects the recipient, not the
    // sender.
    socket.to(existing.roomId).emit("chat_message", { text: cleanText, fromSelf: false });
  });

  // Persist a minimal report without exposing the partner's identity.
  socket.on("report_player", async (payload = {}) => {
    if (!isPlainObject(payload)) return;
    const existing = getMatchBySocket(socket.id);
    if (!existing) return;
    const match = activeMatches.get(existing.matchId);
    if (!match) return;
    const partnerSocketId =
      socket.id === match.player1SocketId
        ? match.player2SocketId
        : match.player1SocketId;
    const reporterMeta = socketMeta.get(socket.id);
    const partnerMeta = socketMeta.get(partnerSocketId);
    const reason = readBoundedString(payload.reason, 64) || "unspecified";
    try {
      await pool.query(
        `INSERT INTO moderation_reports
           (match_id, reporter_user_id, reported_user_id, reason)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (match_id, reporter_user_id) DO NOTHING`,
        [existing.matchId, reporterMeta?.userId, partnerMeta?.userId, reason],
      );
      console.log(`[MOD] report stored match=${existing.matchId} reporter=${reporterMeta?.userId}`);
    } catch (err) {
      warnDbFallback(err);
      console.error(`[MOD] report persistence failed for match=${existing.matchId}`);
    }
  });

  /*
   * FaceSync: one report per player per match.
   *
   * The payload is either `{ vector: number[20] }` — normalized
   * facial geometry measured from that player's OWN camera — or
   * `{ unavailable: true }`, meaning they have nothing to offer
   * (camera off, no face found, MediaPipe failed). Both are
   * treated the same way structurally; only the second one can
   * never produce a result.
   *
   * Everything about the sender is taken from the server's own
   * match state rather than the payload. A client cannot name the
   * match it is reporting into, cannot report on behalf of the
   * other player, and cannot send a score — only geometry, which
   * the scorer then bounds. That leaves nothing to forge except a
   * face shape, and forging one only changes a joke number in a
   * round the forger is already in.
   */
  socket.on("face_sync_sample", (payload) => {
    if (!isPlainObject(payload)) return;

    const existing = getMatchBySocket(socket.id);
    if (!existing) return;
    const match = activeMatches.get(existing.matchId);
    if (!match || match.faceSyncResolved) return;

    // First report wins. A second one is either a buggy client or
    // someone trying to walk the score around after seeing it.
    if (match.faceSyncReports.has(socket.id)) return;

    const vector = payload.unavailable === true ? null : readFaceVector(payload.vector);
    if (vector === null && payload.unavailable !== true) {
      // Malformed geometry. Record it as "nothing to offer" rather
      // than ignoring it, so one broken client cannot hold the
      // other in the lead-in until the window times out.
      match.faceSyncReports.set(socket.id, null);
    } else {
      match.faceSyncReports.set(socket.id, vector);
    }

    const bothReported =
      match.faceSyncReports.has(match.player1SocketId) &&
      match.faceSyncReports.has(match.player2SocketId);
    if (bothReported) match.resolveFaceSync?.("both players reported");
  });

  socket.on("live_score", (payload) => {
    if (!isPlainObject(payload)) return;
    const existing = getMatchBySocket(socket.id);
    if (!existing || typeof payload.score !== "number" || !Number.isFinite(payload.score)) return;
    const match = activeMatches.get(existing.matchId);
    const now = Date.now();
    // The tail of a late-anchored client's window arrives after the
    // published deadline; those samples still belong to the round
    // and back the fallback score, so accept them for as long as a
    // submission would be accepted.
    if (
      !match?.scanStartedAt ||
      !match.scanEndsAt ||
      now < match.scanStartedAt ||
      now > match.scanEndsAt + SCORE_SUBMISSION_GRACE_MS
    ) {
      return;
    }
    const normalizedScore = clampScore(payload.score);
    const samples = match.liveScores[socket.id] || [];
    if (samples.length < 150) samples.push(normalizedScore);
    match.liveScores[socket.id] = samples;
    socket.to(existing.roomId).emit("partner_live_score", {
      score: normalizedScore,
    });
  });

  // Either player can swap the target emoji before the scan window
  // opens. The server is the single source of truth: it picks the
  // new emoji, updates the DB row, and fans it out to the room so
  // both clients update at the same moment. If the round is locked
  // (countdown already finished) the request is a no-op.
  socket.on("change_emoji", () => {
    const existing = getMatchBySocket(socket.id);
    if (!existing) return;
    const match = activeMatches.get(existing.matchId);
    if (!match) return;
    if (match.emojiLocked) return;

    const newEmoji = pickEmojiExcept(match.currentEmoji);
    match.currentEmoji = newEmoji;

    if (dbAvailable) {
      pool
        .query(`UPDATE matches SET current_emoji = $1 WHERE id = $2`, [
          newEmoji,
          existing.matchId,
        ])
        .catch((err) => warnDbFallback(err));
    }

    // Broadcast to the whole room so both screens re-render the
    // target emoji on the same tick. No echo to just the sender —
    // the local React state has already optimistically updated.
    io.to(existing.roomId).emit("emoji_changed", { emoji: newEmoji });
  });

  socket.on("submit_score", async (payload) => {
    if (!isPlainObject(payload)) return;
    const existing = getMatchBySocket(socket.id);
    if (!existing || typeof payload.score !== "number" || !Number.isFinite(payload.score)) return;

    const match = activeMatches.get(existing.matchId);
    if (!match) return;
    const now = Date.now();
    if (
      !match.scanStartedAt ||
      !match.scanEndsAt ||
      now < match.scanEndsAt - SCORE_SUBMISSION_EARLY_MS ||
      now > match.scanEndsAt + SCORE_SUBMISSION_GRACE_MS
    ) {
      // Round-level, not connection-level: the deadline finalizer
      // still produces a result for this player, so this must not
      // put the client into its fatal `server_error` state.
      return socket.emit("score_rejected", { reason: "outside_window" });
    }
    if (Object.hasOwn(match.scores, socket.id)) return;

    const samples = match.liveScores[socket.id] || [];
    // Celebrity mode uses the player's peak score directly — the
    // `useCelebrityExpressionScorer` hook already maintains a
    // running peak sample, so we treat the submitted value as the
    // authoritative one (the average-of-samples is a fine fallback
    // for the legacy emoji flow). We still clamp + 1-decimal for
    // a consistent 0..10 display.
    const isCelebrityRound = match.gameMode === CELEBRITY_GAME_MODE;
    const normalizedScore = isCelebrityRound
      ? Number(clampScore(payload.score).toFixed(1))
      : submittedRoundScore(samples, payload.score);
    if (normalizedScore === null || typeof normalizedScore !== "number" || !Number.isFinite(normalizedScore)) {
      return socket.emit("score_rejected", { reason: "insufficient_samples" });
    }
    match.scores[socket.id] = normalizedScore;
    socket.to(existing.roomId).emit("partner_score", { score: normalizedScore });
    await finalizeMatchResult(existing.matchId);
  });

  socket.on("stop_matching", () => {
    const existing = getMatchBySocket(socket.id);

    if (existing) {
      if (dbAvailable) {
        pool.query(`UPDATE matches SET status = $1 WHERE id = $2`, ["CANCELLED", existing.matchId]).catch((err) => warnDbFallback(err));
      }
      const sockets = clearMatchState(existing.matchId);
      for (const sid of sockets) {
        if (sid === socket.id) continue;
        const s = io.sockets.sockets.get(sid);
        const m = socketMeta.get(sid);
        s?.emit("match_skipped", { bySelf: false });
        if (s && m) {
          setTimeout(() => enqueueSocket(s, m.peerId, socket.id), 250);
        }
      }
    } else {
      removeFromQueue(socket.id);
    }

    console.log(`[P] ${socket.id} stopped matching`);
  });

  // ─── Graceful disconnect ─────────────────────────────────────────────────
  socket.on("disconnect", () => {
    removeFromQueue(socket.id);

    const existing = getMatchBySocket(socket.id);
    if (existing) {
      // Update DB: mark match as DISCONNECTED
      if (dbAvailable) {
        pool.query(`UPDATE matches SET status = $1 WHERE id = $2`, ["DISCONNECTED", existing.matchId]).catch((err) => warnDbFallback(err));
      }

      const sockets = clearMatchState(existing.matchId);
      const remainingId = sockets.find((id) => id !== socket.id);

      if (remainingId) {
        const remainingSocket = io.sockets.sockets.get(remainingId);
        // Notify remaining player their opponent left. The event
        // name is mode-agnostic; both clients can handle either
        // `match_skipped` or `opponent_left` to surface a "your
        // partner left" toast.
        remainingSocket?.emit("opponent_left", { matchId: existing.matchId });

        // Re-queue the remaining player automatically. We route to
        // the right queue based on which mode the now-disconnected
        // match was running in, so a user mid-celebrity-round
        // doesn't get bounced into the regular emoji pool.
        const meta = socketMeta.get(remainingId);
        if (remainingSocket && meta) {
          setTimeout(
            () => enqueueSocket(remainingSocket, meta.peerId, socket.id),
            500
          );
        }
      }
    }

    // Clear user's socket_id in DB so it can be reused
    const meta = socketMeta.get(socket.id);
    if (dbAvailable && meta?.userId) {
      pool.query(`UPDATE users SET socket_id = NULL WHERE id = $1 AND socket_id = $2`, [meta.userId, socket.id]).catch((err) => warnDbFallback(err));
    }
    socketMeta.delete(socket.id);
    if (activeSocketByUser.get(socket.user.id) === socket.id) activeSocketByUser.delete(socket.user.id);
    const remainingForIp = (activeSocketsByIp.get(clientIp) || 1) - 1;
    if (remainingForIp <= 0) activeSocketsByIp.delete(clientIp);
    else activeSocketsByIp.set(clientIp, remainingForIp);

    console.log(`[-] Disconnected: ${socket.id}`);
  });
});

// ─── HTTP routes ─────────────────────────────────────────────────────────────
app.get("/", (_req, res) => res.send("ok"));
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.get("/ready", (_req, res) => {
  if (!dbAvailable) return res.status(503).json({ status: "unavailable" });
  return res.json({ status: "ready" });
});

app.get("/online", apiLimiter, (_req, res) => {
  res.json({ count: io.engine.clientsCount ?? 0 });
});

// Graceful shutdown: drain the pg pool
process.on("SIGTERM", async () => {
  console.log("[!] SIGTERM received, shutting down...");
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
});

/*
 * Expired sessions were only cleared during schema initialization, so a
 * long-running process accumulated every anonymous session it ever handed
 * out. That is storage a session-spamming bot can grow on demand and the
 * process never gives back until it restarts. Sweep on a timer instead; the
 * `idx_sessions_expires_at` index makes each pass cheap.
 */
const SESSION_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

function startExpiredSessionSweep() {
  const sweep = async () => {
    try {
      const { rowCount } = await pool.query(`DELETE FROM sessions WHERE expires_at <= NOW()`);
      if (rowCount > 0) console.log(`[DB] Swept ${rowCount} expired session(s)`);
    } catch (err) {
      // A failed sweep is not fatal — the next tick retries.
      console.warn("[DB] Expired session sweep failed:", err.message);
    }
  };
  const timer = setInterval(sweep, SESSION_SWEEP_INTERVAL_MS);
  timer.unref();
}

const PORT = process.env.PORT || 3001;

// Initialize schema then start server (skip DB if env missing)
if (!process.env.DATABASE_URL) {
  console.warn("[DB] DATABASE_URL missing — authenticated matchmaking is unavailable");
  dbAvailable = false;
  dbWarningShown = true;
  server.listen(PORT, () =>
    console.log(`[WARN] Signaling server running on :${PORT} — readiness checks will fail`)
  );
} else {
  initSchema()
    .then(() => {
      dbAvailable = true;
      dbWarningShown = false;
      startExpiredSessionSweep();
      server.listen(PORT, () =>
        console.log(`[OK] Signaling server running on :${PORT} — database connected`)
      );
    })
    .catch((err) => {
      console.error("[FATAL] Could not initialize DB schema:", err.message);
      // Initialization did not complete, so no request may attempt the
      // database path even when the failure is an auth/configuration error
      // rather than a network error. Local development can then use the
      // in-memory session and matchmaking fallback as intended.
      dbAvailable = false;
      warnDbFallback(err);
      server.listen(PORT, () =>
        console.log(`[WARN] Signaling server running on :${PORT} — authenticated matchmaking is unavailable`)
      );
    });
}
