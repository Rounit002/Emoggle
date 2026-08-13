const crypto = require("crypto");
const { pool } = require("../db");

const SESSION_COOKIE_NAME = "emoggle_session";

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function extractBearerToken(authHeader) {
  if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return /^[a-f0-9]{64}$/i.test(token) ? token : null;
}

function normalizeSessionToken(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value) ? value : null;
}

function parseCookieToken(cookieHeader) {
  if (typeof cookieHeader !== "string") return null;
  const escapedName = SESSION_COOKIE_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escapedName}=([^;]+)`));
  if (!match) return null;
  try {
    const token = decodeURIComponent(match[1]);
    return normalizeSessionToken(token);
  } catch {
    return null;
  }
}

function extractRequestToken(req) {
  return (
    extractBearerToken(req.headers?.authorization) ||
    normalizeSessionToken(req.cookies?.[SESSION_COOKIE_NAME]) ||
    parseCookieToken(req.headers?.cookie)
  );
}

/**
 * A session bootstrap is scoped to a browser tab, while cookies are shared by
 * every tab for the origin. Only an explicit bearer token may resume an
 * existing anonymous player; a cookie-only bootstrap must create a new player.
 */
function extractSessionResumeToken(req) {
  return extractBearerToken(req.headers?.authorization);
}

async function findSessionUser(token) {
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) return null;
  const tokenHash = hashSessionToken(token);
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.email, u.elo, u.is_vip
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > NOW()`,
    [tokenHash],
  );
  return rows[0] || null;
}

async function verifyToken(req, res, next) {
  const token = extractRequestToken(req);
  if (!token) {
    return res.status(401).json({ detail: "Authentication required." });
  }

  try {
    const user = await findSessionUser(token);
    if (!user) {
      return res.status(401).json({ detail: "Invalid or expired session." });
    }
    req.user = user;
    req.sessionToken = token;
    req.sessionTokenHash = hashSessionToken(token);
    return next();
  } catch (err) {
    console.error("[Auth] HTTP session verification failed:", err.message);
    return res.status(503).json({ detail: "Authentication service unavailable." });
  }
}

async function verifySocketToken(socket, next) {
  const token =
    extractBearerToken(
      typeof socket.handshake.auth?.token === "string"
        ? `Bearer ${socket.handshake.auth.token}`
        : null,
    ) || parseCookieToken(socket.handshake.headers?.cookie);

  if (!token) return next(new Error("Authentication required"));

  try {
    const user = await findSessionUser(token);
    if (!user) return next(new Error("Invalid or expired session"));
    socket.user = user;
    socket.sessionTokenHash = hashSessionToken(token);
    return next();
  } catch (err) {
    console.error("[Auth] Socket session verification failed:", err.message);
    return next(new Error("Authentication service unavailable"));
  }
}

module.exports = {
  SESSION_COOKIE_NAME,
  extractBearerToken,
  extractRequestToken,
  extractSessionResumeToken,
  findSessionUser,
  hashSessionToken,
  normalizeSessionToken,
  parseCookieToken,
  verifyToken,
  verifySocketToken,
};
