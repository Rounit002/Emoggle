const express = require("express");
const { TERMINAL } = require("./duelStore");
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
class PrivateDuels {
    constructor(o) {
        this.o = o;
        this.connections = new Map();
        this.ready = new Map();
        this.pairing = new Set();
        this.deadlines = new Map();
        this.quotas = new Map();
        this.reserved = new Set();
        this.sweep = setInterval(() => void this.cleanup(), 30000);
        this.sweep.unref();
    }
    member(id) { return this.o.store.member(id) || this.reserved.has(id); }
    allowed(id, kind, max) {
        const key = id + ":" + kind, now = Date.now(), times = (this.quotas.get(key) || []).filter(t => now - t < 60000);
        if (!this.quotas.has(key) && this.quotas.size >= 10000)
            throw fail("1v1 is busy. Try again later.", 503);
        if (times.length >= max)
            throw fail("Too many requests. Try again shortly.", 429);
        times.push(now);
        this.quotas.set(key, times);
    }
    snapshot(s, userId) {
        const host = s.hostId === userId, connections = this.connections.get(s.id) || {}, ready = this.ready.get(s.id) || new Set();
        const self = host ? s.hostId : s.guestId, other = host ? s.guestId : s.hostId;
        return { id: s.id, gameMode: s.gameMode, totalRounds: s.totalRounds, currentRound: s.currentRound, state: s.state, version: s.version, readinessGeneration: s.readinessGeneration, role: host ? "host" : "guest", myPoints: (host ? s.hostPoints : s.guestPoints) / 2, partnerPoints: (host ? s.guestPoints : s.hostPoints) / 2,
            myReady: ready.has(self), partnerReady: ready.has(other), partnerJoined: Boolean(s.guestId), partnerConnected: Boolean(connections[other]),
            partnerName: this.o.socketMeta.get(connections[other])?.displayName ?? null, expiresAt: s.expiresAt,
            results: s.results.map(r => ({ matchId: r.matchId, roundNumber: r.roundNumber, myScore: host ? r.hostScore : r.guestScore, partnerScore: host ? r.guestScore : r.hostScore })) };
    }
    emit(s) { const connections = this.connections.get(s.id) || {}; for (const [userId, sid] of Object.entries(connections))
        this.o.io.sockets.sockets.get(sid)?.emit("series_state", this.snapshot(s, userId)); }
    deadline(s, ms = 120000) { clearTimeout(this.deadlines.get(s.id)); this.deadlines.set(s.id, setTimeout(() => void this.end(s, "aborted"), ms)); }
    clearDeadline(id) { clearTimeout(this.deadlines.get(id)); this.deadlines.delete(id); }
    busy(userId) { const sid = this.o.activeSocket(userId); if (sid && (this.o.getMatch(sid) || this.o.engine.pair(sid) || this.o.pairingSockets.has(sid)))
        throw fail("Leave your current game first."); }
    async reserve(userId, fn) {
        if (this.reserved.has(userId))
            throw fail("Another request is in progress.");
        if (!this.o.store.member(userId))
            this.busy(userId);
        this.reserved.add(userId);
        const sid = this.o.activeSocket(userId);
        if (sid) {
            const socket = this.o.io.sockets.sockets.get(sid);
            if (socket)
                socket.data.queueRequestId = (socket.data.queueRequestId || 0) + 1;
            this.o.removeFromQueue(sid);
            this.o.clearTransfers(sid);
        }
        try {
            return await fn();
        }
        finally {
            this.reserved.delete(userId);
        }
    }
    router() {
        const router = express.Router(), o = this.o;
        router.use(o.origin, o.auth, (_req, res, next) => { res.setHeader("Cache-Control", "private, no-store"); next(); });
        const handle = fn => async (req, res) => { try {
            if (!o.enabled() && (["/", "/join", "/invite-preview"].includes(req.path) || req.path.endsWith("/invite")))
                throw fail("Private games are unavailable.", 503);
            await fn(req, res);
        }
        catch (e) {
            res.status(e.status || 503).json({ detail: e.status ? e.message : "Could not complete this 1v1 request." });
        } };
        router.post("/", handle(async (req, res) => { this.allowed(req.user.id, "create", 3); const r = await this.reserve(req.user.id, () => o.store.create(req.user.id, req.body)); res.status(201).json({ series: this.snapshot(r.series, req.user.id), inviteToken: r.token, inviteExpiresAt: r.inviteExpiresAt }); }));
        router.post("/invite-preview", handle(async (req, res) => { this.allowed(req.user.id, "invite", 20); res.json(o.store.preview(req.body?.token)); }));
        router.post("/join", handle(async (req, res) => {
            this.allowed(req.user.id, "invite", 20);
            const s = await this.reserve(req.user.id, () => o.store.join(req.user.id, req.body?.token));
            if (s.state === "ready" && !this.deadlines.has(s.id)) this.deadline(s);
            this.emit(s);
            res.json(this.snapshot(s, req.user.id));
        }));
        router.get("/:id", handle(async (req, res) => res.json(this.snapshot(o.store.get(req.params.id, req.user.id), req.user.id))));
        router.post("/:id/invite", handle(async (req, res) => { this.allowed(req.user.id, "regenerate", 3); const r = await o.store.regenerate(req.params.id, req.user.id); res.json({ series: this.snapshot(r.series, req.user.id), inviteToken: r.token, inviteExpiresAt: r.inviteExpiresAt }); }));
        router.post("/:id/cancel", handle(async (req, res) => { const s = o.store.get(req.params.id, req.user.id); if (s.hostId !== req.user.id)
            throw fail("Only the host can cancel setup.", 403); await this.end(s, "cancelled"); res.status(204).end(); }));
        return router;
    }
    async attach(socket, data) {
        if (data?.protocolVersion !== 2)
            throw fail("Update the page to join this game.", 400);
        const s = this.o.store.get(data.seriesId, socket.user.id);
        if (TERMINAL.has(s.state))
            throw fail("This 1v1 has ended.");
        if (this.o.getMatch(socket.id) && !this.o.engine.pair(socket.id)?.seriesId)
            throw fail("Leave your public match first.");
        if (s.suspending)
            await this.o.store.tail;
        if (!socket.connected || s.ending || TERMINAL.has(s.state))
            return;
        const c = this.connections.get(s.id) || {};
        c[socket.user.id] = socket.id;
        this.connections.set(s.id, c);
        if (s.state === "suspended") {
            await this.o.store.state(s, s.results.some(r => r.roundNumber === s.currentRound) ? "round_result" : "ready");
            this.ready.set(s.id, new Set());
            this.deadline(s);
        }
        this.emit(s);
        if (!s.guestId || !c[s.hostId] || !c[s.guestId] || this.pairing.has(s.id) || this.o.engine.pair(c[s.hostId]))
            return;
        this.pairing.add(s.id);
        try {
            await this.o.engine.startPair(c[s.hostId], c[s.guestId], s.gameMode, s.id);
            this.deadline(s);
            this.emit(s);
        }
        finally {
            this.pairing.delete(s.id);
        }
    }
    canStart(id) { const s = this.o.store.series.get(id), r = this.ready.get(id); return !s?.ending && ["ready", "playing"].includes(s?.state) && r?.has(s.hostId) && r.has(s.guestId); }
    started(id) { const s = this.o.store.series.get(id); if (s && !s.ending && s.state === "ready")
        void this.o.store.state(s, "playing").then(() => this.emit(s)).catch(() => this.end(s, "aborted")); }
    async setReady(socket, data) {
        const s = this.o.store.get(data?.seriesId, socket.user.id), c = this.connections.get(s.id);
        if (c?.[socket.user.id] !== socket.id || data?.readinessGeneration !== s.readinessGeneration || !["ready", "round_result"].includes(s.state))
            return;
        const r = this.ready.get(s.id) || new Set();
        if (r.has(socket.user.id))
            return;
        r.add(socket.user.id);
        this.ready.set(s.id, r);
        s.version++;
        this.emit(s);
        if (!r.has(s.hostId) || !r.has(s.guestId))
            return;
        this.clearDeadline(s.id);
        const p = this.o.engine.pair(socket.id);
        if (!p) {
            this.deadline(s);
            return;
        }
        if (s.state === "round_result") {
            await this.o.store.advance(s);
            if (p.closed || s.ending)
                return;
            await this.o.engine.next(p);
        }
        if (p.closed || s.ending)
            return;
        if (p.match?.phase === "preparing") { p.match.preparationDeadline = Date.now() + 80000; this.o.engine.preparationTimer(p, p.match); }
        this.o.engine.advance(p);
        this.emit(s);
    }
    async persist(m, a, b) { const s = this.o.store.series.get(m.seriesId); if (!s)
        throw fail("Series not found."); await this.o.store.recordRound(s, m, a, b); }
    async result(id) {
        const s = this.o.store.series.get(id);
        if (!s || s.ending || TERMINAL.has(s.state))
            return;
        s.readinessGeneration++;
        this.ready.set(id, new Set());
        if (s.currentRound === s.totalRounds) {
            await this.o.store.state(s, "completed");
            this.clearDeadline(id);
        }
        else {
            await this.o.store.state(s, "round_result");
            this.deadline(s);
        }
        this.emit(s);
    }
    async end(s, state) {
        if (!s || s.ending || TERMINAL.has(s.state))
            return;
        s.ending = true;
        const c = this.connections.get(s.id) || {};
        for (const sid of Object.values(c)) {
            const p = this.o.engine.pair(sid);
            if (p)
                this.o.engine.close(p);
        }
        // Claim cancellation before waiting for SQL; score persistence uses the store's serialized transaction order.
        try {
            await this.o.store.state(s, state);
        }
        catch {
            s.state = "aborted";
            s.version++;
            s.completedAt = Date.now();
        }
        this.clearDeadline(s.id);
        this.ready.delete(s.id);
        this.emit(s);
    }
    async leave(socket) { const p = this.o.engine.pair(socket.id), s = this.o.store.member(socket.user.id); if (p?.seriesId)
        this.o.engine.close(p); if (s)
        await this.end(s, "cancelled"); }
    async disconnect(socket) {
        const existing = this.o.engine.pair(socket.id);
        if (existing?.seriesId && !this.o.store.member(socket.user.id))
            this.o.engine.close(existing);
        const s = this.o.store.member(socket.user.id);
        if (!s)
            return;
        const c = this.connections.get(s.id);
        if (c?.[socket.user.id] !== socket.id)
            return;
        delete c[socket.user.id];
        const p = this.o.engine.pair(socket.id);
        if (p)
            this.o.engine.close(p);
        if (s.guestId) {
            s.suspending = true; s.readinessGeneration++;
            this.ready.set(s.id, new Set());
            try {
                await this.o.store.state(s, "suspended");
                this.deadline(s, 30000);
            }
            catch {
                await this.end(s, "aborted");
            }
            finally {
                s.suspending = false;
            }
        }
        this.emit(s);
    }
    async cleanup() {
        try {
            await this.o.store.sweep();
            for (const s of this.o.store.series.values())
                if (TERMINAL.has(s.state)) {
                    this.clearDeadline(s.id);
                    const c = this.connections.get(s.id) || {};
                    for (const sid of Object.values(c)) {
                        const p = this.o.engine.pair(sid);
                        if (p)
                            this.o.engine.close(p);
                    }
                    this.emit(s);
                    this.connections.delete(s.id);
                    this.ready.delete(s.id);
                }
            const now = Date.now();
            for (const [key, times] of this.quotas)
                if (!times.some(t => now - t < 60000))
                    this.quotas.delete(key);
        }
        catch { /* bounded retry on the next sweep; do not log tokens */ }
    }
}
module.exports = { PrivateDuels };
