const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const { pool } = require("../db");

const router = express.Router();

const SALT_ROUNDS = 10;
const SESSION_DAYS = 7;

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function createSession(client, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await client.query(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, userId, expiresAt]
  );
  return token;
}

function setSessionCookie(res, token) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
}

function safeUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    age: row.age,
    verifiedGender: row.verified_gender,
    elo: row.elo,
    isVIP: row.is_vip,
    freeGenderMatchesLeft: row.free_matches_left,
    authProvider: row.auth_provider,
    createdAt: row.created_at,
    loginCount: row.login_count,
    lastLoginAt: row.last_login_at,
  };
}

// ─── POST /api/auth/register ─────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  const { email, password, username, age, verified_gender } = req.body ?? {};

  if (!email || !password || !username) {
    return res.status(400).json({ detail: "email, password, and username are required." });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ detail: "Password must be at least 8 characters." });
  }

  const safeEmail = email.trim().toLowerCase();
  const safeUsername = String(username).trim().slice(0, 24);
  const safeAge = typeof age === "number" && age > 0 ? Math.floor(age) : null;
  const safeGender = typeof verified_gender === "string" ? verified_gender.trim() : null;

  let client;
  try {
    client = await pool.connect();
    const existing = await client.query("SELECT id FROM users WHERE email = $1", [safeEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ detail: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const newId = crypto.randomUUID();

    const { rows } = await client.query(
      `INSERT INTO users (id, email, password_hash, username, age, verified_gender, auth_provider, login_count, last_login_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'local', 1, NOW())
       RETURNING id, username, email, age, verified_gender, elo, is_vip, free_matches_left, auth_provider, created_at, login_count, last_login_at`,
      [newId, safeEmail, passwordHash, safeUsername, safeAge, safeGender]
    );

    const token = await createSession(client, rows[0].id);
    setSessionCookie(res, token);
    return res.status(201).json({ user: safeUser(rows[0]) });
  } catch (err) {
    console.error("[Auth] Register error:", err.message);
    return res.status(500).json({ detail: "Registration failed.", error: err.message });
  } finally {
    client?.release();
  }
});

// ─── POST /api/auth/login ────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ detail: "email and password are required." });
  }

  const safeEmail = email.trim().toLowerCase();

  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query(
      `SELECT id, username, email, password_hash, age, verified_gender, elo, is_vip, free_matches_left, auth_provider, created_at, login_count, last_login_at
       FROM users WHERE email = $1`,
      [safeEmail]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ detail: "Invalid email or password." });
    }

    if (user.auth_provider !== "local" || !user.password_hash) {
      return res.status(401).json({
        detail: "This account uses Google sign-in. Please log in with Google.",
      });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ detail: "Invalid email or password." });
    }

    const updated = await client.query(
      `UPDATE users SET login_count = COALESCE(login_count,0) + 1, last_login_at = NOW() WHERE id = $1
       RETURNING id, username, email, age, verified_gender, elo, is_vip, free_matches_left, auth_provider, created_at, login_count, last_login_at`,
      [user.id]
    );
    const token = await createSession(client, user.id);
    setSessionCookie(res, token);
    return res.json({ user: safeUser(updated.rows[0]) });
  } catch (err) {
    console.error("[Auth] Login error:", err.message);
    return res.status(500).json({ detail: "Login failed.", error: err.message });
  } finally {
    client?.release();
  }
});

// ─── POST /api/auth/google ───────────────────────────────────────────────────
router.post("/google", async (req, res) => {
  const { idToken } = req.body ?? {};

  if (!idToken) {
    return res.status(400).json({ detail: "idToken is required." });
  }
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ detail: "Google OAuth is not configured on this server." });
  }

  let googlePayload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    googlePayload = ticket.getPayload();
  } catch (err) {
    console.error("[Auth] Google token verification failed:", err.message);
    return res.status(401).json({ detail: "Invalid Google ID token." });
  }

  const { sub: googleId, email, name } = googlePayload;
  const safeEmail = email?.trim().toLowerCase() ?? null;

  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query(
      `SELECT id, username, email, google_id, age, verified_gender, elo, is_vip, free_matches_left, auth_provider, created_at, login_count, last_login_at
       FROM users WHERE google_id = $1 OR (email = $2 AND $2 IS NOT NULL)
       LIMIT 1`,
      [googleId, safeEmail]
    );

    let user = rows[0];

    if (!user) {
      const newId = crypto.randomUUID();
      const safeUsername = (name ?? safeEmail?.split("@")[0] ?? "user").slice(0, 24);
      const { rows: inserted } = await client.query(
        `INSERT INTO users (id, email, google_id, username, auth_provider, login_count, last_login_at)
         VALUES ($1, $2, $3, $4, 'google', 1, NOW())
         RETURNING id, username, email, age, verified_gender, elo, is_vip, free_matches_left, auth_provider, created_at, login_count, last_login_at`,
        [newId, safeEmail, googleId, safeUsername]
      );
      user = inserted[0];
    } else if (!user.google_id) {
      const { rows: linked } = await client.query(
        `UPDATE users SET google_id = $1, auth_provider = 'google' WHERE id = $2
         RETURNING id, username, email, age, verified_gender, elo, is_vip, free_matches_left, auth_provider, created_at, login_count, last_login_at`,
        [googleId, user.id]
      );
      user = linked[0];
    }

    const updated = await client.query(
      `UPDATE users SET login_count = COALESCE(login_count,0) + 1, last_login_at = NOW() WHERE id = $1
       RETURNING id, username, email, age, verified_gender, elo, is_vip, free_matches_left, auth_provider, created_at, login_count, last_login_at`,
      [user.id]
    );
    const token = await createSession(client, user.id);
    setSessionCookie(res, token);
    return res.json({ user: safeUser(updated.rows[0]) });
  } catch (err) {
    console.error("[Auth] Google auth error:", err.message);
    return res.status(500).json({ detail: "Google authentication failed.", error: err.message });
  } finally {
    client?.release();
  }
});

// ─── POST /api/auth/logout ───────────────────────────────────────────────────
router.post("/logout", async (req, res) => {
  const token = req.cookies?.token;
  const isProd = process.env.NODE_ENV === "production";
  if (token) {
    let client;
    try {
      client = await pool.connect();
      await client.query("DELETE FROM sessions WHERE token = $1", [token]);
    } catch (err) {
      console.error("[Auth] Logout error:", err.message);
    } finally {
      client?.release();
    }
  }
  res.clearCookie("token", {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
  });
  return res.json({ message: "Logged out." });
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
router.get("/me", async (req, res) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ detail: "Not authenticated." });
  }

  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query(
      `SELECT u.id, u.username, u.email, u.age, u.verified_gender, u.elo, u.is_vip, u.free_matches_left, u.auth_provider, u.created_at, u.login_count, u.last_login_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = $1 AND s.expires_at > NOW()`,
      [token]
    );
    if (!rows[0]) return res.status(401).json({ detail: "Session expired or invalid." });
    return res.json({ user: safeUser(rows[0]) });
  } catch (err) {
    console.error("[Auth] /me error:", err.message);
    return res.status(500).json({ detail: "Database error.", error: err.message });
  } finally {
    client?.release();
  }
});

module.exports = router;
