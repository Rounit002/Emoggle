const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

// Build DATABASE_URL from discrete env vars (must happen before pg pool init)
const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
if (DB_HOST && DB_USER && DB_NAME) {
  process.env.DATABASE_URL = `postgresql://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD || "")}@${DB_HOST}:${DB_PORT || 5432}/${DB_NAME}`;
}

// Startup env diagnostic
console.log("[ENV] NODE_ENV:", process.env.NODE_ENV);
console.log("[ENV] JWT_SECRET set:", !!process.env.JWT_SECRET, "| length:", process.env.JWT_SECRET?.length ?? 0);
console.log("[ENV] DATABASE_URL set:", !!process.env.DATABASE_URL);
console.log("[ENV] FRONTEND_URL:", process.env.FRONTEND_URL);
// Helpers to read Razorpay envs robustly (trim + common fallback names)
function getEnvTrim(name) {
  const v = process.env[name];
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

function readRazorpayConfig() {
  const keyId =
    getEnvTrim("RAZORPAY_KEY_ID") ||
    getEnvTrim("RAZORPAY_KEY") ||
    getEnvTrim("RAZORPAY_ID") ||
    getEnvTrim("RAZORPAY_API_KEY") ||
    getEnvTrim("RZP_KEY_ID");
  const keySecret =
    getEnvTrim("RAZORPAY_KEY_SECRET") ||
    getEnvTrim("RAZORPAY_SECRET") ||
    getEnvTrim("RAZORPAY_API_SECRET") ||
    getEnvTrim("RZP_KEY_SECRET");
  const webhookSecret = getEnvTrim("RAZORPAY_WEBHOOK_SECRET") || getEnvTrim("RZP_WEBHOOK_SECRET");
  return { keyId, keySecret, webhookSecret };
}

const __rzp = readRazorpayConfig();
console.log(
  "[ENV] Razorpay configured:",
  !!__rzp.keyId && !!__rzp.keySecret,
  "| webhook:",
  !!__rzp.webhookSecret
);

const express = require("express");
const http = require("http");
const crypto = require("crypto");
const { Server } = require("socket.io");
const cors = require("cors");
const cookieParser = require("cookie-parser");
let geoip;
try {
  geoip = require("geoip-lite");
} catch {
  geoip = { lookup: () => null };
}
const { pool, initSchema } = require("./db");

const app = express();
app.set("trust proxy", 1); // Trust Render's reverse proxy
const defaultOrigins = ["http://localhost:3000", "https://emoggle.vercel.app"]; 
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
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true,
});

// ─── In-memory state (minimal; keyed by matchId for easy cleanup) ────────────
const waitingQueue = []; // { socketId, peerId, userId, skippedSocketId }
const socketMeta = new Map(); // socketId -> { peerId, userId, country }
const activeMatches = new Map(); // matchId -> { roomId, player1SocketId, player2SocketId, timerId, scores }

const ROUND_COUNTDOWN_SEC = 3;
const MATCH_DURATION_SEC = 10;
const DEFAULT_ELO = 1000;
const ELO_K = 32;
const VIP_PRICE_INR = Number(process.env.VIP_PRICE_INR || 99);
let dbAvailable = true;
let dbWarningShown = false;
const memoryVipUsers = new Set();
const memoryFreeGenderMatches = new Map();

const EMOJI_PROMPTS = [
  "\u{1F600}", "\u{1F601}", "\u{1F602}", "\u{1F62E}", "\u{1F632}",
  "\u{1F609}", "\u{1F61C}", "\u{1F621}", "\u{1F624}", "\u{1F622}",
  "\u{1F62D}", "\u{1F60E}", "\u{1F928}", "\u{1F610}", "\u{1F611}",
  "\u{1F633}", "\u{1F62C}", "\u{1F60F}",
];

function pickEmoji() {
  return EMOJI_PROMPTS[Math.floor(Math.random() * EMOJI_PROMPTS.length)];
}

function warnDbFallback(err) {
  dbAvailable = false;
  if (dbWarningShown) return;
  dbWarningShown = true;
  console.warn(`[DB] Unavailable, using in-memory matchmaking only: ${err.message}`);
}

function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    socketId: row.socket_id,
    username: row.username,
    age: row.age,
    verifiedGender: row.verified_gender,
    elo: row.elo,
    isVIP: row.is_vip,
    freeGenderMatchesLeft: row.free_matches_left,
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

function verifyHmac(payload, signature, secret) {
  if (!payload || !signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

async function markUserVip(username) {
  const normalized = typeof username === "string" ? username.trim().slice(0, 24) : "";
  if (!normalized) return null;
  memoryVipUsers.add(normalized);

  if (!dbAvailable) return { username: normalized, isVIP: true, freeGenderMatchesLeft: 0 };

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id FROM users WHERE username = $1 ORDER BY created_at DESC LIMIT 1`,
      [normalized]
    );
    if (rows.length > 0) {
      const res = await client.query(
        `UPDATE users SET is_vip = true WHERE id = $1 RETURNING *`,
        [rows[0].id]
      );
      return mapUserRow(res.rows[0]);
    }
    const res = await client.query(
      `INSERT INTO users (id, username, is_vip) VALUES ($1, $2, true) RETURNING *`,
      [crypto.randomUUID(), normalized]
    );
    return mapUserRow(res.rows[0]);
  } catch (err) {
    warnDbFallback(err);
    return { username: normalized, isVIP: true, freeGenderMatchesLeft: 0 };
  } finally {
    client.release();
  }
}

function getMemoryFreeGenderMatches(username) {
  if (!memoryFreeGenderMatches.has(username)) memoryFreeGenderMatches.set(username, 0);
  return memoryFreeGenderMatches.get(username);
}

async function getVipStatus(username) {
  const normalized = typeof username === "string" ? username.trim().slice(0, 24) : "";
  if (!normalized) return false;
  if (memoryVipUsers.has(normalized)) return true;
  if (!dbAvailable) return false;

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT is_vip FROM users WHERE username = $1 ORDER BY created_at DESC LIMIT 1`,
      [normalized]
    );
    return rows[0]?.is_vip === true;
  } catch (err) {
    warnDbFallback(err);
    return memoryVipUsers.has(normalized);
  } finally {
    client.release();
  }
}

async function getPremiumStatus(username) {
  const normalized = typeof username === "string" ? username.trim().slice(0, 24) : "";
  if (!normalized) return { isVIP: false, freeGenderMatchesLeft: 0 };
  if (!dbAvailable) {
    return {
      isVIP: memoryVipUsers.has(normalized),
      freeGenderMatchesLeft: 0,
    };
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT is_vip, free_matches_left FROM users WHERE username = $1 ORDER BY created_at DESC LIMIT 1`,
      [normalized]
    );
    const user = rows[0];
    return {
      isVIP: user?.is_vip === true || memoryVipUsers.has(normalized),
      freeGenderMatchesLeft: user?.is_vip === true ? (user?.free_matches_left ?? 0) : 0,
    };
  } catch (err) {
    warnDbFallback(err);
    return {
      isVIP: memoryVipUsers.has(normalized),
      freeGenderMatchesLeft: 0,
    };
  } finally {
    client.release();
  }
}

async function consumeGenderFilterCredit(meta) {
  // Free tier removed: no decrements; gender filters require VIP.
  if (!meta) return 0;
  if (meta.seeking === "Anyone" || meta.isVIP) return meta?.freeGenderMatchesLeft ?? 0;
  meta.freeGenderMatchesLeft = 0;
  return 0;
}

app.post("/api/premium/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const { webhookSecret: secret } = readRazorpayConfig();
  const signature = req.headers["x-razorpay-signature"];
  const rawBody = req.body?.toString("utf8") ?? "";

  if (!verifyHmac(rawBody, signature, secret)) {
    return res.status(401).json({ detail: "Invalid Razorpay webhook signature." });
  }

  try {
    const event = JSON.parse(rawBody);
    const payment = event?.payload?.payment?.entity;
    const order = event?.payload?.order?.entity;
    const username = payment?.notes?.username || order?.notes?.username;

    if ((event.event === "payment.captured" || event.event === "order.paid") && username) {
      await markUserVip(username);
      io.emit("vip_status", { username, isVIP: true });
    }

    return res.json({ received: true });
  } catch {
    return res.status(400).json({ detail: "Invalid webhook payload." });
  }
});

app.use(express.json({ limit: "1mb" }));
// Auth routes (email/password + Google)
try {
  const authRouter = require("./routes/auth");
  app.use("/api/auth", authRouter);
  console.log("[Auth] Routes mounted at /api/auth");
} catch (e) {
  console.warn("[Auth] Could not mount auth routes:", e?.message);
}

// ─── Onboarding endpoint (raw INSERT) ────────────────────────────────────────
app.post("/api/users/onboard", async (req, res) => {
  const { username, age, verified_gender } = req.body ?? {};
  if (!username || typeof username !== "string") {
    return res.status(400).json({ detail: "Username is required." });
  }
  const safeUsername = username.trim().slice(0, 24);
  if (!safeUsername) return res.status(400).json({ detail: "Username is required." });

  const safeAge = typeof age === "number" && age > 0 ? Math.floor(age) : null;
  const safeGender = typeof verified_gender === "string" ? verified_gender.trim() : null;

  if (!dbAvailable) {
    return res.status(503).json({ detail: "Database unavailable.", needsOnboarding: true });
  }

  let client;
  try {
    client = await pool.connect();
    const newId = crypto.randomUUID();
    const { rows } = await client.query(
      `INSERT INTO users (id, username, age, verified_gender) VALUES ($1, $2, $3, $4) RETURNING id`,
      [newId, safeUsername, safeAge, safeGender]
    );
    console.log(`[DB] Onboarded user id=${rows[0].id} username=${safeUsername}`);
    return res.json({ id: rows[0].id });
  } catch (err) {
    console.error("[DB] Onboard insert failed:", err.message, err.detail ?? "");
    return res.status(500).json({ detail: "Failed to create user profile.", error: err.message });
  } finally {
    client?.release();
  }
});

// ─── Login validation endpoint (raw SELECT) ─────────────────────────────────
app.get("/api/users/me", async (req, res) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) return res.status(400).json({ detail: "User ID is required." });

  if (!dbAvailable) {
    return res.status(503).json({ detail: "Database unavailable.", needsOnboarding: true });
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, username, age, verified_gender, elo, is_vip, free_matches_left FROM users WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ detail: "User not found.", needsOnboarding: true });
    }
    const user = rows[0];
    return res.json({
      id: user.id,
      username: user.username,
      age: user.age,
      verifiedGender: user.verified_gender,
      elo: user.elo,
      isVIP: user.is_vip,
      freeGenderMatchesLeft: user.free_matches_left,
    });
  } catch (err) {
    console.error("[DB] User lookup failed:", err.message);
    return res.status(500).json({ detail: "Database error." });
  } finally {
    client.release();
  }
});

app.post("/api/premium/checkout", async (req, res) => {
  const { keyId, keySecret } = readRazorpayConfig();
  const username = typeof req.body?.username === "string" ? req.body.username.trim().slice(0, 24) : "";

  if (!username) return res.status(400).json({ detail: "Username is required." });
  if (!keyId || !keySecret) {
    console.warn("[Razorpay] Missing config:", {
      keyId: !!keyId,
      keySecret: !!keySecret,
    });
    return res.status(503).json({ detail: "Razorpay is not configured on this backend." });
  }

  try {
    const amount = Math.max(1, Math.round(VIP_PRICE_INR * 100));
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        currency: "INR",
        receipt: `vip_${Date.now()}`,
        notes: { username },
      }),
    });
    const order = await orderRes.json();
    if (!orderRes.ok) {
      return res.status(502).json({ detail: order.error?.description || "Razorpay order creation failed." });
    }

    return res.json({
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (err) {
    return res.status(502).json({ detail: err.message || "Razorpay checkout failed." });
  }
});

app.post("/api/premium/verify", async (req, res) => {
  const { keySecret } = readRazorpayConfig();
  const {
    username,
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
  } = req.body ?? {};

  if (!keySecret) return res.status(503).json({ detail: "Razorpay is not configured on this backend." });
  if (!username || !orderId || !paymentId || !signature) {
    return res.status(400).json({ detail: "Missing Razorpay verification fields." });
  }

  const payload = `${orderId}|${paymentId}`;
  if (!verifyHmac(payload, signature, keySecret)) {
    return res.status(401).json({ detail: "Invalid Razorpay payment signature." });
  }

  const user = await markUserVip(username);
  io.emit("vip_status", { username: user.username, isVIP: true });
  return res.json({ isVIP: true, username: user.username, freeGenderMatchesLeft: user.freeGenderMatchesLeft ?? 5 });
});

// Minimal diagnostics (no secrets) to verify Razorpay config in production
app.get("/api/premium/config", (_req, res) => {
  const { keyId, keySecret, webhookSecret } = readRazorpayConfig();
  res.json({ configured: !!keyId && !!keySecret, webhookConfigured: !!webhookSecret, priceINR: VIP_PRICE_INR });
});

app.get("/api/premium/status", async (req, res) => {
  const username = typeof req.query.username === "string" ? req.query.username : "";
  res.json({ username, ...(await getPremiumStatus(username)) });
});

app.get("/api/geo", (req, res) => {
  const headers = req.headers || {};
  let codeHeader = headers["cf-ipcountry"] || headers["x-vercel-ip-country"] || headers["x-country-code"];
  if (Array.isArray(codeHeader)) codeHeader = codeHeader[0];
  let countryCode = typeof codeHeader === "string" && codeHeader.length === 2 ? String(codeHeader).toUpperCase() : null;
  const xf = Array.isArray(headers["x-forwarded-for"]) ? headers["x-forwarded-for"][0] : headers["x-forwarded-for"];
  const rawIp = typeof xf === "string" && xf.length ? xf.split(",")[0].trim() : (req.ip || req.socket?.remoteAddress || "");
  const ip = cleanIp(rawIp);
  let source = countryCode ? "header" : "geoip";
  if (!countryCode && ip) {
    try {
      const g = geoip.lookup(ip);
      if (g && g.country) countryCode = String(g.country).toUpperCase();
    } catch {}
  }
  const flag = countryCode ? isoFlag(countryCode) : null;
  let countryName = null;
  try {
    if (countryCode) countryName = new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode);
  } catch {}
  const country = countryCode ? (countryName ? `${flag} ${countryName}` : flag) : null;
  res.json({ ip: ip || null, countryCode: countryCode || null, country, source });
});

function normalizeGender(value) {
  return value === "Male" || value === "Female" || value === "Other" ? value : "Other";
}

function normalizeSeeking(value) {
  return value === "Male" || value === "Female" || value === "Anyone" ? value : "Anyone";
}

function wantsMatch(seeking, otherGender) {
  return seeking === "Anyone" || seeking === otherGender;
}

function profilesCanMatch(a, b) {
  return wantsMatch(a.seeking, b.gender) && wantsMatch(b.seeking, a.gender);
}

async function finalizeMatchScores(matchId, match, player1Score, player2Score, winnerId) {
  const fallbackElo = () => {
    const p1Meta = socketMeta.get(match.player1SocketId);
    const p2Meta = socketMeta.get(match.player2SocketId);
    const p1Elo = p1Meta?.elo ?? match.player1Elo ?? DEFAULT_ELO;
    const p2Elo = p2Meta?.elo ?? match.player2Elo ?? DEFAULT_ELO;
    const elo = calculateMatchElo(p1Elo, p2Elo, player1Score, player2Score);
    if (p1Meta) p1Meta.elo = elo.player1.newElo;
    if (p2Meta) p2Meta.elo = elo.player2.newElo;
    match.player1Elo = elo.player1.newElo;
    match.player2Elo = elo.player2.newElo;
    return elo;
  };

  if (!dbAvailable) return fallbackElo();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const p1Res = await client.query(`SELECT elo FROM users WHERE id = $1`, [match.player1Id]);
    const p2Res = await client.query(`SELECT elo FROM users WHERE id = $1`, [match.player2Id]);

    const player1Elo = p1Res.rows[0]?.elo ?? DEFAULT_ELO;
    const player2Elo = p2Res.rows[0]?.elo ?? DEFAULT_ELO;
    const elo = calculateMatchElo(player1Elo, player2Elo, player1Score, player2Score);

    await client.query(`UPDATE users SET elo = $1 WHERE id = $2`, [elo.player1.newElo, match.player1Id]);
    await client.query(`UPDATE users SET elo = $1 WHERE id = $2`, [elo.player2.newElo, match.player2Id]);
    await client.query(
      `UPDATE matches SET status = $1, player1_score = $2, player2_score = $3, winner_id = $4, completed_at = $5 WHERE id = $6`,
      ["COMPLETED", player1Score, player2Score, winnerId, new Date(), matchId]
    );

    await client.query("COMMIT");
    return elo;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    warnDbFallback(err);
    return fallbackElo();
  } finally {
    client.release();
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
async function ensureUser(socketId, username, userId) {
  const normalizedUsername = username || "anonymous";
  const memoryFallback = () => ({
    id: userId || `memory_user_${socketId}`,
    socketId,
    username: normalizedUsername,
    elo: DEFAULT_ELO,
    isVIP: memoryVipUsers.has(normalizedUsername),
    freeGenderMatchesLeft: getMemoryFreeGenderMatches(normalizedUsername),
  });

  if (!dbAvailable) return memoryFallback();

  const client = await pool.connect();
  try {
    // If the client passed a UUID from onboarding, sync their socket_id
    if (userId) {
      const { rows } = await client.query(
        `UPDATE users SET socket_id = $1 WHERE id = $2 RETURNING *`,
        [socketId, userId]
      );
      if (rows.length > 0) {
        const user = mapUserRow(rows[0]);
        if (memoryVipUsers.has(normalizedUsername) || user.isVIP) {
          if (!user.isVIP) {
            const vipRes = await client.query(
              `UPDATE users SET is_vip = true WHERE id = $1 RETURNING *`,
              [user.id]
            );
            return mapUserRow(vipRes.rows[0]);
          }
          return user;
        }
        return user;
      }
    }

    // Fallback: upsert by socket_id for users who haven't onboarded
    const { rows } = await client.query(
      `INSERT INTO users (id, socket_id, username) VALUES ($1, $2, $3)
       ON CONFLICT (socket_id) DO UPDATE SET username = EXCLUDED.username
       RETURNING *`,
      [crypto.randomUUID(), socketId, normalizedUsername]
    );
    const user = mapUserRow(rows[0]);
    if (memoryVipUsers.has(normalizedUsername) || await getVipStatus(normalizedUsername)) {
      const vipRes = await client.query(
        `UPDATE users SET is_vip = true WHERE id = $1 RETURNING *`,
        [user.id]
      );
      return mapUserRow(vipRes.rows[0]);
    }
    return user;
  } catch (err) {
    warnDbFallback(err);
    return memoryFallback();
  } finally {
    client.release();
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
    match = {
      id: `memory_match_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };
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
    resultSent: false,
  });

  const p1FreeLeft = await consumeGenderFilterCredit(meta1);
  const p2FreeLeft = await consumeGenderFilterCredit(meta2);
  socket.emit("usage_update", { isVIP: meta1.isVIP === true, freeGenderMatchesLeft: p1FreeLeft });
  partnerSocket.emit("usage_update", { isVIP: meta2.isVIP === true, freeGenderMatchesLeft: p2FreeLeft });

  // Real-time counter sync for the React dashboard
  socket.emit("counter_updated", { free_matches_left: p1FreeLeft });
  partnerSocket.emit("counter_updated", { free_matches_left: p2FreeLeft });

  // Emit match_started to both players with stranger's details
  socket.emit("match_started", {
    matchId: match.id,
    partnerPeerId: meta2.peerId,
    partnerUsername: meta2.username || "anonymous",
    partnerGender: meta2.gender,
    partnerCountry: meta2.country ?? null,
    role: "receiver",
    emoji,
    duration: MATCH_DURATION_SEC,
  });
  partnerSocket.emit("match_started", {
    matchId: match.id,
    partnerPeerId: meta1.peerId,
    partnerUsername: meta1.username || "anonymous",
    partnerGender: meta1.gender,
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
      if (active) active.timerId = null;
      console.log(`[T] Match ${match.id} scan started`);
    }
  }, 1000);

  activeMatches.get(match.id).timerId = timerId;
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

    if (!blockedBySkip && profilesCanMatch(currentMeta, candidateMeta)) {
      waitingQueue.splice(i, 1);
      startMatch(socket, candidate).then((ok) => {
        if (!ok) enqueueSocket(socket, peerId, skippedSocketId);
      });
      return;
    }
  }

  waitingQueue.push({ socketId: socket.id, peerId, skippedSocketId });
  socket.emit("waiting");
  console.log(`[W] ${socket.id} waiting...`);
}

// ─── Socket.io connection handler ────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  socket.on("join_queue", async ({ peerId, country, username, gender, seeking, profile, userId }) => {
    console.log(`[Q] ${socket.id} joining queue peerId=${peerId}`);
    const profileUsername = typeof profile?.username === "string" ? profile.username : username;
    const profileGender = normalizeGender(profile?.gender ?? gender);
    const profileSeeking = normalizeSeeking(profile?.seeking ?? seeking);

    // Sync user in DB (raw UPDATE if userId provided, else upsert by socket_id)
    const user = await ensureUser(socket.id, profileUsername, userId || profile?.userId);
    let isVIP = user.isVIP === true;
    let freeGenderMatchesLeft = user.freeGenderMatchesLeft ?? getMemoryFreeGenderMatches(user.username);

    // ─── Refresh VIP status from DB when applying gender filter ──
    if (profileSeeking !== "Anyone" && dbAvailable && user.id && !String(user.id).startsWith("memory_user_")) {
      const balanceClient = await pool.connect();
      try {
        const { rows } = await balanceClient.query(
          `SELECT free_matches_left, is_vip FROM users WHERE id = $1`,
          [user.id]
        );
        if (rows.length > 0) {
          isVIP = rows[0].is_vip === true;
          freeGenderMatchesLeft = rows[0].free_matches_left;
        }
      } catch (err) {
        warnDbFallback(err);
      } finally {
        balanceClient.release();
      }
    }

    // Sync client with authoritative identifiers and counters
    socket.emit("user_id", { userId: user.id });
    socket.emit("usage_update", { isVIP, freeGenderMatchesLeft });

    if (profileSeeking !== "Anyone" && !isVIP) {
      socket.emit("trigger_paywall", { free_matches_left: 0, isVIP: false });
      socket.emit("paywall_required", { freeGenderMatchesLeft: 0, isVIP: false });
      return;
    }

    const headers = socket.handshake?.headers || {};
    let codeHeader = headers["cf-ipcountry"] || headers["x-vercel-ip-country"] || headers["x-country-code"];
    if (Array.isArray(codeHeader)) codeHeader = codeHeader[0];
    let detectedCode = typeof codeHeader === "string" && codeHeader.length === 2 ? String(codeHeader).toUpperCase() : null;
    if (!detectedCode) {
      const xf = Array.isArray(headers["x-forwarded-for"]) ? headers["x-forwarded-for"][0] : headers["x-forwarded-for"];
      const rawIp = typeof xf === "string" && xf.length ? xf.split(",")[0].trim() : (socket.handshake?.address || socket.request?.connection?.remoteAddress || "");
      const ip = cleanIp(rawIp);
      if (ip) {
        try {
          const g = geoip.lookup(ip);
          if (g && g.country) detectedCode = String(g.country).toUpperCase();
        } catch {}
      }
    }
    const detectedCountry = detectedCode ? countryLabelFromCode(detectedCode) : null;

    socketMeta.set(socket.id, {
      peerId,
      userId: user.id,
      username: profileUsername || user.username || "anonymous",
      gender: profileGender,
      seeking: profileSeeking,
      country: detectedCountry ?? country ?? null,
      elo: user.elo ?? DEFAULT_ELO,
      isVIP,
      freeGenderMatchesLeft,
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

  socket.on("update_country", ({ country }) => {
    if (!country) return;
    const meta = socketMeta.get(socket.id);
    if (meta) meta.country = country;
    const existing = getMatchBySocket(socket.id);
    if (existing) socket.to(existing.roomId).emit("partner_country", { country });
  });

  socket.on("typing", ({ isTyping }) => {
    const existing = getMatchBySocket(socket.id);
    if (!existing) return;
    socket.to(existing.roomId).emit("rival_typing", { isTyping: !!isTyping });
  });

  socket.on("chat_message", ({ text }) => {
    const existing = getMatchBySocket(socket.id);
    if (!existing || !text) return;
    socket.to(existing.roomId).emit("chat_message", { text, fromSelf: false });
  });

  socket.on("live_score", ({ score }) => {
    const existing = getMatchBySocket(socket.id);
    if (!existing || typeof score !== "number") return;
    socket.to(existing.roomId).emit("partner_live_score", {
      score: Math.max(0, Math.min(10, score)),
    });
  });

  socket.on("submit_score", async ({ score }) => {
    const existing = getMatchBySocket(socket.id);
    if (!existing || typeof score !== "number") return;

    const match = activeMatches.get(existing.matchId);
    if (!match) return;

    const normalizedScore = clampScore(score);
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
      pool.query(`UPDATE users SET socket_id = NULL WHERE id = $1`, [meta.userId]).catch((err) => warnDbFallback(err));
    }
    socketMeta.delete(socket.id);

    console.log(`[-] Disconnected: ${socket.id}`);
  });
});

// ─── HTTP routes ─────────────────────────────────────────────────────────────
app.get("/", (_req, res) => res.send("ok"));
app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.get("/online", (_req, res) => {
  res.json({ count: io.engine.clientsCount ?? 0 });
});

// Graceful shutdown: drain the pg pool
process.on("SIGTERM", async () => {
  console.log("[!] SIGTERM received, shutting down...");
  await pool.end();
  process.exit(0);
});

const PORT = process.env.PORT || 3001;

// Initialize schema then start server (skip DB if env missing)
if (!process.env.DATABASE_URL) {
  console.warn("[DB] DATABASE_URL missing — running in memory-only mode");
  dbAvailable = false;
  dbWarningShown = true;
  server.listen(PORT, () =>
    console.log(`[WARN] Signaling server running on :${PORT} — DB unavailable, using memory fallback`)
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
        console.log(`[WARN] Signaling server running on :${PORT} — DB unavailable, using memory fallback`)
      );
    });
}
