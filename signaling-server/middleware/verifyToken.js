const jwt = require("jsonwebtoken");

function verifyToken(req, res, next) {
  const token = req.cookies?.token || extractBearerToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({ detail: "Authentication required." });
  }

  if (!process.env.JWT_SECRET) {
    console.error("[Auth] JWT_SECRET is not set");
    return res.status(500).json({ detail: "Server authentication misconfiguration." });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ detail: "Invalid or expired token." });
  }
}

function verifySocketToken(socket, next) {
  const token =
    socket.handshake.auth?.token ||
    parseCookieToken(socket.handshake.headers?.cookie);

  if (!token) {
    socket.user = null;
    return next();
  }

  if (!process.env.JWT_SECRET) {
    socket.user = null;
    return next();
  }

  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    socket.user = null;
  }

  next();
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
