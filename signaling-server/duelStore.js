const crypto = require("node:crypto");
const TERMINAL = new Set(["completed", "cancelled", "expired", "aborted"]);
const INVITE_TTL = 15 * 60000;
const SERIES_TTL = 90 * 60000;
const tokenDigest = token => crypto.createHash("sha256").update(token).digest("hex");
const validToken = token => typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
class DuelStore {
    constructor({ pool, available, production = false, now = Date.now }) {
        this.pool = pool;
        this.available = available;
        this.production = production;
        this.now = now;
        this.series = new Map();
        this.invites = new Map();
        this.tail = Promise.resolve();
    }
    run(fn) { const result = this.tail.then(fn); this.tail = result.catch(() => { }); return result; }
    member(userId) { return [...this.series.values()].find(s => !TERMINAL.has(s.state) && (s.hostId === userId || s.guestId === userId)); }
    async transaction(fn) {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const result = await fn(client);
            await client.query("COMMIT");
            return result;
        }
        catch (e) {
            await client.query("ROLLBACK").catch(() => { });
            throw e;
        }
        finally {
            client.release();
        }
    }
    async recover() {
        if (!this.available())
            return;
        await this.pool.query("UPDATE duel_series SET state='aborted',completed_at=NOW(),version=version+1 WHERE state NOT IN ('completed','cancelled','expired','aborted')");
    }
    async create(userId, rules) {
        return this.run(async () => {
            if (!rules || !["emoji", "celebrity", "facesync"].includes(rules.gameMode) || ![1, 3, 5].includes(rules.totalRounds))
                throw fail("Choose 1, 3 or 5 rounds and a supported game.", 400);
            if (this.member(userId))
                throw fail("Leave your existing 1v1 first.");
            if ([...this.series.values()].filter(s => !TERMINAL.has(s.state)).length >= 1000)
                throw fail("1v1 is busy. Try again later.", 503);
            if (this.series.size >= 10000) {
                const old = [...this.series.values()].find(s => TERMINAL.has(s.state));
                if (old) {
                    this.series.delete(old.id);
                    for (const [key, i] of this.invites)
                        if (i.seriesId === old.id)
                            this.invites.delete(key);
                }
                else
                    throw fail("1v1 is busy. Try again later.", 503);
            }
            const persistent = this.available();
            if (!persistent && this.production)
                throw fail("Private games need the database. Please retry later.", 503);
            const now = this.now(), token = crypto.randomBytes(32).toString("base64url"), digest = tokenDigest(token);
            const s = { id: crypto.randomUUID(), hostId: userId, guestId: null, gameMode: rules.gameMode, totalRounds: rules.totalRounds, state: "waiting", readinessGeneration: 1, version: 1, currentRound: 1, hostPoints: 0, guestPoints: 0, createdAt: now, expiresAt: now + SERIES_TTL, completedAt: null, results: [], persistent };
            const invite = { digest, seriesId: s.id, expiresAt: now + INVITE_TTL, consumedBy: null, revoked: false };
            if (persistent)
                await this.transaction(async (c) => {
                    await c.query("INSERT INTO duel_series(id,host_id,game_mode,total_rounds,expires_at) VALUES($1,$2,$3,$4,$5)", [s.id, userId, s.gameMode, s.totalRounds, new Date(s.expiresAt)]);
                    await c.query("INSERT INTO duel_invites(digest,series_id,expires_at) VALUES($1,$2,$3)", [digest, s.id, new Date(invite.expiresAt)]);
                });
            this.series.set(s.id, s);
            this.invites.set(digest, invite);
            return { series: s, token, inviteExpiresAt: invite.expiresAt };
        });
    }
    preview(token) {
        if (!validToken(token))
            throw fail("This invitation is unavailable.", 404);
        const i = this.invites.get(tokenDigest(token)), s = i && this.series.get(i.seriesId);
        if (!i || !s || i.revoked || i.consumedBy || i.expiresAt <= this.now() || TERMINAL.has(s.state))
            throw fail("This invitation is expired, used or cancelled.", 404);
        return { gameMode: s.gameMode, totalRounds: s.totalRounds, expiresAt: i.expiresAt };
    }
    async join(userId, token) {
        return this.run(async () => {
            if (!validToken(token))
                throw fail("This invitation is unavailable.", 404);
            const digest = tokenDigest(token), i = this.invites.get(digest), s = i && this.series.get(i.seriesId);
            if (!s || !i || i.revoked || i.expiresAt <= this.now() || TERMINAL.has(s.state))
                throw fail("This invitation is expired or cancelled.", 404);
            if (s.hostId === userId)
                throw fail("Open this link as your friend, not the host.");
            if (i.consumedBy === userId && s.guestId === userId)
                return s;
            if (i.consumedBy || s.guestId)
                throw fail("This 1v1 already has two players.");
            if (this.member(userId))
                throw fail("Leave your existing 1v1 first.");
            if (s.persistent)
                await this.transaction(async (c) => {
                    const rows = await c.query("SELECT * FROM duel_invites WHERE digest=$1 FOR UPDATE", [digest]);
                    const locked = rows.rows[0];
                    if (!locked || locked.revoked || locked.consumed_by || new Date(locked.expires_at).getTime() <= this.now())
                        throw fail("This invitation is unavailable.");
                    const updated = await c.query("UPDATE duel_series SET guest_id=$1,state='ready',version=version+1 WHERE id=$2 AND guest_id IS NULL AND state='waiting' RETURNING id", [userId, s.id]);
                    if (updated.rowCount !== 1)
                        throw fail("This 1v1 already has two players.");
                    await c.query("UPDATE duel_invites SET consumed_by=$1 WHERE digest=$2", [userId, digest]);
                });
            i.consumedBy = userId;
            s.guestId = userId;
            s.state = "ready";
            s.version++;
            return s;
        });
    }
    get(id, userId) { const s = this.series.get(id); if (!s || (s.hostId !== userId && s.guestId !== userId))
        throw fail("1v1 not found.", 404); return s; }
    async regenerate(id, userId) {
        return this.run(async () => {
            const s = this.get(id, userId);
            if (s.hostId !== userId || s.guestId || s.state !== "waiting")
                throw fail("Only an unclaimed host invitation can be regenerated.");
            const token = crypto.randomBytes(32).toString("base64url"), digest = tokenDigest(token), expiresAt = Math.min(this.now() + INVITE_TTL, s.expiresAt);
            if (s.persistent)
                await this.transaction(async (c) => {
                    await c.query("UPDATE duel_invites SET revoked=true WHERE series_id=$1", [id]);
                    await c.query("INSERT INTO duel_invites(digest,series_id,expires_at) VALUES($1,$2,$3)", [digest, id, new Date(expiresAt)]);
                });
            for (const [key, i] of this.invites)
                if (i.seriesId === id)
                    this.invites.delete(key);
            this.invites.set(digest, { digest, seriesId: id, expiresAt, revoked: false, consumedBy: null });
            return { series: s, token, inviteExpiresAt: expiresAt };
        });
    }
    async state(s, state) {
        return this.run(async () => {
            if (TERMINAL.has(s.state))
                return s;
            const terminal = TERMINAL.has(state), version = s.version + 1;
            if (s.persistent)
                await this.pool.query("UPDATE duel_series SET state=$1,version=$2,completed_at=$3 WHERE id=$4", [state, version, terminal ? new Date(this.now()) : null, s.id]);
            s.state = state;
            s.version = version;
            if (terminal)
                s.completedAt = this.now();
            return s;
        });
    }
    async recordRound(s, match, a, b) {
        return this.run(async () => {
            if (s.ending || TERMINAL.has(s.state))
                throw fail("Series has ended.");
            const old = s.results.find(r => r.roundNumber === s.currentRound);
            if (old)
                return old;
            const hostScore = match.player1Id === s.hostId ? a : b, guestScore = match.player1Id === s.hostId ? b : a;
            const hp = s.gameMode === "facesync" ? 0 : hostScore === guestScore ? 1 : hostScore > guestScore ? 2 : 0, gp = s.gameMode === "facesync" ? 0 : hostScore === guestScore ? 1 : guestScore > hostScore ? 2 : 0;
            const winnerId = hp === gp ? null : hp > gp ? s.hostId : s.guestId;
            const result = { matchId: match.id, roundNumber: s.currentRound, hostScore, guestScore };
            if (s.persistent)
                await this.transaction(async (c) => {
                    await c.query("SELECT id FROM duel_series WHERE id=$1 FOR UPDATE", [s.id]);
                    const inserted = await c.query("INSERT INTO duel_series_rounds(series_id,round_number,match_id,host_score,guest_score,winner_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING match_id", [s.id, s.currentRound, match.id, hostScore, guestScore, winnerId]);
                    if (inserted.rowCount !== 1)
                        throw fail("Round was already recorded.");
                    await c.query("UPDATE matches SET status='COMPLETED',player1_score=$1,player2_score=$2,winner_id=$3,completed_at=NOW() WHERE id=$4", [a, b, winnerId, match.id]);
                    await c.query("UPDATE duel_series SET host_points=host_points+$1,guest_points=guest_points+$2,version=version+1 WHERE id=$3", [hp, gp, s.id]);
                });
            s.results.push(result);
            s.hostPoints += hp;
            s.guestPoints += gp;
            s.version++;
            return result;
        });
    }
    async advance(s) {
        return this.run(async () => {
            if (s.ending || TERMINAL.has(s.state) || s.state !== "round_result" || s.currentRound >= s.totalRounds)
                throw fail("Series finished.");
            const round = s.currentRound + 1;
            if (s.persistent)
                await this.pool.query("UPDATE duel_series SET current_round=$1,state='ready',version=version+1 WHERE id=$2", [round, s.id]);
            s.currentRound = round;
            s.state = "ready";
            s.version++;
            return s;
        });
    }
    async sweep() {
        const now = this.now();
        for (const s of this.series.values()) {
            const activeInvites = [...this.invites.values()].filter(i => i.seriesId === s.id && !i.revoked);
            if (!TERMINAL.has(s.state) && (s.expiresAt <= now || (!s.guestId && !activeInvites.some(i => i.expiresAt > now))))
                await this.state(s, "expired");
            if (s.completedAt && now - s.completedAt > 7 * 86400000)
                this.series.delete(s.id);
        }
        for (const [digest, i] of this.invites)
            if (!this.series.has(i.seriesId) || i.expiresAt + 7 * 86400000 < now)
                this.invites.delete(digest);
        if (this.available())
            await this.pool.query("DELETE FROM duel_series WHERE id IN (SELECT id FROM duel_series WHERE completed_at<NOW()-INTERVAL '7 days' LIMIT 100)");
    }
}
module.exports = { DuelStore, TERMINAL, validToken, tokenDigest };
