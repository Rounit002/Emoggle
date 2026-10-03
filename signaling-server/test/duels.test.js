const test = require('node:test');
const assert = require('node:assert/strict');
const { DuelStore, tokenDigest } = require('../duelStore');
const { RoundEngine } = require('../roundEngine');
const { PrivateDuels } = require('../privateDuels');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function fixture(overrides = {}) {
    const messages = [], sockets = new Map(['a', 'b', 'outsider'].map(id => [id, {
            id, connected: true, user: { id }, join() { }, leave() { }, emit(event, data) { messages.push({ id, event, data }); },
            to() { return { emit(event, data) { messages.push({ id: id === 'a' ? 'b' : 'a', event, data }); } }; },
        }]));
    const engine = new RoundEngine({ io: { sockets: { sockets } }, activeMatches: new Map(), matchIdBySocket: new Map(),
        socketMeta: new Map(['a', 'b'].map(id => [id, { userId: id, peerId: id, elo: 1000, displayName: id }])),
        pickEmoji: () => '😀', pickEmojiExcept: () => '😮', pickCelebrity: async () => ({ id: 1, name: 'Pilot' }),
        createAttempt: async () => { }, cancelAttempt: async () => { }, skipEnabled: () => true,
        persistPublic: async () => ({ player1: { newElo: 1000, delta: 0 }, player2: { newElo: 1000, delta: 0 } }),
        canStartPrivate: () => true, persistPrivate: async () => { }, privateResult: async () => { }, abortPrivate: () => { },
        timings: { face: 30, reveal: 5, preview: 30, countdown: 30, scan: 5000, ready: 1000, vote: 1000 }, ...overrides });
    return { engine, messages, sockets };
}
const packet = p => ({ matchId: p.match.id, generation: p.match.generation });
async function playing(f, p) {
    f.engine.mediaReady('a', packet(p));
    f.engine.mediaReady('b', packet(p));
    f.engine.faceSample('a', { matchId: p.match.id, unavailable: true });
    f.engine.faceSample('b', { matchId: p.match.id, unavailable: true });
    await sleep(5);
    f.engine.targetReady('a', packet(p));
    f.engine.targetReady('b', packet(p));
    await sleep(40);
    assert.equal(p.match.phase, 'playing');
}
test('invitations: digest only, atomic two-seat claim, self/outsider/revoked/expired guards', async () => {
    let now = 100;
    const store = new DuelStore({ available: () => false, now: () => now });
    const { series, token } = await store.create('host', { gameMode: 'emoji', totalRounds: 3 });
    assert.match(token, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/);
    assert.ok(store.invites.has(tokenDigest(token)));
    assert.ok(!JSON.stringify([...store.invites]).includes(token));
    assert.throws(() => store.get(series.id, 'outsider'));
    await assert.rejects(store.join('host', token));
    const formatted = token.toLowerCase().match(/.{4}/g).join(' - ');
    assert.equal(store.preview(formatted).totalRounds, 3);
    assert.throws(() => store.preview('ABCD-EFGH-IJKL'));
    assert.throws(() => store.preview('A'.repeat(10000)));
    const attempts = await Promise.allSettled([store.join('guest', formatted), store.join('other', token)]);
    assert.equal(attempts.filter(a => a.status === 'fulfilled').length, 1);
    assert.equal((await store.join('guest', token)).id, series.id);
    assert.throws(() => store.preview(token));
    await assert.rejects(store.create('otherhost', { gameMode: 'unsupported', totalRounds: 3 }));
    const other = await store.create('newhost', { gameMode: 'celebrity', totalRounds: 5 });
    const next = await store.regenerate(other.series.id, 'newhost');
    assert.throws(() => store.preview(other.token));
    now += 15 * 60000;
    assert.throws(() => store.preview(next.token));
    await store.sweep();
    assert.equal(other.series.state, 'expired');
});
test('production fails closed without persistence; duplicate results do not add points', async () => {
    await assert.rejects(new DuelStore({ available: () => false, production: true }).create('h', { gameMode: 'emoji', totalRounds: 1 }));
    const store = new DuelStore({ available: () => false });
    const { series, token } = await store.create('h', { gameMode: 'emoji', totalRounds: 3 });
    await store.join('g', token);
    await store.recordRound(series, { id: 'm', player1Id: 'h' }, 70, 50);
    await store.recordRound(series, { id: 'm', player1Id: 'h' }, 70, 50);
    assert.equal(series.results.length, 1);
    assert.equal(series.hostPoints, 2);
    await store.state(series, 'round_result');
    await store.advance(series);
    await store.recordRound(series, { id: 'm2', player1Id: 'h' }, 40, 40);
    assert.equal(series.hostPoints, 3);
    assert.equal(series.guestPoints, 1);
    series.ending = true;
    await assert.rejects(store.recordRound(series, { id: 'late', player1Id: 'h' }, 90, 1));
});
test('pairing alone and one camera do not start; targets need both acknowledgements', async () => {
    const f = fixture();
    const p = await f.engine.startPair('a', 'b', 'emoji');
    try {
        assert.equal(p.match.phase, 'preparing');
        f.engine.mediaReady('a', packet(p));
        assert.equal(p.match.phase, 'preparing');
        f.engine.mediaReady('b', packet(p));
        assert.equal(p.match.phase, 'facesync');
        f.engine.faceSample('a', { matchId: p.match.id, unavailable: true });
        f.engine.faceSample('b', { matchId: p.match.id, unavailable: true });
        await sleep(5);
        assert.equal(p.match.phase, 'target');
        f.engine.targetReady('a', packet(p));
        assert.equal(p.match.phase, 'target');
        f.engine.targetReady('b', packet(p));
        assert.equal(p.match.phase, 'preview');
        await sleep(40);
        assert.equal(p.match.phase, 'playing');
    }
    finally {
        f.engine.close(p);
    }
});
test('skip requires two explicit votes, replaces attempt, ignores stale scores and preserves media', async () => {
    const f = fixture();
    const p = await f.engine.startPair('a', 'b', 'emoji');
    await playing(f, p);
    try {
        const old = packet(p), oldId = p.match.id, nonce = p.nonce;
        f.engine.requestSkip('a', old);
        assert.equal(p.match.phase, 'paused');
        assert.equal(p.match.proposal.votes.size, 0);
        const reply = { ...packet(p), proposalId: p.match.proposal.id, agree: true };
        f.engine.respondSkip('a', reply);
        f.engine.respondSkip('a', reply);
        assert.equal(p.match.proposal.votes.size, 1);
        f.engine.respondSkip('outsider', reply);
        assert.equal(p.match.proposal.votes.size, 1);
        f.engine.score('a', { ...old, score: 100 });
        assert.deepEqual(p.match.liveScores, {});
        f.engine.respondSkip('b', reply);
        await sleep(5);
        assert.notEqual(p.match.id, oldId);
        assert.equal(p.match.currentEmoji, '😮');
        assert.equal(p.nonce, nonce);
        assert.equal(p.media.size, 2);
        assert.equal(p.match.phase, 'target');
        f.engine.score('a', { ...old, score: 100 }, true);
        assert.deepEqual(p.match.scores, {});
    }
    finally {
        f.engine.close(p);
    }
});
test('decline and timeout preserve attempt, samples and remaining scan', async () => {
    for (const timeout of [false, true]) {
        const f = fixture();
        const p = await f.engine.startPair('a', 'b', 'emoji');
        await playing(f, p);
        try {
            f.engine.score('a', { ...packet(p), score: 7 });
            const id = p.match.id;
            const generation = p.match.generation;
            f.engine.requestSkip('a', packet(p));
            const remaining = p.match.remainingMs;
            if (timeout)
                await sleep(1100);
            else
                f.engine.respondSkip('b', { ...packet(p), proposalId: p.match.proposal.id, agree: false });
            assert.equal(p.match.id, id);
            assert.equal(p.match.phase, 'playing');
            assert.deepEqual(p.match.liveScores.a, [7]);
            assert.equal(p.match.durationMs, remaining);
            assert.ok(p.match.generation > generation);
        }
        finally {
            f.engine.close(p);
        }
    }
});
test('private readiness, fixed rounds, ties, explicit leave and cleanup', async () => {
    const store = new DuelStore({ available: () => false });
    const { series, token } = await store.create('a', { gameMode: 'celebrity', totalRounds: 3 });
    await store.join('b', token);
    let manager;
    const f = fixture({ canStartPrivate: id => manager.canStart(id), privateStarted: id => manager.started(id), persistPrivate: (m, a, b) => manager.persist(m, a, b), privateResult: id => manager.result(id) });
    manager = new PrivateDuels({ store, engine: f.engine, io: { sockets: { sockets: f.sockets } }, socketMeta: f.engine.o.socketMeta, enabled: () => true });
    const p = await f.engine.startPair('a', 'b', 'celebrity', series.id);
    manager.connections.set(series.id, { a: 'a', b: 'b' });
    try {
        f.engine.mediaReady('a', packet(p));
        f.engine.mediaReady('b', packet(p));
        assert.equal(p.match.phase, 'preparing');
        await manager.setReady(f.sockets.get('a'), { seriesId: series.id, readinessGeneration: series.readinessGeneration });
        assert.equal(p.match.phase, 'preparing');
        await manager.setReady(f.sockets.get('b'), { seriesId: series.id, readinessGeneration: series.readinessGeneration });
        await sleep(1);
        for (let i = 1; i <= 3; i++) {
            assert.equal(p.match.phase, 'target');
            f.engine.targetReady('a', packet(p));
            f.engine.targetReady('b', packet(p));
            await sleep(40);
            p.match.scanEndsAt = Date.now();
            f.engine.score('a', { ...packet(p), score: i === 2 ? 5 : 8 }, true);
            f.engine.score('b', { ...packet(p), score: 5 }, true);
            await sleep(5);
            assert.equal(series.results.length, i);
            if (i < 3) {
                assert.equal(series.state, 'round_result');
                await manager.setReady(f.sockets.get('a'), {seriesId:series.id, readinessGeneration:series.readinessGeneration-1});
                assert.ok(!manager.ready.get(series.id).has('a'), 'Replayed ready cannot approve the next intermission');
                await manager.setReady(f.sockets.get('a'), { seriesId: series.id, readinessGeneration: series.readinessGeneration });
                await manager.setReady(f.sockets.get('b'), { seriesId: series.id, readinessGeneration: series.readinessGeneration });
                await sleep(1);
            }
        }
        assert.equal(series.state, 'completed');
        assert.equal(series.hostPoints / 2, 2.5);
        assert.equal(series.guestPoints / 2, .5);
        await manager.leave(f.sockets.get('a'));
        assert.equal(f.engine.pairs.size, 0);
    }
    finally {
        clearInterval(manager.sweep);
        manager.clearDeadline(series.id);
        f.engine.close(p);
    }
});
test('private emoji skip restarts while series is already playing', async () => {
    const store = new DuelStore({ available: () => false });
    const { series, token } = await store.create('a', { gameMode: 'emoji', totalRounds: 1 });
    await store.join('b', token);
    let manager;
    const f = fixture({ canStartPrivate: id => manager.canStart(id), privateStarted: id => manager.started(id) });
    manager = new PrivateDuels({ store, engine: f.engine, io: { sockets: { sockets: f.sockets } }, socketMeta: f.engine.o.socketMeta });
    manager.connections.set(series.id, { a: 'a', b: 'b' });
    manager.ready.set(series.id, new Set(['a', 'b']));
    const p = await f.engine.startPair('a', 'b', 'emoji', series.id);
    try {
        await playing(f, p);
        await sleep(1);
        assert.equal(series.state, 'playing');
        f.engine.requestSkip('a', packet(p));
        const reply = { ...packet(p), proposalId: p.match.proposal.id, agree: true };
        f.engine.respondSkip('a', reply);
        f.engine.respondSkip('b', reply);
        await sleep(5);
        assert.equal(p.match.phase, 'target');
        assert.equal(series.currentRound, 1);
    }
    finally {
        clearInterval(manager.sweep);
        manager.clearDeadline(series.id);
        f.engine.close(p);
    }
});

test('proposal cooldown/cap and simultaneous requests never grant consent', async () => {
 const f=fixture();const p=await f.engine.startPair('a','b','emoji');await playing(f,p);
 try {
  for(let i=0;i<3;i++){
   p.lastProposal=0;f.engine.requestSkip('a',packet(p));const q=p.match.proposal;assert.ok(q);
   f.engine.requestSkip('b',packet(p));assert.equal(q.votes.size,0);
   f.engine.respondSkip('b',{...packet(p),proposalId:q.id,agree:false});
   f.engine.requestSkip('a',packet(p));assert.equal(p.match.proposal,null);
  }
  p.lastProposal=0;f.engine.requestSkip('a',packet(p));assert.equal(p.match.proposal,null);assert.equal(p.proposals,3);
 }finally{f.engine.close(p);}
});
test('disconnect during async attempt creation cannot publish a stale pairing', async () => {
 let release;const deferred=new Promise(r=>{release=r;});const f=fixture({createAttempt:()=>deferred});
 const running=f.engine.startPair('a','b','emoji');const p=f.engine.pair('a');f.engine.close(p);release();
 await assert.rejects(running);assert.equal(f.engine.pairs.size,0);assert.equal(f.engine.o.activeMatches.size,0);assert.ok(!f.messages.some(m=>m.event==='match_started'));
});
test('all 1/3/5 series count exactly once and do not finish early', async () => {
 for(const mode of ['emoji','celebrity'])for(const n of [1,3,5]){
  const store=new DuelStore({available:()=>false});const {series,token}=await store.create('h',{gameMode:mode,totalRounds:n});await store.join('g',token);
  for(let round=1;round<=n;round++){
   await store.recordRound(series,{id:`m${round}`,player1Id:'h'},8,5);assert.equal(series.results.length,round);
   if(round<n){await store.state(series,'round_result');await store.advance(series);assert.notEqual(series.state,'completed');}
  }
  await store.state(series,'completed');assert.equal(series.hostPoints/2,n);assert.equal(series.results.length,n);await assert.rejects(store.advance(series));
 }
});

test('private Face Sync repeats 1/3/5 comparisons with readiness and no competitive points', async () => {
 for (const totalRounds of [1,3,5]) {
  const store = new DuelStore({ available: () => false });
  const {series,token} = await store.create('a',{gameMode:'facesync',totalRounds});
  await store.join('b',token);
  let manager;
  const f=fixture({canStartPrivate:id=>manager.canStart(id),privateStarted:id=>manager.started(id),persistPrivate:(m,a,b)=>manager.persist(m,a,b),privateResult:id=>manager.result(id)});
  manager=new PrivateDuels({store,engine:f.engine,io:{sockets:{sockets:f.sockets}},socketMeta:f.engine.o.socketMeta});
  manager.connections.set(series.id,{a:'a',b:'b'});
  const p=await f.engine.startPair('a','b','facesync',series.id), nonce=p.nonce;
  try {
   f.engine.mediaReady('a',packet(p)); f.engine.mediaReady('b',packet(p));
   for(let round=1;round<=totalRounds;round++) {
    assert.equal(p.match.phase,round===1?'preparing':'result');
    f.engine.faceSample('a',{...packet(p),unavailable:true});
    assert.equal(p.match.faceSyncReports.size,0,'No comparison before both players are ready');
    await manager.setReady(f.sockets.get('a'),{seriesId:series.id,readinessGeneration:series.readinessGeneration});
    await manager.setReady(f.sockets.get('b'),{seriesId:series.id,readinessGeneration:series.readinessGeneration});
    assert.equal(p.match.phase,'facesync');
    const current=packet(p), vector=Array(20).fill(.5);
    f.engine.faceSample('a',{...current,generation:current.generation-1,vector});
    assert.equal(p.match.faceSyncReports.size,0,'Stale generation rejected');
    f.engine.faceSample('a',{...current,vector});
    f.engine.faceSample('b',{...current,...(round===2?{unavailable:true}:{vector})});
    await store.tail; await sleep(5);
    f.engine.faceSample('b',{...current,vector});
    assert.equal(series.results.length,round);
    assert.equal(series.hostPoints,0); assert.equal(series.guestPoints,0);
    assert.equal(p.nonce,nonce); assert.equal(p.match.phase,'result');
    assert.equal(series.state,round===totalRounds?'completed':'round_result');
    assert.equal(series.currentRound,round);
   }
   assert.equal(series.state,'completed');
   assert.ok(!f.messages.some(m=>m.event==='match_result'||m.event==='emoji_locked'));
  } finally {clearInterval(manager.sweep);manager.clearDeadline(series.id);f.engine.close(p);}
 }
});
