// Real authenticated HTTP + Socket.IO protocol smoke test against a running dev server.
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const base = process.env.DUEL_TEST_URL || 'http://localhost:3001';
const origin = 'http://localhost:3000';
const sockets = [];
async function request(path, token, body) { const r = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: r.status, data: await r.json().catch(() => null) }; }
function wait(socket, event, predicate = () => true, ms = 22000) { return new Promise((resolve, reject) => { const timer = setTimeout(() => { socket.off(event, listener); reject(new Error(`Timed out: ${event}`)); }, ms); function listener(data) { if (!predicate(data))
    return; clearTimeout(timer); socket.off(event, listener); resolve(data); } socket.on(event, listener); }); }
async function connect(token) { const s = io(base, { transports: ['websocket'], auth: { token }, extraHeaders: { Origin: origin }, reconnection: false }); sockets.push(s); await wait(s, 'connect'); return s; }
async function main() {
    const [ha, ga, oa] = await Promise.all([request('/api/session', null, {}), request('/api/session', null, {}), request('/api/session', null, {})]);
    for (const session of [ha, ga, oa]) assert.ok(session.status >= 200 && session.status < 300 && typeof session.data?.socketToken === 'string', `Session bootstrap failed (${session.status}); use a fresh test server to avoid shared rate limits.`);
    const h = ha.data.socketToken, g = ga.data.socketToken, o = oa.data.socketToken;
    assert.equal((await request('/api/duels', null, { gameMode: 'emoji', totalRounds: 1 })).status, 401);
    const created = await request('/api/duels', h, { gameMode: 'emoji', totalRounds: 3 });
    assert.equal(created.status, 201);
    const id = created.data.series.id, invite = created.data.inviteToken;
    assert.equal((await request(`/api/duels/${id}`, o)).status, 404);
    assert.equal((await request('/api/duels/invite-preview', g, { token: invite })).data.totalRounds, 3);
    assert.equal((await request('/api/duels/join', h, { token: invite })).status, 409);
    const results = await Promise.all([request('/api/duels/join', g, { token: invite }), request('/api/duels/join', o, { token: invite })]);
    assert.equal(results.filter(r => r.status === 200).length, 1);
    const guestToken = results[0].status === 200 ? g : o;
    const a = await connect(h), b = await connect(guestToken);
    a.emit('private_join', { seriesId: id, protocolVersion: 2, peerId: 'host-test', name: 'Host' });
    const startedA = wait(a, 'match_started'), startedB = wait(b, 'match_started');
    b.emit('private_join', { seriesId: id, protocolVersion: 2, peerId: 'guest-test', name: 'Guest' });
    const [ma, mb] = await Promise.all([startedA, startedB]);
    assert.equal(ma.matchId, mb.matchId);
    assert.equal(ma.mediaNonce, mb.mediaNonce);
    let current = ma;
    for (const s of [a, b])
        s.on('round_state', data => { if (data.matchId === current.matchId)
            current = data; });
    const blocked = wait(a, 'operation_error');
    a.emit('join_queue', { peerId: 'bad-public', protocolVersion: 2, name: 'Host' });
    assert.match((await blocked).detail, /1v1/);
    a.emit('round_media_ready', { matchId: ma.matchId });
    b.emit('round_media_ready', { matchId: mb.matchId });
    a.emit('series_ready', { seriesId: id, readinessGeneration: 1 });
    await new Promise(r => setTimeout(r, 100));
    assert.equal(current.serverPhase, 'preparing');
    const target = wait(a, 'round_state', d => d.serverPhase === 'target');
    b.emit('series_ready', { seriesId: id, readinessGeneration: 1 });
    a.emit('face_sync_sample', { matchId: ma.matchId, unavailable: true });
    b.emit('face_sync_sample', { matchId: mb.matchId, unavailable: true });
    current = await target;
    const playing = wait(a, 'round_state', d => d.serverPhase === 'playing');
    a.emit('round_target_ready', { matchId: current.matchId, generation: current.generation });
    b.emit('round_target_ready', { matchId: current.matchId, generation: current.generation });
    current = await playing;
    const proposal = wait(a, 'emoji_skip_state');
    a.emit('emoji_skip_request', { matchId: current.matchId, generation: current.generation });
    const q = await proposal;
    assert.equal(q.agreedSocketIds.length, 0);
    a.emit('emoji_skip_respond', { matchId: q.matchId, generation: q.generation, proposalId: q.proposalId, agree: true });
    const restarted = wait(a, 'round_started');
    b.emit('emoji_skip_respond', { matchId: q.matchId, generation: q.generation, proposalId: q.proposalId, agree: true });
    const next = await restarted;
    assert.notEqual(next.matchId, ma.matchId);
    assert.notEqual(next.emoji, ma.emoji);
    assert.equal(next.mediaNonce, ma.mediaNonce);
    const suspended = wait(a, 'series_state', d => d.state === 'suspended');
    b.disconnect();
    assert.equal((await suspended).state, 'suspended');
    const resumedB = await connect(guestToken);
    const newPair = wait(a, 'match_started');
    resumedB.emit('private_join', { seriesId: id, protocolVersion: 2, peerId: 'reconnected', name: 'Guest' });
    assert.notEqual((await newPair).matchId, next.matchId);
    const cancelled = wait(a, 'series_state', d => d.state === 'cancelled');
    a.emit('series_leave');
    await cancelled;
    assert.equal((await request(`/api/duels/${id}`, h)).data.state, 'cancelled');
    console.log('Real HTTP/socket flow passed: authentication, atomic invite claim, private isolation, readiness, mutual skip, reconnect, leave.');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => sockets.forEach(s => s.disconnect()));
