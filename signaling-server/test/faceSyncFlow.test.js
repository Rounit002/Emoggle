/**
 * End-to-end test for FaceSync multiplayer synchronization.
 *
 * Spins up the real signaling server on an ephemeral port and
 * drives it with two real socket.io clients, the same way
 * `celebrity.test.js` exercises the round lifecycle. No camera and
 * no PeerJS are involved — FaceSync only ever puts geometry
 * vectors on the wire, so the socket path is the whole feature.
 *
 * The property under test, above all others: both players must
 * receive byte-identical results. A feature that tells one person
 * 84% and the other 76% is worse than not shipping it.
 *
 * Run with:
 *   node test/faceSyncFlow.test.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { io: ioClient } = require("socket.io-client");
const { spawn } = require("child_process");
const { randomUUID } = require("crypto");

const SERVER_PORT = Number.parseInt(process.env.FACESYNC_SMOKE_PORT || "3098", 10);
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

/** A plausible neutral geometry vector, matching the extractor. */
const VECTOR_A = [
  1.600, 1.856, 1.111, 1.378, 1.378, 0.356, 0.332, 0.010, 0.378, 0.534,
  0.415, 0.578, 0.179, 0.338, 0.311, 0.317, 0.066, 0.660, 0.514, 0.523,
];
/** Noticeably different bone structure. */
const VECTOR_B = [
  1.740, 1.700, 1.290, 1.500, 1.270, 0.320, 0.360, 0.040, 0.430, 0.470,
  0.360, 0.640, 0.150, 0.300, 0.350, 0.280, 0.090, 0.610, 0.470, 0.590,
];
/** A near-twin of A. */
const VECTOR_A2 = VECTOR_A.map((v, i) => v * (i % 3 === 0 ? 1.008 : 0.995));

let passed = 0;
let failed = 0;
function check(name, ok, extra = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}${extra ? `  (${extra})` : ""}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${extra ? `  (${extra})` : ""}`);
  }
}

async function waitForServer(url, attempts = 50) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function createAnonymousSession(baseUrl) {
  const res = await fetch(`${baseUrl}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`Session creation failed: ${res.status}`);
  return res.json();
}

function connectClient(token) {
  return ioClient(SERVER_URL, { transports: ["websocket"], auth: { token }, reconnection: false });
}

function waitFor(socket, event, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const handler = (payload) => {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve({ ...payload, receivedAt: Date.now() });
    };
    socket.on(event, handler);
  });
}

/** Resolves to null instead of throwing when the event never comes. */
function waitForMaybe(socket, event, timeoutMs) {
  return waitFor(socket, event, timeoutMs).catch(() => null);
}

/** Collects every occurrence of an event until told to stop. */
function collect(socket, event) {
  const seen = [];
  const handler = (payload) => seen.push({ ...payload, receivedAt: Date.now() });
  socket.on(event, handler);
  return { seen, stop: () => socket.off(event, handler) };
}

/*
 * Identity pool.
 *
 * Two real limits shape this, and the test works within both
 * rather than around them, because they are deliberate anti-abuse
 * measures: /api/session allows 20 per 15 minutes per IP, and
 * `join_queue` allows 6 per minute per socket. So a modest pool of
 * identities is minted once and handed out round-robin, which
 * keeps every identity well under the queue budget while the whole
 * run stays well under the session budget.
 */
const tokens = [];
let cursor = 0;

async function mintTokens(count) {
  for (let i = 0; i < count; i += 1) {
    const session = await createAnonymousSession(SERVER_URL);
    tokens.push(session.socketToken);
  }
}

/*
 * Handshake pacing. The server also caps socket connection
 * attempts at 30 per minute per IP — a third deliberate guard this
 * harness works within rather than around. Enough scenarios and a
 * long enough run will otherwise trip it mid-suite and look like a
 * product failure.
 */
const HANDSHAKE_LIMIT = 24;
const HANDSHAKE_WINDOW_MS = 60_000;
const handshakes = [];

async function pauseForHandshakeBudget() {
  for (;;) {
    const now = Date.now();
    while (handshakes.length > 0 && now - handshakes[0] > HANDSHAKE_WINDOW_MS) {
      handshakes.shift();
    }
    if (handshakes.length < HANDSHAKE_LIMIT) break;
    const waitMs = HANDSHAKE_WINDOW_MS - (now - handshakes[0]) + 250;
    console.log(`  … pausing ${Math.ceil(waitMs / 1000)}s for the handshake budget`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  handshakes.push(Date.now());
}

/** Connect the next identity in rotation and wait for the handshake. */
async function connectPooled(index = cursor++) {
  await pauseForHandshakeBudget();
  const socket = connectClient(tokens[index % tokens.length]);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("connect timed out")), 10_000);
    socket.on("connect", () => { clearTimeout(timer); resolve(); });
    socket.on("connect_error", (e) => { clearTimeout(timer); reject(e); });
  });
  return socket;
}

/** Pair two clients and return them mid-FaceSync-lead-in. */
async function pair(gameMode) {
  const sockA = await connectPooled();
  const sockB = await connectPooled();

  const matchA = waitFor(sockA, "match_started");
  const matchB = waitFor(sockB, "match_started");
  const waitingA = waitFor(sockA, "waiting");
  const join = (socket) =>
    socket.emit("join_queue", {
      peerId: `peer-${randomUUID()}`,
      ...(gameMode ? { gameMode } : {}),
    });
  join(sockA);
  await waitingA;
  join(sockB);

  const [startedA, startedB] = await Promise.all([matchA, matchB]);
  return { sockA, sockB, startedA, startedB };
}

function close(...sockets) {
  for (const socket of sockets) {
    try { socket.close(); } catch { /* already gone */ }
  }
}

async function run() {
  const server = spawn(process.execPath, ["index.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      DATABASE_URL: "",
      ENABLE_RANKED_ELO: "false",
      TRUST_GEO_HEADERS: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverStderr = "";
  server.stderr.on("data", (chunk) => { serverStderr += chunk.toString(); });
  // Kept for diagnosis on failure; not echoed, to keep output readable.
  let serverStdout = "";
  server.stdout.on("data", (chunk) => { serverStdout += chunk.toString(); });

  const finish = (code) => {
    try { server.kill("SIGTERM"); } catch { /* already down */ }
    if (code !== 0) {
      console.error("\n--- server stderr ---\n" + serverStderr);
      console.error("\n--- server stdout ---\n" + serverStdout.split("\n").slice(-40).join("\n"));
    }
    process.exit(code);
  };

  try {
    if (!(await waitForServer(SERVER_URL))) {
      console.error("server never came up");
      return finish(1);
    }
    await mintTokens(18);
    console.log(`[facesync] server ready on ${SERVER_URL}\n`);

    /* ── 1. Both players report geometry ── */
    console.log("both players report geometry");
    {
      const { sockA, sockB, startedA, startedB } = await pair();

      check("match_started carries the FaceSync lead-in deadline",
        typeof startedA.faceSyncEndsAt === "number" &&
        startedA.faceSyncEndsAt === startedB.faceSyncEndsAt,
        `${startedA.faceSyncEndsAt} / ${startedB.faceSyncEndsAt}`);

      const resultA = waitFor(sockA, "face_sync_result");
      const resultB = waitFor(sockB, "face_sync_result");
      const sentAt = Date.now();
      sockA.emit("face_sync_sample", { vector: VECTOR_A });
      sockB.emit("face_sync_sample", { vector: VECTOR_B });

      const [a, b] = await Promise.all([resultA, resultB]);

      check("both players receive the same score", a.score === b.score, `${a.score} / ${b.score}`);
      check("both players receive the same band", a.category === b.category, `${a.category}`);
      check("both players receive the same copy variant", a.variant === b.variant, `${a.variant}`);
      check("the result is tagged with the right match",
        a.matchId === startedA.matchId && b.matchId === startedA.matchId);
      check("the score is an integer in 0-100",
        Number.isInteger(a.score) && a.score >= 0 && a.score <= 100, `${a.score}`);
      check("the result lands promptly once both have reported",
        a.receivedAt - sentAt < 1_000, `${a.receivedAt - sentAt}ms`);

      // The reveal has to finish before the round starts, or the
      // number is on screen during the countdown.
      const tick = await waitFor(sockA, "countdown_tick");
      check("the countdown waits for the reveal",
        tick.receivedAt - a.receivedAt > 2_500,
        `${tick.receivedAt - a.receivedAt}ms after the result`);
      check("the countdown still gets its full length",
        tick.scanStartsAt - tick.receivedAt > 2_000,
        `${tick.scanStartsAt - tick.receivedAt}ms`);

      close(sockA, sockB);
    }

    /* ── 2. Argument order must not matter ── */
    console.log("\nreport order does not change the result");
    {
      const forward = await pair();
      const fa = waitFor(forward.sockA, "face_sync_result");
      forward.sockA.emit("face_sync_sample", { vector: VECTOR_A });
      forward.sockB.emit("face_sync_sample", { vector: VECTOR_B });
      const forwardResult = await fa;
      close(forward.sockA, forward.sockB);

      const reverse = await pair();
      const ra = waitFor(reverse.sockA, "face_sync_result");
      // Same two faces, opposite seats and opposite arrival order.
      reverse.sockB.emit("face_sync_sample", { vector: VECTOR_A });
      await new Promise((r) => setTimeout(r, 120));
      reverse.sockA.emit("face_sync_sample", { vector: VECTOR_B });
      const reverseResult = await ra;
      close(reverse.sockA, reverse.sockB);

      check("the same pair of faces scores the same either way round",
        forwardResult.score === reverseResult.score,
        `${forwardResult.score} / ${reverseResult.score}`);
    }

    /* ── 3. Similar faces really do score higher ── */
    console.log("\ngeometry drives the number");
    {
      const { sockA, sockB } = await pair();
      const r = waitFor(sockA, "face_sync_result");
      sockA.emit("face_sync_sample", { vector: VECTOR_A });
      sockB.emit("face_sync_sample", { vector: VECTOR_A2 });
      const similar = await r;
      close(sockA, sockB);

      check("near-identical geometry lands in a top band",
        similar.score >= 85,
        `${similar.score} (${similar.category})`);
    }

    /* ── 4. One player cannot do it ── */
    console.log("\none player has no face to offer");
    {
      const { sockA, sockB } = await pair();
      const skipA = waitFor(sockA, "face_sync_skipped");
      const skipB = waitFor(sockB, "face_sync_skipped");
      const resultA = waitForMaybe(sockA, "face_sync_result", 1_500);
      // Subscribed before the samples go out, because the first
      // countdown tick is emitted in the same turn as the skip.
      const ticks = collect(sockA, "countdown_tick");
      const sentAt = Date.now();
      sockA.emit("face_sync_sample", { vector: VECTOR_A });
      sockB.emit("face_sync_sample", { unavailable: true });

      const [sa, sb] = await Promise.all([skipA, skipB]);
      check("both players are told it was skipped", Boolean(sa && sb));
      check("the skip is tagged with the right match", sa.matchId === sb.matchId);
      check("nobody receives a score", (await resultA) === null);
      check("the bypass is immediate, not a timeout",
        sa.receivedAt - sentAt < 1_000, `${sa.receivedAt - sentAt}ms`);

      ticks.stop();
      const firstTick = ticks.seen[0];
      check("the round starts straight away after a bypass",
        Boolean(firstTick) && firstTick.receivedAt - sa.receivedAt < 800,
        firstTick ? `${firstTick.receivedAt - sa.receivedAt}ms after the skip` : "no tick seen");

      close(sockA, sockB);
    }

    /* ── 5. Nobody reports at all ── */
    console.log("\nneither player reports");
    {
      const { sockA, sockB } = await pair();
      const startedAt = Date.now();
      const skip = await waitFor(sockA, "face_sync_skipped", 12_000);
      check("the collection window times out and bypasses",
        skip.receivedAt - startedAt > 5_000 && skip.receivedAt - startedAt < 9_500,
        `${skip.receivedAt - startedAt}ms`);
      const tick = await waitFor(sockA, "countdown_tick");
      check("the round still starts", typeof tick.count === "number");
      close(sockA, sockB);
    }

    /* ── 6. Hostile and malformed input ── */
    console.log("\nmalformed and hostile payloads");
    {
      const { sockA, sockB } = await pair();
      const errors = collect(sockA, "server_error");
      const skip = waitFor(sockA, "face_sync_skipped");

      // None of these may produce a result, crash the server, or
      // strand the other player.
      sockA.emit("face_sync_sample", { vector: "not an array" });
      sockB.emit("face_sync_sample", { vector: VECTOR_B });

      const sk = await skip;
      errors.stop();
      check("a malformed vector bypasses instead of scoring", Boolean(sk));
      check("a malformed vector is not a connection-level error",
        errors.seen.length === 0, `${errors.seen.length} server_error(s)`);
      close(sockA, sockB);
    }

    {
      const { sockA, sockB } = await pair();
      const skip = waitFor(sockA, "face_sync_skipped");
      // Out-of-range components must be refused by the validator.
      sockA.emit("face_sync_sample", { vector: VECTOR_A.map(() => 1e9) });
      sockB.emit("face_sync_sample", { vector: VECTOR_B });
      check("an out-of-range vector bypasses", Boolean(await skip));
      close(sockA, sockB);
    }

    {
      const { sockA, sockB } = await pair();
      const skip = waitFor(sockA, "face_sync_skipped");
      const wrongLength = VECTOR_A.slice(0, 12);
      sockA.emit("face_sync_sample", { vector: wrongLength });
      sockB.emit("face_sync_sample", { vector: VECTOR_B });
      check("a wrong-length vector bypasses", Boolean(await skip));
      close(sockA, sockB);
    }

    {
      const { sockA, sockB } = await pair();
      const skip = waitFor(sockA, "face_sync_skipped");
      const withNaN = [...VECTOR_A];
      withNaN[5] = null;
      sockA.emit("face_sync_sample", { vector: withNaN });
      sockB.emit("face_sync_sample", { vector: VECTOR_B });
      check("a vector with a null component bypasses", Boolean(await skip));
      close(sockA, sockB);
    }

    /* ── 7. A second report must not move the number ── */
    console.log("\nthe score cannot be walked");
    {
      const { sockA, sockB } = await pair();
      const first = waitFor(sockA, "face_sync_result");
      sockA.emit("face_sync_sample", { vector: VECTOR_B });
      sockB.emit("face_sync_sample", { vector: VECTOR_A });
      const original = await first;

      // Having seen the number, try again with a flattering vector.
      const second = waitForMaybe(sockA, "face_sync_result", 1_500);
      sockA.emit("face_sync_sample", { vector: VECTOR_A });
      check("a second report is ignored", (await second) === null, `first was ${original.score}`);
      close(sockA, sockB);
    }

    /* ── 8. Events from outside a match ── */
    console.log("\nreports from players who are not in a match");
    {
      const lone = await connectPooled();
      const errors = collect(lone, "server_error");
      const result = waitForMaybe(lone, "face_sync_result", 1_200);

      // Never queued, never matched.
      lone.emit("face_sync_sample", { vector: VECTOR_A });
      lone.emit("face_sync_sample", { unavailable: true });
      lone.emit("face_sync_sample", null);
      lone.emit("face_sync_sample", "garbage");

      check("an unmatched client gets no result", (await result) === null);
      errors.stop();
      check("an unmatched client is not disconnected", lone.connected);
      close(lone);
    }

    /* ── 9. Skipping mid-scan must not leak into the next stranger ── */
    console.log("\nnext stranger during the lead-in");
    {
      const { sockA, sockB } = await pair();
      const first = waitFor(sockA, "face_sync_result");
      sockA.emit("face_sync_sample", { vector: VECTOR_A });
      sockB.emit("face_sync_sample", { vector: VECTOR_B });
      const firstResult = await first;

      // A third player for the skipped pair to land on.
      const sockC = await connectPooled();

      // `skip_user` returns BOTH players to the queue, so either of
      // them may take the waiting third client — the skipping side
      // is not given priority. Race them rather than assuming.
      const rematchA = waitFor(sockA, "match_started", 15_000)
        .then((p) => ({ socket: sockA, payload: p }));
      const rematchB = waitFor(sockB, "match_started", 15_000)
        .then((p) => ({ socket: sockB, payload: p }));

      sockC.emit("join_queue", { peerId: `peer-${randomUUID()}` });
      await new Promise((r) => setTimeout(r, 200));
      sockA.emit("skip_user");

      const { socket: rejoined, payload: second } = await Promise.race([rematchA, rematchB]);
      // Whichever one lost the race is still queued; stop it from
      // rejecting into an unhandled rejection later.
      rematchA.catch(() => {});
      rematchB.catch(() => {});

      check("the new match has a different id",
        second.matchId !== firstResult.matchId, `${second.matchId}`);

      // The old result must not be replayed into the new match.
      const stale = await waitForMaybe(rejoined, "face_sync_result", 1_500);
      check("no result arrives for the new stranger without a report",
        stale === null, stale ? `leaked ${stale.score}` : "");

      const fresh = waitFor(rejoined, "face_sync_result");
      rejoined.emit("face_sync_sample", { vector: VECTOR_A });
      sockC.emit("face_sync_sample", { vector: VECTOR_A2 });
      const freshResult = await fresh;
      check("the new stranger gets a freshly computed result",
        freshResult.matchId === second.matchId, `${freshResult.score}`);
      check("the new result reflects the new pair of faces",
        freshResult.score !== firstResult.score,
        `${firstResult.score} -> ${freshResult.score}`);

      close(sockA, sockB, sockC);
    }

    /* ── 10. Celebrity mode must not pay for a feature it lacks ── */
    console.log("\ncelebrity rounds skip the lead-in entirely");
    {
      const { sockA, sockB, startedA } = await pair("celebrity");
      const startedAt = Date.now();

      check("celebrity match_started has no lead-in",
        startedA.faceSyncEndsAt === startedA.roundStartedAt,
        `lead-in ${startedA.faceSyncEndsAt - startedA.roundStartedAt}ms`);

      // The celebrity arena never reports geometry, so a lead-in
      // here would stall every round for the full collection
      // window with nothing on screen.
      const tick = await waitFor(sockA, "countdown_tick", 6_000);
      check("the celebrity countdown starts immediately",
        tick.receivedAt - startedAt < 1_500,
        `${tick.receivedAt - startedAt}ms after match_started`);

      const stray = await waitForMaybe(sockA, "face_sync_result", 1_000);
      check("celebrity rounds get no FaceSync result", stray === null);

      close(sockA, sockB);
    }

    /* ── 11. FaceSync as a mode in its own right ── */
    console.log("\nfacesync mode: the reveal is the whole round");
    {
      const { sockA, sockB, startedA, startedB } = await pair("facesync");

      check("both players get the same facesync match",
        startedA.matchId === startedB.matchId, startedA.matchId);
      check("facesync matches open a lead-in",
        startedA.faceSyncEndsAt > startedA.roundStartedAt,
        `${startedA.faceSyncEndsAt - startedA.roundStartedAt}ms`);

      const resultA = waitFor(sockA, "face_sync_result");
      const resultB = waitFor(sockB, "face_sync_result");
      // No countdown may follow: this mode has no emoji round.
      const strayTick = waitForMaybe(sockA, "countdown_tick", 6_000);
      const strayLock = waitForMaybe(sockA, "emoji_locked", 1_000);

      sockA.emit("face_sync_sample", { vector: VECTOR_A });
      sockB.emit("face_sync_sample", { vector: VECTOR_A2 });

      const [ra, rb] = await Promise.all([resultA, resultB]);
      check("both players get the same facesync score",
        ra.score === rb.score, `${ra.score} / ${rb.score}`);
      check("both players get the same band", ra.category === rb.category, ra.category);

      check("no countdown follows a facesync reveal", (await strayTick) === null);
      check("no scan window opens", (await strayLock) === null);

      close(sockA, sockB);
    }

    console.log("\nfacesync mode: a miss still ends cleanly");
    {
      const { sockA, sockB } = await pair("facesync");
      const skip = waitFor(sockA, "face_sync_skipped");
      const strayTick = waitForMaybe(sockA, "countdown_tick", 5_000);

      sockA.emit("face_sync_sample", { unavailable: true });
      sockB.emit("face_sync_sample", { unavailable: true });

      check("a facesync miss is announced", Boolean(await skip));
      check("a miss does not start an emoji round", (await strayTick) === null);
      close(sockA, sockB);
    }

    console.log("\nqueues do not mix across modes");
    {
      // Someone who picked FaceSync must never be dropped into a
      // ten-second emoji duel they did not ask for.
      const faceSyncClient = await connectPooled();
      const emojiClient = await connectPooled();
      const crossMatch = waitForMaybe(faceSyncClient, "match_started", 4_000);

      faceSyncClient.emit("join_queue", { peerId: `peer-${randomUUID()}`, gameMode: "facesync" });
      await waitFor(faceSyncClient, "waiting");
      emojiClient.emit("join_queue", { peerId: `peer-${randomUUID()}` });

      check("a facesync player is not paired with an emoji player",
        (await crossMatch) === null);

      faceSyncClient.emit("stop_matching");
      emojiClient.emit("stop_matching");
      close(faceSyncClient, emojiClient);
    }

    /* ── 12. Partner leaves mid-lead-in ── */
    console.log("\npartner disconnects during the lead-in");
    {
      const { sockA, sockB } = await pair();
      sockA.emit("face_sync_sample", { vector: VECTOR_A });
      const left = waitFor(sockA, "opponent_left", 8_000);
      sockB.close();
      check("the remaining player is told, not stranded", Boolean(await left));

      const stray = await waitForMaybe(sockA, "face_sync_result", 1_500);
      check("no result is invented for a departed partner", stray === null);
      check("the remaining player stays connected", sockA.connected);
      close(sockA);
    }

    console.log(`\n[facesync] ${passed} passed, ${failed} failed`);
    return finish(failed === 0 ? 0 : 1);
  } catch (error) {
    console.error(`\n[facesync] threw: ${error.message}`);
    console.error(error.stack);
    return finish(1);
  }
}

run();
