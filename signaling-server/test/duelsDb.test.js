// Use an explicitly configured disposable database. Never falls back to memory.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { DuelStore } = require('../duelStore');
test('PostgreSQL private migration, browser grants, seat claims, ledger and rollback', { skip: !process.env.DUEL_TEST_DATABASE_URL }, async () => {
    const pool = new Pool({ connectionString: process.env.DUEL_TEST_DATABASE_URL, ssl: process.env.DUEL_TEST_DB_TLS === 'true' ? { rejectUnauthorized: true, ...(process.env.DB_CA_CERT ? { ca: process.env.DB_CA_CERT.replace(/\\n/g, '\n') } : {}) } : false });
    const ids = Array.from({ length: 3 }, () => crypto.randomUUID()), seriesIds = [], matchIds = [];
    const store = new DuelStore({ pool, available: () => true, production: true });
    try {
        await pool.query(fs.readFileSync(path.join(__dirname, '..', 'duel-schema.sql'), 'utf8'));
        for (const id of ids)
            await pool.query('INSERT INTO users(id) VALUES($1)', [id]);
        for (const table of ['duel_series', 'duel_invites', 'duel_series_rounds']) {
            const rls = await pool.query('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass', [table]);
            assert.equal(rls.rows[0].relrowsecurity, true);
            const roles = await pool.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')");
            for (const { rolname } of roles.rows) {
                const grants = await pool.query('SELECT has_table_privilege($1,$2,\'SELECT,INSERT,UPDATE,DELETE\') AS permitted', [rolname, table]);
                assert.equal(grants.rows[0].permitted, false);
            }
        }
        const made = await store.create(ids[0], { gameMode: 'emoji', totalRounds: 3 });
        seriesIds.push(made.series.id);
        const concurrent = new DuelStore({ pool, available: () => true, production: true });
        concurrent.series = new Map(structuredClone([...store.series]));
        concurrent.invites = new Map(structuredClone([...store.invites]));
        const claimed = await Promise.allSettled([store.join(ids[1], made.token), concurrent.join(ids[2], made.token)]);
        assert.equal(claimed.filter(r => r.status === 'fulfilled').length, 1);
        const guest = (await pool.query('SELECT guest_id FROM duel_series WHERE id=$1', seriesIds)).rows[0].guest_id;
        assert.ok(ids.slice(1).includes(guest));
        made.series.guestId = guest;
        made.series.state = 'ready';
        const match = { id: crypto.randomUUID(), player1Id: ids[0] };
        matchIds.push(match.id);
        await pool.query("INSERT INTO matches(id,player1_id,player2_id,status,game_mode) VALUES($1,$2,$3,'ACTIVE','emoji')", [match.id, ids[0], guest]);
        await store.recordRound(made.series, match, 8, 5);
        await store.recordRound(made.series, match, 8, 5);
        assert.equal(Number((await pool.query('SELECT count(*) FROM duel_series_rounds WHERE series_id=$1', seriesIds)).rows[0].count), 1);
        const ledger = await pool.query('SELECT host_points,guest_points FROM duel_series WHERE id=$1', seriesIds);
        assert.equal(ledger.rows[0].host_points, 2);
        assert.equal(ledger.rows[0].guest_points, 0);
        await assert.rejects(pool.query('INSERT INTO duel_series_rounds(series_id,round_number,match_id,host_score,guest_score) VALUES($1,1,$2,8,5)', [made.series.id, match.id]));
        await store.state(made.series, 'round_result');
        await store.advance(made.series);
        await assert.rejects(store.recordRound(made.series, { id: crypto.randomUUID(), player1Id: ids[0] }, 8, 5));
        assert.equal((await pool.query('SELECT host_points FROM duel_series WHERE id=$1', seriesIds)).rows[0].host_points, 2, 'Failed match FK transaction rolls back points');
        await store.state(made.series, 'cancelled');
        const comparison = await store.create(ids[0], { gameMode: 'facesync', totalRounds: 3 });
        seriesIds.push(comparison.series.id);
        assert.equal((await pool.query('SELECT game_mode FROM duel_series WHERE id=$1', [comparison.series.id])).rows[0].game_mode, 'facesync');
        await assert.rejects(pool.query("UPDATE duel_series SET game_mode='unsupported' WHERE id=$1", [comparison.series.id]));
        // The migration also succeeds on an already initialized schema.
        await pool.query(fs.readFileSync(path.join(__dirname, '..', 'duel-schema.sql'), 'utf8'));
    }
    finally {
        for (const id of seriesIds)
            await pool.query('DELETE FROM duel_series WHERE id=$1', [id]);
        for (const id of matchIds)
            await pool.query('DELETE FROM matches WHERE id=$1', [id]);
        for (const id of ids)
            await pool.query('DELETE FROM users WHERE id=$1', [id]);
        await pool.end();
    }
});
