CREATE TABLE IF NOT EXISTS duel_series (
 id UUID PRIMARY KEY, host_id UUID NOT NULL REFERENCES users(id), guest_id UUID REFERENCES users(id),
 game_mode VARCHAR(20) NOT NULL CHECK(game_mode IN ('emoji','celebrity','facesync')),
 total_rounds INTEGER NOT NULL CHECK(total_rounds IN (1,3,5)),
 state VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK(state IN ('waiting','ready','playing','round_result','suspended','completed','cancelled','aborted','expired')), version INTEGER NOT NULL DEFAULT 1,
 current_round INTEGER NOT NULL DEFAULT 1, host_points INTEGER NOT NULL DEFAULT 0,
 guest_points INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL, completed_at TIMESTAMPTZ,
 CHECK(host_id IS DISTINCT FROM guest_id),
 CHECK(current_round BETWEEN 1 AND total_rounds), CHECK(host_points BETWEEN 0 AND total_rounds*2), CHECK(guest_points BETWEEN 0 AND total_rounds*2), CHECK(version>0)
);
-- Upgrade existing installations as well as fresh databases.
ALTER TABLE duel_series DROP CONSTRAINT IF EXISTS duel_series_game_mode_check;
ALTER TABLE duel_series ADD CONSTRAINT duel_series_game_mode_check CHECK(game_mode IN ('emoji','celebrity','facesync'));
CREATE TABLE IF NOT EXISTS duel_invites (
 digest VARCHAR(64) PRIMARY KEY, series_id UUID NOT NULL REFERENCES duel_series(id) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL, consumed_by UUID REFERENCES users(id), revoked BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS duel_invites_expiry ON duel_invites(expires_at);
CREATE INDEX IF NOT EXISTS duel_series_host ON duel_series(host_id,state);
CREATE INDEX IF NOT EXISTS duel_series_guest ON duel_series(guest_id,state);
CREATE TABLE IF NOT EXISTS duel_series_rounds (
 series_id UUID NOT NULL REFERENCES duel_series(id) ON DELETE CASCADE, round_number INTEGER NOT NULL CHECK(round_number BETWEEN 1 AND 5),
 match_id UUID UNIQUE NOT NULL REFERENCES matches(id), host_score FLOAT NOT NULL CHECK(host_score BETWEEN 0 AND 10), guest_score FLOAT NOT NULL CHECK(guest_score BETWEEN 0 AND 10),
 winner_id UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(series_id,round_number)
);
ALTER TABLE duel_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE duel_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE duel_series_rounds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON duel_series,duel_invites,duel_series_rounds FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON duel_series,duel_invites,duel_series_rounds FROM anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON duel_series,duel_invites,duel_series_rounds FROM authenticated;
 END IF;
END $$;
