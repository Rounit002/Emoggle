const { Pool } = require("pg");

const isProduction = process.env.NODE_ENV === "production";
const databaseSsl = isProduction
  ? {
      rejectUnauthorized: false,
      ...(process.env.DB_CA_CERT
        ? { ca: process.env.DB_CA_CERT.replace(/\\n/g, "\n") }
        : {}),
    }
  : false;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
  statement_timeout: 10000,
  query_timeout: 12000,
  application_name: "emoggle-signaling",
  ssl: databaseSsl,
});

async function initSchema() {
  const client = await pool.connect();
  try {
    // Ensure UUID function is available on all PostgreSQL versions
    // Wrapped separately — Supabase may deny extension creation but it's already enabled
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    } catch (extErr) {
      console.warn("[DB] pgcrypto extension note:", extErr.message);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        socket_id VARCHAR UNIQUE,
        username VARCHAR DEFAULT 'anonymous',
        age INT,
        verified_gender VARCHAR,
        elo INT DEFAULT 1000,
        is_vip BOOLEAN DEFAULT false,
        free_matches_left INT DEFAULT 5,
        created_at TIMESTAMP DEFAULT NOW(),
        email VARCHAR UNIQUE,
        password_hash VARCHAR,
        auth_provider VARCHAR DEFAULT 'local',
        google_id VARCHAR UNIQUE,
        login_count INT DEFAULT 0,
        last_login_at TIMESTAMP,
        vip_expires_at TIMESTAMPTZ,
        revenuecat_event_at TIMESTAMPTZ
      )
    `);

    // Migrations: add auth columns to existing databases without dropping data
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR UNIQUE`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR DEFAULT 'local'`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR UNIQUE`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INT DEFAULT 0`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_expires_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS revenuecat_event_at TIMESTAMPTZ`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS celebrity_faces (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(50) NOT NULL CHECK (category IN ('meme', 'celebrity', 'character')),
        image_url TEXT NOT NULL,
        difficulty VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
        facial_landmarks JSONB,
        /* Optional, hand-curated normalized expression target (0..1) used
           when no pre-computed facial_landmarks exist. See
           frontend/app/lib/celebrityScoring.ts for the metric names. */
        expression_profile JSONB,
        usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`ALTER TABLE celebrity_faces ADD COLUMN IF NOT EXISTS expression_profile JSONB`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS matches (
        id UUID PRIMARY KEY,
        player1_id UUID REFERENCES users(id),
        player2_id UUID REFERENCES users(id),
        current_emoji VARCHAR,
        player1_score FLOAT,
        player2_score FLOAT,
        winner_id UUID,
        status VARCHAR DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      )
    `);
    // Migrations: extend the matches table so we can record the game mode
    // (emoji duel vs celebrity mimic) and the selected celebrity id without
    // breaking the legacy emoji-only rows. The defaults keep the existing
    // shape intact for older data; new celebrity matches will populate
    // `game_mode='celebrity'` and a non-null `celebrity_id`.
    await client.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS game_mode VARCHAR(20) NOT NULL DEFAULT 'emoji'`);
    await client.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS celebrity_id INTEGER`);
    await client.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS celebrity_name VARCHAR(255)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_matches_game_mode ON matches(game_mode)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_matches_celebrity_id ON matches(celebrity_id)`);
    await client.query(`ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_game_mode_check`);
    await client.query(`ALTER TABLE matches ADD CONSTRAINT matches_game_mode_check CHECK (game_mode IN ('emoji', 'celebrity'))`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        token VARCHAR(64) PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days')
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS moderation_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        reporter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reported_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason VARCHAR(64) NOT NULL DEFAULT 'unspecified',
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (match_id, reporter_user_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_moderation_reports_reported_user ON moderation_reports(reported_user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_socket_id ON users(socket_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_elo ON users(elo)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_matches_player1_id ON matches(player1_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_matches_player2_id ON matches(player2_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_celebrity_faces_category ON celebrity_faces(category)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_celebrity_faces_difficulty ON celebrity_faces(difficulty)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_celebrity_faces_usage ON celebrity_faces(usage_count)`);
    await client.query(`DELETE FROM sessions WHERE expires_at <= NOW()`);
    console.log("[DB] Schema initialized successfully");
  } catch (err) {
    console.error("[DB] Schema initialization error:", err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, initSchema };
