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
  google_id         VARCHAR       UNIQUE
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

-- ─── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_socket_id    ON users(socket_id);
CREATE INDEX IF NOT EXISTS idx_users_elo          ON users(elo);
CREATE INDEX IF NOT EXISTS idx_matches_status     ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_player1_id ON matches(player1_id);
CREATE INDEX IF NOT EXISTS idx_matches_player2_id ON matches(player2_id);
