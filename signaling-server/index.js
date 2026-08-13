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
const http = require("http");
const crypto = require("crypto");
const { Server } = require("socket.io");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const { pool, initSchema } = require("./db");
const {
  SESSION_COOKIE_NAME,
  extractSessionResumeToken,
  findSessionUser,
  hashSessionToken,
  verifyToken,
  verifySocketToken,
} = require("./middleware/verifyToken");

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
const waitingQueue = []; // { socketId, peerId, userId, skippedSocketId }
const socketMeta = new Map(); // socketId -> { peerId, userId, country }
const activeMatches = new Map(); // matchId -> { roomId, player1SocketId, player2SocketId, timerId, scores }

const ROUND_COUNTDOWN_SEC = 3;
const MATCH_DURATION_SEC = 10;
const DEFAULT_ELO = 1000;
const ELO_K = 32;
const RANKED_ELO_ENABLED = process.env.ENABLE_RANKED_ELO === "true";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CONNECTIONS_PER_IP = Math.max(1, Number.parseInt(process.env.MAX_CONNECTIONS_PER_IP || "8", 10) || 8);
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

function clampScore(score) {
  return Math.max(0, Math.min(10, score));
}

function cleanIp(ip) {
  if (!ip) return null;
  let s = typeof ip === "string" ? ip : String(ip);
  if (s.startsWith("::ffff:")) s = s.slice(7);
  if (s === "::1") return "127.0.0.1";
  return s;
}

function isoFlag(code) {
  const cc = typeof code === "string" ? code.toUpperCase() : "";
  if (cc.length !== 2) return null;
  return cc.replace(/./g, (c) => String.fromCodePoint(127462 + c.charCodeAt(0) - 65));
}

function countryLabelFromCode(code) {
  const cc = typeof code === "string" ? code.toUpperCase() : "";
  if (cc.length !== 2) return null;
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

app.use(express.json({ limit: "1mb" }));

// Apply rate limiting to all /api routes
app.use("/api", apiLimiter);

// ─── Anonymous authenticated sessions ───────────────────────────────────────
app.post("/api/session", sessionLimiter, requireTrustedMutationOrigin, async (req, res) => {
  if (!process.env.DATABASE_URL || !dbAvailable) {
    return res.status(503).json({ detail: "Session service unavailable." });
  }

  // Cookies are origin-wide, so using one here collapses every open tab into
  // the same anonymous user. A tab resumes only with the bearer token kept in
  // its own sessionStorage; otherwise it receives a new anonymous session.
  const existingToken = extractSessionResumeToken(req);
  if (existingToken) {
    try {
      const existingUser = await findSessionUser(existingToken);
      if (existingUser) {
        res.cookie(SESSION_COOKIE_NAME, existingToken, sessionCookieOptions());
        return res.json({
          id: existingUser.id,
          elo: existingUser.elo,
          isVIP: existingUser.is_vip === true,
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
      `INSERT INTO users (id) VALUES ($1)
       RETURNING id, elo, is_vip`,
      [userId],
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

function requireVIP(req, res, next) {
  if (req.user?.is_vip === true) return next();
  return res.status(403).json({ detail: "An active VIP entitlement is required." });
}

// RevenueCat must send Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>.
app.post("/api/webhooks/revenuecat", async (req, res) => {
  const configuredSecret = process.env.REVENUECAT_WEBHOOK_SECRET || "";
  const supplied = typeof req.headers.authorization === "string"
    ? req.headers.authorization.replace(/^Bearer\s+/i, "")
    : "";
  const suppliedBuffer = Buffer.from(supplied, "utf8");
  const configuredBuffer = Buffer.from(configuredSecret, "utf8");
  const authorized =
    configuredBuffer.length >= 32 &&
    suppliedBuffer.length === configuredBuffer.length &&
    crypto.timingSafeEqual(suppliedBuffer, configuredBuffer);
  if (!authorized) return res.status(401).json({ detail: "Invalid webhook credentials." });

  const event = isPlainObject(req.body?.event) ? req.body.event : null;
  const userId = readBoundedString(event?.app_user_id, 64);
  const eventAtMs = Number(event?.event_timestamp_ms);
  if (!event || !userId || !UUID_PATTERN.test(userId) || !Number.isFinite(eventAtMs) || eventAtMs <= 0) {
    return res.status(400).json({ detail: "Invalid RevenueCat event." });
  }
  const expiresAtMs = Number(event.expiration_at_ms || 0);
  const isVIP = event.type !== "EXPIRATION" && Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
  try {
    const result = await pool.query(
      `UPDATE users
          SET is_vip = $1,
              vip_expires_at = CASE WHEN $2 > 0 THEN TO_TIMESTAMP($2 / 1000.0) ELSE NULL END,
              revenuecat_event_at = TO_TIMESTAMP($3 / 1000.0)
        WHERE id = $4
          AND (revenuecat_event_at IS NULL OR revenuecat_event_at <= TO_TIMESTAMP($3 / 1000.0))`,
      [isVIP, expiresAtMs, eventAtMs, userId],
    );
    // A stale replay or unknown user is acknowledged so the provider does not
    // retry indefinitely; the timestamp guard prevents it changing state.
    return res.status(204).end();
  } catch (err) {
    warnDbFallback(err);
    return res.status(503).json({ detail: "Entitlement update unavailable." });
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

// Celebrity data is a premium server resource.
try {
  const celebrityRouter = require("./routes/celebrity");
  app.use("/api/celebrity", verifyToken, requireVIP, celebrityRouter);
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

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const p1Res = await client.query(`SELECT elo FROM users WHERE id = $1`, [match.player1Id]);
    const p2Res = await client.query(`SELECT elo FROM users WHERE id = $1`, [match.player2Id]);

    const player1Elo = p1Res.rows[0]?.elo ?? DEFAULT_ELO;
    const player2Elo = p2Res.rows[0]?.elo ?? DEFAULT_ELO;
    const elo = RANKED_ELO_ENABLED
      ? calculateMatchElo(player1Elo, player2Elo, player1Score, player2Score)
      : unrankedResult();

    if (RANKED_ELO_ENABLED) {
      await client.query(`UPDATE users SET elo = $1 WHERE id = $2`, [elo.player1.newElo, match.player1Id]);
      await client.query(`UPDATE users SET elo = $1 WHERE id = $2`, [elo.player2.newElo, match.player2Id]);
    }
    await client.query(
      `UPDATE matches SET status = $1, player1_score = $2, player2_score = $3, winner_id = $4, completed_at = $5 WHERE id = $6`,
      ["COMPLETED", player1Score, player2Score, winnerId, new Date(), matchId]
    );

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

  const sockets = [match.player1SocketId, match.player2SocketId];

  // Leave room and unlink
  for (const sid of sockets) {
    const s = io.sockets.sockets.get(sid);
    if (s) s.leave(match.roomId);
  }

  activeMatches.delete(matchId);
  return sockets;
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
  if (!dbAvailable) throw new Error("Database unavailable");
  if (!UUID_PATTERN.test(userId || "")) throw new Error("Authenticated user ID is invalid");

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
async function startMatch(socket, partner) {
  const partnerSocket = io.sockets.sockets.get(partner.socketId);
  if (!partnerSocket) return false;

  const meta1 = socketMeta.get(socket.id);
  const meta2 = socketMeta.get(partner.socketId);
  if (!meta1 || !meta2) return false;

  const emoji = pickEmoji();

  // Create Match record in the database
  let match;
  let client;
  try {
    if (!dbAvailable) throw new Error("Database unavailable");
    client = await pool.connect();
    const matchId = crypto.randomUUID();
    const { rows } = await client.query(
      `INSERT INTO matches (id, player1_id, player2_id, current_emoji, status) VALUES ($1, $2, $3, $4, 'ACTIVE') RETURNING *`,
      [matchId, meta1.userId, meta2.userId, emoji]
    );
    match = { id: rows[0].id };
  } catch (err) {
    warnDbFallback(err);
    socket.emit("server_error", { detail: "Match persistence is unavailable." });
    partnerSocket.emit("server_error", { detail: "Match persistence is unavailable." });
    return false;
  } finally {
    client?.release();
  }

  const roomId = `match_${match.id}`;
  socket.join(roomId);
  partnerSocket.join(roomId);

  activeMatches.set(match.id, {
    roomId,
    player1SocketId: socket.id,
    player2SocketId: partner.socketId,
    player1Id: meta1.userId,
    player2Id: meta2.userId,
    player1Elo: meta1.elo ?? DEFAULT_ELO,
    player2Elo: meta2.elo ?? DEFAULT_ELO,
    timerId: null,
    scores: {},
    liveScores: {},
    scanStartedAt: null,
    scanEndsAt: null,
    resultSent: false,
    // The emoji stays mutable until the round actually starts.
    // Once the scan timer begins we set emojiLocked=true so the
    // "change emoji" control goes dim on both clients at the same
    // moment. currentEmoji is the source of truth used by the
    // change_emoji handler to keep the swap deterministic on both
    // screens.
    currentEmoji: emoji,
    emojiLocked: false,
  });

  socket.emit("usage_update", { isVIP: meta1.isVIP === true });
  partnerSocket.emit("usage_update", { isVIP: meta2.isVIP === true });

  // Emit match_started to both players with stranger's details
  socket.emit("match_started", {
    matchId: match.id,
    partnerPeerId: meta2.peerId,
    partnerCountry: meta2.country ?? null,
    role: "receiver",
    emoji,
    duration: MATCH_DURATION_SEC,
  });
  partnerSocket.emit("match_started", {
    matchId: match.id,
    partnerPeerId: meta1.peerId,
    partnerCountry: meta1.country ?? null,
    role: "caller",
    emoji,
    duration: MATCH_DURATION_SEC,
  });

  console.log(`[M] Match ${match.id}: ${partner.socketId} <-> ${socket.id} | emoji=${emoji}`);

  // Start a short synchronized pre-round countdown. The browser owns the 10s scan timer.
  let remaining = ROUND_COUNTDOWN_SEC;
  io.to(roomId).emit("countdown_tick", { count: remaining });
  const timerId = setInterval(() => {
    remaining--;
    io.to(roomId).emit("countdown_tick", { count: remaining });

    if (remaining <= 0) {
      clearInterval(timerId);
      const active = activeMatches.get(match.id);
      if (active) {
        active.timerId = null;
        // The scan window is open — the emoji is locked. Either
        // client that tries to change it now gets a silent no-op.
        active.emojiLocked = true;
        active.scanStartedAt = Date.now();
        active.scanEndsAt = active.scanStartedAt + MATCH_DURATION_SEC * 1000;
        io.to(roomId).emit("emoji_locked", { matchId: match.id });
      }
      console.log(`[T] Match ${match.id} scan started (emoji locked)`);
    }
  }, 1000);

  const activeMatch = activeMatches.get(match.id);
  if (activeMatch) activeMatch.timerId = timerId;
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

    const blockedBySkip =
      candidate.socketId === skippedSocketId || candidate.skippedSocketId === socket.id;

    if (!blockedBySkip) {
      waitingQueue.splice(i, 1);
      startMatch(socket, candidate).then((ok) => {
        if (!ok) {
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
  live_score: [120, 15_000],
  submit_score: [3, 30_000],
  change_emoji: [8, 30_000],
};

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
  const direct = cleanIp(socket.request?.socket?.remoteAddress || socket.handshake?.address || "unknown");
  if (Number(app.get("trust proxy")) > 0) {
    const forwarded = socket.handshake?.headers?.["x-forwarded-for"];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (typeof first === "string" && first.length <= 256) return cleanIp(first.split(",")[0].trim()) || direct;
  }
  return direct || "unknown";
}

io.use((socket, next) => {
  const ip = socketClientIp(socket);
  const now = Date.now();
  const attempts = (socketAttemptsByIp.get(ip) || []).filter((ts) => now - ts < 60_000);
  if (attempts.length >= 30) return next(new Error("Too many connection attempts"));
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
  socket.use(([event], next) => {
    const rule = SOCKET_EVENT_LIMITS[event];
    if (!rule) return next();
    const [max, windowMs] = rule;
    const now = Date.now();
    const timestamps = (eventWindows.get(event) || []).filter((ts) => now - ts < windowMs);
    if (timestamps.length >= max) return next(new Error(`Rate limit exceeded for ${event}`));
    timestamps.push(now);
    eventWindows.set(event, timestamps);
    return next();
  });

  console.log(`[+] Connected: ${socket.id}`);

  socket.on("join_queue", async (payload) => {
    if (!isPlainObject(payload)) return socket.emit("server_error", { detail: "Invalid queue request." });
    const peerId = readBoundedString(payload.peerId, 128);
    if (!peerId) return socket.emit("server_error", { detail: "Invalid peer ID." });
    if (getMatchBySocket(socket.id)) {
      return socket.emit("server_error", { detail: "Already in an active match." });
    }
    console.log(`[Q] ${socket.id} joining queue peerId=${peerId}`);

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

    const headers = socket.handshake?.headers || {};
    const trustGeoHeaders = process.env.TRUST_GEO_HEADERS === "true";
    let codeHeader = trustGeoHeaders
      ? headers["cf-ipcountry"] || headers["x-vercel-ip-country"]
      : null;
    if (Array.isArray(codeHeader)) codeHeader = codeHeader[0];
    let detectedCode = typeof codeHeader === "string" && codeHeader.length === 2 ? String(codeHeader).toUpperCase() : null;
    const detectedCountry = detectedCode ? countryLabelFromCode(detectedCode) : null;

    socketMeta.set(socket.id, {
      peerId,
      userId: user.id,
      country: detectedCountry,
      elo: user.elo ?? DEFAULT_ELO,
      isVIP,
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

  socket.on("live_score", (payload) => {
    if (!isPlainObject(payload)) return;
    const existing = getMatchBySocket(socket.id);
    if (!existing || typeof payload.score !== "number" || !Number.isFinite(payload.score)) return;
    const match = activeMatches.get(existing.matchId);
    const now = Date.now();
    if (!match?.scanStartedAt || !match.scanEndsAt || now < match.scanStartedAt || now > match.scanEndsAt + 1_500) return;
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
    if (!match.scanStartedAt || !match.scanEndsAt || now < match.scanEndsAt - 1_500 || now > match.scanEndsAt + 5_000) {
      return socket.emit("server_error", { detail: "Score submitted outside the round window." });
    }
    if (Object.hasOwn(match.scores, socket.id)) return;

    const samples = match.liveScores[socket.id] || [];
    if (samples.length < 5) {
      return socket.emit("server_error", { detail: "Not enough score samples were received." });
    }
    const sampleAverage = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const clientFinal = clampScore(payload.score);
    const normalizedScore = clampScore(Number(((sampleAverage + clientFinal) / 2).toFixed(1)));
    match.scores[socket.id] = normalizedScore;
    socket.to(existing.roomId).emit("partner_score", { score: normalizedScore });

    const p1Score = match.scores[match.player1SocketId];
    const p2Score = match.scores[match.player2SocketId];
    if (typeof p1Score === "number" && typeof p2Score === "number") {
      if (match.resultSent) return;
      match.resultSent = true;

      const p1 = io.sockets.sockets.get(match.player1SocketId);
      const p2 = io.sockets.sockets.get(match.player2SocketId);
      const winnerSocketId =
        p1Score === p2Score ? null : p1Score > p2Score ? match.player1SocketId : match.player2SocketId;
      const winnerId =
        winnerSocketId === match.player1SocketId
          ? match.player1Id
          : winnerSocketId === match.player2SocketId
            ? match.player2Id
            : null;

      const elo = await finalizeMatchScores(existing.matchId, match, p1Score, p2Score, winnerId);

      p1?.emit("scores_ready", { myScore: p1Score, partnerScore: p2Score });
      p2?.emit("scores_ready", { myScore: p2Score, partnerScore: p1Score });
      p1?.emit("match_result", {
        matchId: existing.matchId,
        myScore: p1Score,
        partnerScore: p2Score,
        winner: winnerSocketId === null ? "tie" : winnerSocketId === match.player1SocketId ? "you" : "rival",
        winnerSocketId,
        myElo: elo.player1.newElo,
        partnerElo: elo.player2.newElo,
        myEloDelta: elo.player1.delta,
        partnerEloDelta: elo.player2.delta,
        myTier: elo.player1.tier,
        partnerTier: elo.player2.tier,
      });
      p2?.emit("match_result", {
        matchId: existing.matchId,
        myScore: p2Score,
        partnerScore: p1Score,
        winner: winnerSocketId === null ? "tie" : winnerSocketId === match.player2SocketId ? "you" : "rival",
        winnerSocketId,
        myElo: elo.player2.newElo,
        partnerElo: elo.player1.newElo,
        myEloDelta: elo.player2.delta,
        partnerEloDelta: elo.player1.delta,
        myTier: elo.player2.tier,
        partnerTier: elo.player1.tier,
      });
    }
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
        if (s && m) setTimeout(() => enqueueSocket(s, m.peerId, socket.id), 250);
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
        // Notify remaining player their opponent left
        remainingSocket?.emit("opponent_left", { matchId: existing.matchId });

        // Re-queue the remaining player automatically
        const meta = socketMeta.get(remainingId);
        if (remainingSocket && meta) {
          setTimeout(() => enqueueSocket(remainingSocket, meta.peerId, socket.id), 500);
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
      server.listen(PORT, () =>
        console.log(`[OK] Signaling server running on :${PORT} — database connected`)
      );
    })
    .catch((err) => {
      console.error("[FATAL] Could not initialize DB schema:", err.message);
      warnDbFallback(err);
      server.listen(PORT, () =>
        console.log(`[WARN] Signaling server running on :${PORT} — authenticated matchmaking is unavailable`)
      );
    });
}
