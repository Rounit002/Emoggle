const crypto = require("node:crypto");
const { clampScore, submittedRoundScore, deadlineRoundScore, buildMatchResultPayloads } = require("./matchScore");
const { readFaceVector, computeFaceSync, variantSeedFromMatchId } = require("./faceSync");
class RoundEngine {
    constructor(o) { this.o = o; this.pairs = new Map(); this.bySocket = new Map(); this.t = { scan: 10000, preview: 1000, countdown: 3000, face: 7000, reveal: 3800, ready: 20000, vote: 8000, ...o.timings }; }
    pair(socketId) { return this.pairs.get(this.bySocket.get(socketId)); }
    match(socketId) { return this.pair(socketId)?.match; }
    emit(p, event, data) { for (const sid of p.sockets)
        this.o.io.sockets.sockets.get(sid)?.emit(event, data); }
    timer(p, m, fn, ms) { const id = setTimeout(() => { m.timers.delete(id); if (!p.closed && p.match === m)
        fn(); }, Math.max(0, ms)); m.timers.add(id); return id; }
    clearTimers(m) { for (const id of m?.timers || [])
        clearTimeout(id); m?.timers.clear(); }
    schedule(m) { const now = Date.now(), future = now + 60000; return { matchId: m.id, generation: m.generation, serverPhase: m.phase, serverTime: now, faceSyncEndsAt: m.faceSyncEndsAt ?? now, countdownEndsAt: m.countdownEndsAt ?? future, scanStartsAt: m.scanStartedAt ?? future, scanEndsAt: m.scanEndsAt ?? future, duration: m.durationMs / 1000, remainingMs: m.remainingMs ?? null, protocolVersion: 2, skipEnabled: this.o.skipEnabled() && (this.pairs.get(m.pairId)?.proposals ?? 0) < 3, countdownSec: (m.gameMode === "emoji" ? this.t.preview : this.t.countdown) / 1000 }; }
    state(p, phase) { const m = p.match; m.phase = phase; m.generation++; this.emit(p, "round_state", this.schedule(m)); }
    async startPair(a, b, mode, seriesId = null) {
        if (this.pair(a) || this.pair(b))
            throw new Error("Already paired");
        const ma = this.o.socketMeta.get(a), mb = this.o.socketMeta.get(b);
        if (!ma || !mb)
            throw new Error("Players not ready");
        const p = { id: crypto.randomUUID(), sockets: [a, b], users: [ma.userId, mb.userId], mode, seriesId, closed: false, media: new Set(), faceDone: mode === "celebrity", nonce: crypto.randomBytes(32).toString("hex"), proposals: 0, lastProposal: 0 };
        this.pairs.set(p.id, p);
        for (const sid of p.sockets)
            this.bySocket.set(sid, p.id);
        try {
            await this.createRound(p, true);
            return p;
        }
        catch (e) {
            this.close(p);
            throw e;
        }
    }
    async createRound(p, initial = false, emoji = null) {
        const previous = p.match;
        this.clearTimers(previous);
        if (previous) {
            this.o.activeMatches.delete(previous.id);
            if (!previous.resultSent)
                await this.o.cancelAttempt(previous.id);
        }
        const id = crypto.randomUUID(), celebrity = p.mode === "celebrity" ? await this.o.pickCelebrity() : null;
        const meta = p.sockets.map(s => this.o.socketMeta.get(s));
        if (p.closed || meta.some(m => !m) || p.sockets.some(s => !this.o.io.sockets.sockets.get(s)?.connected))
            throw new Error("Partner left.");
        const m = { id, modern: true, pairId: p.id, seriesId: p.seriesId, roomId: "pair_" + p.id, player1SocketId: p.sockets[0], player2SocketId: p.sockets[1], player1Id: p.users[0], player2Id: p.users[1], player1Elo: meta[0].elo, player2Elo: meta[1].elo, gameMode: p.mode, currentEmoji: emoji || this.o.pickEmoji(), celebrity, celebrityId: celebrity?.id ?? null, celebrityName: celebrity?.name ?? null, preparationDeadline: Date.now() + 80000, timers: new Set(), generation: 0, phase: "preparing", scores: {}, liveScores: {}, resultSent: false, faceSyncReports: new Map(), faceSyncResolved: p.faceDone, targets: new Set(), durationMs: this.t.scan };
        await this.o.createAttempt(m);
        if (p.closed || p.sockets.some(s => !this.o.io.sockets.sockets.get(s)?.connected) || (this.o.pairAllowed && !this.o.pairAllowed(p))) {
            await this.o.cancelAttempt(id);
            throw new Error("Partner left.");
        }
        p.match = m;
        this.o.activeMatches.set(id, m);
        for (const sid of p.sockets) {
            this.o.matchIdBySocket.set(sid, id);
            this.o.io.sockets.sockets.get(sid)?.join(m.roomId);
        }
        const common = { ...this.schedule(m), emoji: m.currentEmoji, celebrity, seriesId: p.seriesId, pairId: p.id, mediaNonce: p.nonce, skipFaceSync: p.faceDone };
        if (initial) {
            p.sockets.forEach((sid, i) => this.o.io.sockets.sockets.get(sid)?.emit("match_started", { ...common, partnerPeerId: meta[1 - i].peerId, partnerName: meta[1 - i].displayName, partnerCountry: meta[1 - i].country, partnerCountryCode: meta[1 - i].countryCode, role: i === 0 ? "receiver" : "caller" }));
        }
        else
            this.emit(p, "round_started", { ...common, previousMatchId: previous?.id });
        this.preparationTimer(p, m);
        this.advance(p);
    }
    preparationTimer(p, m) {
        if (m.prepareTimer) { clearTimeout(m.prepareTimer); m.timers.delete(m.prepareTimer); }
        m.prepareTimer = this.timer(p, m, () => {
            if (p.seriesId && m.phase === "preparing" && !this.o.canStartPrivate(p.seriesId)) return; // The lobby owns its 120-second readiness deadline.
            if (m.phase === "preparing" || m.phase === "target") this.emit(p, "round_error", { matchId: m.id, detail: "Still waiting for both cameras. Retry or leave." });
            this.timer(p, m, () => this.abort(p, "Connection timed out. Please start a new game."), Math.max(0, m.preparationDeadline - Date.now()));
        }, Math.min(this.t.ready, Math.max(0, m.preparationDeadline - Date.now())));
    }
    mediaReady(sid, data) { const p = this.pair(sid), m = p?.match; if (!m || data?.matchId !== m.id)
        return; p.media.add(sid); this.advance(p); }
    advance(p) {
        const m = p.match;
        if (!m || m.phase !== "preparing" || p.media.size !== 2)
            return;
        if (p.seriesId && !this.o.canStartPrivate(p.seriesId))
            return;
        this.clearTimers(m);
        if (p.seriesId)
            this.o.privateStarted?.(p.seriesId);
        if (!p.faceDone) {
            m.faceSyncEndsAt = Date.now() + this.t.face;
            this.state(p, "facesync");
            this.timer(p, m, () => this.resolveFace(p), this.t.face);
            if (m.faceSyncReports.size === 2)
                this.resolveFace(p);
        }
        else
            this.target(p);
    }
    faceSample(sid, data) {
        const p = this.pair(sid), m = p?.match;
        if (!m || data?.matchId !== m.id || m.faceSyncResolved || m.faceSyncReports.has(sid))
            return;
        if (p.mode === "facesync" && (m.phase !== "facesync" || !this.valid(m, data))) return;
        m.faceSyncReports.set(sid, data.unavailable === true ? null : readFaceVector(data.vector));
        if (m.phase === "facesync" && m.faceSyncReports.size === 2)
            this.resolveFace(p);
    }
    resolveFace(p) {
        const m = p.match;
        if (m.faceSyncResolved || m.phase !== "facesync")
            return;
        this.clearTimers(m);
        m.faceSyncResolved = true;
        p.faceDone = true;
        const a = m.faceSyncReports.get(p.sockets[0]), b = m.faceSyncReports.get(p.sockets[1]);
        const result = a && b ? computeFaceSync(a, b, variantSeedFromMatchId(m.id)) : null;
        m.faceSyncReports.clear();
        m.faceSyncEndsAt = Date.now() + (result ? this.t.reveal : 0);
        this.emit(p, result ? "face_sync_result" : "face_sync_skipped", { ...result, ...this.schedule(m) });
        if (p.mode === "facesync") {
            void this.finishFaceSync(p, m, result).catch(() => this.abort(p, "Could not save this comparison."));
            return;
        }
        this.timer(p, m, () => this.target(p), result ? this.t.reveal : 0);
    }
    async finishFaceSync(p, m, result) {
        if (!p.seriesId || m.resultSent || p.closed || p.match !== m) return;
        m.resultSent = true;
        m.phase = "ending";
        const score = result ? result.score / 10 : 0;
        await this.o.persistPrivate(m, score, score);
        if (p.closed || p.match !== m) return;
        this.state(p, "result");
        await this.o.privateResult(p.seriesId);
    }
    target(p) {
        const m = p.match;
        this.clearTimers(m);
        m.faceSyncEndsAt = Date.now();
        m.targets.clear();
        this.state(p, "target");
        this.preparationTimer(p, m);
        if (p.faceDone)
            this.emit(p, "face_sync_skipped", this.schedule(m));
    }
    targetReady(sid, data) {
        const p = this.pair(sid), m = p?.match;
        if (!m || m.phase !== "target" || !this.valid(m, data))
            return;
        m.targets.add(sid);
        if (m.targets.size === 2)
            this.preview(p);
    }
    preview(p, remaining = null) {
        const m = p.match;
        this.clearTimers(m);
        m.durationMs = this.t.scan;
        m.remainingMs = null;
        const wait = remaining ?? (p.mode === "emoji" ? this.t.preview : this.t.countdown);
        m.countdownEndsAt = Date.now() + wait;
        m.scanStartedAt = m.countdownEndsAt;
        m.scanEndsAt = m.scanStartedAt + this.t.scan;
        this.state(p, "preview");
        this.timer(p, m, () => this.play(p, this.t.scan), wait);
    }
    play(p, duration) {
        const m = p.match;
        this.clearTimers(m);
        m.durationMs = duration;
        m.remainingMs = null;
        m.scanStartedAt = Date.now();
        m.scanEndsAt = m.scanStartedAt + duration;
        m.emojiLocked = true;
        this.state(p, "playing");
        this.emit(p, "emoji_locked", this.schedule(m));
        this.timer(p, m, () => void this.finalize(p, true).catch(() => this.abort(p, "Could not save this round.")), duration + 4000);
    }
    valid(m, data) { return data && data.matchId === m.id && data.generation === m.generation; }
    score(sid, data, final = false) {
        const p = this.pair(sid), m = p?.match, now = Date.now();
        if (!m || !this.valid(m, data) || m.phase !== "playing" || m.resultSent || !Number.isFinite(data.score) || now < m.scanStartedAt || now > m.scanEndsAt + 4000)
            return;
        const score = clampScore(data.score);
        if (!final) {
            const samples = m.liveScores[sid] ??= [];
            if (samples.length < 150)
                samples.push(score);
            this.o.io.sockets.sockets.get(sid)?.to(m.roomId).emit("partner_live_score", { score, ...this.schedule(m) });
            return;
        }
        if (now < m.scanEndsAt - 2000 || Object.hasOwn(m.scores, sid))
            return;
        const value = p.mode === "celebrity" ? Number(score.toFixed(1)) : submittedRoundScore(m.liveScores[sid] || [], score);
        if (value === null) {
            this.o.io.sockets.sockets.get(sid)?.emit("score_rejected", { reason: "insufficient_samples" });
            return;
        }
        m.scores[sid] = value;
        this.o.io.sockets.sockets.get(sid)?.to(m.roomId).emit("partner_score", { score: value, ...this.schedule(m) });
        void this.finalize(p, false).catch(() => this.abort(p, "Could not save this round."));
    }
    async finalize(p, fill) {
        const m = p.match;
        if (!m || m.resultSent || m.phase !== "playing")
            return;
        if (fill)
            for (const sid of p.sockets)
                if (!Object.hasOwn(m.scores, sid))
                    m.scores[sid] = deadlineRoundScore(m.liveScores[sid] || []);
        const [a, b] = p.sockets.map(s => m.scores[s]);
        if (!Number.isFinite(a) || !Number.isFinite(b))
            return;
        m.resultSent = true;
        m.phase = "ending";
        this.clearTimers(m);
        const winnerId = a === b ? null : a > b ? p.users[0] : p.users[1];
        let elo;
        if (p.seriesId) {
            await this.o.persistPrivate(m, a, b);
            const result = id => ({ oldElo: this.o.socketMeta.get(id)?.elo ?? 1000, newElo: this.o.socketMeta.get(id)?.elo ?? 1000, delta: 0, tier: "Unranked" });
            elo = { player1: result(p.sockets[0]), player2: result(p.sockets[1]) };
        }
        else
            elo = await this.o.persistPublic(m.id, m, a, b, winnerId);
        if (p.closed || p.match !== m)
            return;
        const payload = buildMatchResultPayloads({ matchId: m.id, match: m, player1Score: a, player2Score: b, elo });
        p.sockets.forEach((sid, i) => this.o.io.sockets.sockets.get(sid)?.emit("match_result", { ...(i === 0 ? payload.player1 : payload.player2), celebrity: m.celebrity ? { id: m.celebrityId, name: m.celebrityName } : null, seriesId: p.seriesId, generation: m.generation }));
        this.state(p, "result");
        if (p.seriesId)
            await this.o.privateResult(p.seriesId);
        else
            this.close(p);
    }
    requestSkip(sid, data) {
        const p = this.pair(sid), m = p?.match, now = Date.now();
        if (!m || p.mode !== "emoji" || !this.o.skipEnabled() || !this.valid(m, data))
            return;
        if (m.proposal)
            return;
        if (!["preview", "playing"].includes(m.phase) || m.resultSent || Object.keys(m.scores).length || p.proposals >= 3 || now - p.lastProposal < 5000 || (m.phase === "playing" && now >= m.scanEndsAt))
            return;
        const prior = m.phase, remaining = prior === "preview" ? m.countdownEndsAt - now : m.scanEndsAt - now;
        if (remaining <= 0)
            return;
        this.clearTimers(m);
        p.proposals++;
        m.remainingMs = remaining;
        m.proposal = { id: crypto.randomUUID(), votes: new Set(), expiresAt: now + this.t.vote, prior };
        this.state(p, "paused");
        this.voteState(p);
        this.timer(p, m, () => this.resume(p), this.t.vote);
    }
    voteState(p) { const m = p.match, q = m.proposal; this.emit(p, "emoji_skip_state", { matchId: m.id, generation: m.generation, proposalId: q.id, expiresAt: q.expiresAt, serverTime: Date.now(), agreedSocketIds: [...q.votes] }); }
    respondSkip(sid, data) {
        const p = this.pair(sid), m = p?.match, q = m?.proposal;
        if (!q || !this.valid(m, data) || data.proposalId !== q.id || typeof data.agree !== "boolean" || Date.now() >= q.expiresAt)
            return;
        if (!data.agree) {
            this.resume(p);
            return;
        }
        q.votes.add(sid);
        this.voteState(p);
        if (q.votes.size === 2) {
            m.proposal = null;
            p.lastProposal = Date.now();
            m.phase = "restarting";
            this.clearTimers(m);
            this.emit(p, "emoji_skip_state", { matchId: m.id, proposalId: q.id, status: "accepted" });
            const emoji = this.o.pickEmojiExcept(m.currentEmoji);
            void this.createRound(p, false, emoji).catch(() => this.abort(p, "Could not restart. Please retry."));
        }
    }
    resume(p) {
        const m = p.match, q = m.proposal;
        if (!q)
            return;
        m.proposal = null;
        p.lastProposal = Date.now();
        this.emit(p, "emoji_skip_state", { matchId: m.id, proposalId: q.id, status: "declined" });
        const remaining = m.remainingMs;
        if (q.prior === "preview")
            this.preview(p, remaining);
        else
            this.play(p, remaining);
    }
    retry(sid, data) { const p = this.pair(sid), m = p?.match; if (!m || data?.matchId !== m.id)
        return; if (m.phase === "preparing") {
        this.clearTimers(m);
        this.preparationTimer(p, m);
        this.advance(p);
    }
    else if (m.phase === "target")
        this.target(p); }
    async next(p) { p.proposals = 0; p.lastProposal = 0; if (p.mode === "facesync") p.faceDone = false; await this.createRound(p, false); }
    abort(p, detail) { this.emit(p, "round_error", { matchId: p.match?.id, detail }); if (p.seriesId)
        void this.o.abortPrivate(p.seriesId); this.close(p); }
    close(p) {
        if (!p || p.closed)
            return;
        p.closed = true;
        const m = p.match;
        this.clearTimers(m);
        m?.faceSyncReports.clear();
        if (m) {
            this.o.activeMatches.delete(m.id);
            if (!m.resultSent)
                void this.o.cancelAttempt(m.id);
        }
        for (const sid of p.sockets) {
            if (this.o.matchIdBySocket.get(sid) === m?.id)
                this.o.matchIdBySocket.delete(sid);
            this.o.io.sockets.sockets.get(sid)?.leave("pair_" + p.id);
            if (this.bySocket.get(sid) === p.id)
                this.bySocket.delete(sid);
        }
        this.pairs.delete(p.id);
    }
}
module.exports = { RoundEngine };
