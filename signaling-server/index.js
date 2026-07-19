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

const express = require("express");
const http = require("http");
const crypto = require("crypto");
const { Server } = require("socket.io");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
let geoip;
try {
  geoip = require("geoip-lite");
} catch {
  geoip = { lookup: () => null };
}
const { pool, initSchema } = require("./db");

const app = express();
app.set("trust proxy", 1); // Trust Render's reverse proxy

// ─── Rate Limiters ─────────────────────────────────────────────────────────
// General API limiter: 60 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
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

app.use(express.json({ limit: "1mb" }));

// Apply rate limiting to all /api routes
app.use("/api", apiLimiter);

// Celebrity Face Mimic routes
try {
  const celebrityRouter = require("./routes/celebrity");
  app.use("/api/celebrity", celebrityRouter);
  console.log("[Celebrity] Routes mounted at /api/celebrity");
} catch (e) {
  console.warn("[Celebrity] Could not mount celebrity routes:", e?.message);
}

// ─── Anonymous player validation endpoint ────────────────────────────────────
app.get("/api/users/me", async (req, res) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) return res.status(400).json({ detail: "User ID is required." });

  if (!dbAvailable) {
    return res.status(503).json({ detail: "Database unavailable.", needsOnboarding: true });
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, elo, is_vip FROM users WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ detail: "User not found.", needsOnboarding: true });
    }
    const user = rows[0];
    return res.json({
      id: user.id,
      elo: user.elo,
      isVIP: user.is_vip,
    });
  } catch (err) {
    console.error("[DB] User lookup failed:", err.message);
    return res.status(500).json({ detail: "Database error." });
  } finally {
    client.release();
  }
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
async function ensureUser(socketId, userId) {
  const memoryFallback = () => ({
    id: userId || `memory_user_${socketId}`,
    socketId,
    elo: DEFAULT_ELO,
    isVIP: false,
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
        return mapUserRow(rows[0]);
      }
    }

    // Create an anonymous row for a browser that has no persistent ID yet.
    const { rows } = await client.query(
      `INSERT INTO users (id, socket_id) VALUES ($1, $2)
       ON CONFLICT (socket_id) DO UPDATE SET socket_id = EXCLUDED.socket_id
       RETURNING *`,
      [crypto.randomUUID(), socketId]
    );
    return mapUserRow(rows[0]);
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

    if (!blockedBySkip) {
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

  socket.on("join_queue", async ({ peerId, country, userId }) => {
    console.log(`[Q] ${socket.id} joining queue peerId=${peerId}`);

    const user = await ensureUser(socket.id, userId);
    const isVIP = user.isVIP === true;

    socket.emit("user_id", { userId: user.id });
    socket.emit("usage_update", { isVIP });

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
      country: detectedCountry ?? country ?? null,
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

app.get("/online", apiLimiter, (_req, res) => {
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
