-- ─────────────────────────────────────────────────────────────
--  Emoggle / FitCheckDuel  –  Full Database Schema
--  Run this file once against your PostgreSQL database:
--    psql -U postgres -d Emoggle -f schema.sql
-- ─────────────────────────────────────────────────────────────

-- Required extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  socket_id         VARCHAR       UNIQUE,
  username          VARCHAR       DEFAULT 'anonymous',
  age               INT,
  verified_gender   VARCHAR,
  elo               INT           DEFAULT 1000,
  is_vip            BOOLEAN       DEFAULT false,
  free_matches_left INT           DEFAULT 5,
  created_at        TIMESTAMP     DEFAULT NOW(),

  -- Auth columns
  email             VARCHAR       UNIQUE,
  password_hash     VARCHAR,
  auth_provider     VARCHAR       DEFAULT 'local',
  google_id         VARCHAR       UNIQUE,
  login_count       INT           DEFAULT 0,
  last_login_at     TIMESTAMP,
  vip_expires_at    TIMESTAMPTZ,
  revenuecat_event_at TIMESTAMPTZ
);

-- Session tokens are random bearer credentials and are stored as SHA-256 hashes.
CREATE TABLE IF NOT EXISTS sessions (
  token       VARCHAR(64) PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW(),
  expires_at  TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days')
);

-- ─── Matches ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matches (
  id             UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id     UUID      REFERENCES users(id),
  player2_id     UUID      REFERENCES users(id),
  current_emoji  VARCHAR,
  player1_score  FLOAT,
  player2_score  FLOAT,
  winner_id      UUID,
  status         VARCHAR   DEFAULT 'ACTIVE',
  created_at     TIMESTAMP DEFAULT NOW(),
  completed_at   TIMESTAMP
);

CREATE TABLE IF NOT EXISTS moderation_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id          UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  reporter_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason            VARCHAR(64) NOT NULL DEFAULT 'unspecified',
  created_at        TIMESTAMP DEFAULT NOW(),
  UNIQUE (match_id, reporter_user_id)
);

CREATE TABLE IF NOT EXISTS celebrity_faces (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(255) NOT NULL,
  category          VARCHAR(50) NOT NULL CHECK (category IN ('meme', 'celebrity', 'character')),
  image_url         TEXT NOT NULL,
  difficulty        VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  facial_landmarks  JSONB,
  usage_count       INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  created_at        TIMESTAMP DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_socket_id    ON users(socket_id);
CREATE INDEX IF NOT EXISTS idx_users_elo          ON users(elo);
CREATE INDEX IF NOT EXISTS idx_matches_status     ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_player1_id ON matches(player1_id);
CREATE INDEX IF NOT EXISTS idx_matches_player2_id ON matches(player2_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_moderation_reports_reported_user ON moderation_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_celebrity_faces_category ON celebrity_faces(category);
CREATE INDEX IF NOT EXISTS idx_celebrity_faces_difficulty ON celebrity_faces(difficulty);
CREATE INDEX IF NOT EXISTS idx_celebrity_faces_usage ON celebrity_faces(usage_count);
