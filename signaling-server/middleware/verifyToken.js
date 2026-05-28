const { pool } = require("../db");

async function verifyToken(req, res, next) {
  const token = req.cookies?.token || extractBearerToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({ detail: "Authentication required." });
  }

  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1 AND s.expires_at > NOW()`,
      [token]
    );
    if (!rows[0]) {
      return res.status(401).json({ detail: "Invalid or expired session." });
    }
    req.user = rows[0];
    next();
  } catch (err) {
    console.error("[Auth] verifyToken error:", err.message);
    return res.status(500).json({ detail: "Authentication error." });
  } finally {
    client?.release();
  }
}

async function verifySocketToken(socket, next) {
  const token =
    socket.handshake.auth?.token ||
    parseCookieToken(socket.handshake.headers?.cookie);

  if (!token) {
    socket.user = null;
    return next();
  }

  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query(
      `SELECT u.id, u.username, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1 AND s.expires_at > NOW()`,
      [token]
    );
    socket.user = rows[0] || null;
  } catch {
    socket.user = null;
  } finally {
    client?.release();
    next();
  }
}

function extractBearerToken(authHeader) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

function parseCookieToken(cookieHeader) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

module.exports = { verifyToken, verifySocketToken };
