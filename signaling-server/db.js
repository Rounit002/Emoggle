const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
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
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
        google_id VARCHAR UNIQUE
      )
    `);

    // Migrations: add auth columns to existing databases without dropping data
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR UNIQUE`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR DEFAULT 'local'`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR UNIQUE`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS matches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        token VARCHAR(64) PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days')
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_socket_id ON users(socket_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_elo ON users(elo)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_matches_player1_id ON matches(player1_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_matches_player2_id ON matches(player2_id)`);
    console.log("[DB] Schema initialized successfully");
  } catch (err) {
    console.error("[DB] Schema initialization error:", err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, initSchema };
