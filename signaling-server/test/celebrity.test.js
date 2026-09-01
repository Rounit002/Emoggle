/**
 * End-to-end smoke test for the Celebrity Face Mimic flow.
 *
 * Spins up the real signaling server on an ephemeral port, opens
 * two real socket.io clients, and walks the complete 1v1 round
 * lifecycle. After the recent entry-flow refactor, the celebrity
 * arena rides the EXISTING emoji matchmaking pipeline:
 *
 *   1. Both clients connect, exchange tokens, and join the shared
 *      `join_queue` with `gameMode: "celebrity"`.
 *   2. The server pairs them, picks a celebrity, and fires
 *      `match_started` to both with the same `celebrity` payload.
 *   3. The server runs a 3s countdown (3 → 2 → 1) via
 *      `countdown_tick`, then opens the 10s scan window and
 *      emits `emoji_locked`.
 *   4. Each client submits a peak score via `submit_score`.
 *   5. Both clients receive a `match_result` with the same
 *      `matchId`, celebrity reference, and the higher-score
 *      player marked as the winner.
 *   6. A cross-mode pair remains unmatched, while two emoji players
 *      pair normally without receiving a celebrity target.
 *
 * The test uses the existing in-memory queue / match state
 * directly, so it does not need a real camera or PeerJS
 * connection — we only exercise the socket path.
 *
 * Run with:
 *   node test/celebrity.test.js
 *
 * Requires the `socket.io-client` dev dependency (npm install
 * socket.io-client). The test works in both DB and DB-less
 * modes: the in-memory fallback celebrity catalogue is used
 * when no database is available.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { io: ioClient } = require("socket.io-client");
const { spawn } = require("child_process");
const { randomUUID } = require("crypto");

const SERVER_PORT = Number.parseInt(process.env.SMOKE_PORT || "3099", 10);
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

async function waitForServer(url, attempts = 50) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function createAnonymousSession(baseUrl) {
  const res = await fetch(`${baseUrl}/api/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
    },
    body: "{}",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Session creation failed: ${res.status} ${text}`);
  }
  return res.json();
}

function connectClient(token) {
  return ioClient(SERVER_URL, {
    transports: ["websocket"],
    auth: { token },
    reconnection: false,
  });
}

function waitFor(socket, event, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, 20_000);
    const handler = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

async function run() {
  const serverCwd = path.resolve(__dirname, "..");
  const server = spawn(process.execPath, ["index.js"], {
    cwd: serverCwd,
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      // No DATABASE_URL: the test exercises the in-memory fallback
      // path so it can run on a fresh container without Postgres.
      DATABASE_URL: "",
      ENABLE_RANKED_ELO: "false",
      CELEBRITY_AFFECTS_ELO: "false",
      TRUST_GEO_HEADERS: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverStderr = "";
  server.stderr.on("data", (chunk) => {
    serverStderr += chunk.toString();
  });
  server.stdout.on("data", (chunk) => {
    process.stdout.write(`[server] ${chunk}`);
  });

  let cleanupRan = false;
  const cleanup = async (code = 0) => {
    if (cleanupRan) return;
    cleanupRan = true;
    try { server.kill("SIGTERM"); } catch {}
    if (code !== 0) {
      console.error(`[smoke] FAILED with code ${code}`);
      console.error(serverStderr);
    }
    process.exit(code);
  };

  try {
    const ready = await waitForServer(SERVER_URL);
    if (!ready) {
      await cleanup(1);
      return;
    }
    console.log("[smoke] server ready on", SERVER_URL);

    // Create two anonymous sessions.
    const sessionA = await createAnonymousSession(SERVER_URL);
    const sessionB = await createAnonymousSession(SERVER_URL);
    console.log("[smoke] created sessions", sessionA.id, sessionB.id);

    const sockA = connectClient(sessionA.socketToken);
    const sockB = connectClient(sessionB.socketToken);

    await Promise.all([
      new Promise((res) => sockA.on("connect", res)),
      new Promise((res) => sockB.on("connect", res)),
    ]);
    console.log("[smoke] sockets connected");

    // Both clients use the EXISTING join_queue. The server
    // automatically attaches a celebrity to match_started.
    // Register match listeners before the second player enters. Pairing is
    // synchronous from the clients' point of view, so attaching them after a
    // `waiting` event can miss `match_started` entirely.
    const matchA = waitFor(sockA, "match_started");
    const matchB = waitFor(sockB, "match_started");
    const waitingA = waitFor(sockA, "waiting");
    sockA.emit("join_queue", { peerId: `peer-${randomUUID()}`, gameMode: "celebrity" });
    await waitingA;
    sockB.emit("join_queue", { peerId: `peer-${randomUUID()}`, gameMode: "celebrity" });
    console.log("[smoke] first client waiting; second client joined");

    const [payloadA, payloadB] = await Promise.all([matchA, matchB]);

    if (payloadA.matchId !== payloadB.matchId) {
      throw new Error(
        `Match ids differ: ${payloadA.matchId} vs ${payloadB.matchId}`
      );
    }
    if (!payloadA.celebrity || !payloadB.celebrity) {
      throw new Error(
        `Celebrity payload missing on match_started: A=${!!payloadA.celebrity} B=${!!payloadB.celebrity}`
      );
    }
    if (payloadA.celebrity.id !== payloadB.celebrity.id) {
      throw new Error(
        `Celebrity ids differ: ${payloadA.celebrity.id} vs ${payloadB.celebrity.id}`
      );
    }
    if (!payloadA.celebrity.name || payloadA.celebrity.name !== payloadB.celebrity.name) {
      throw new Error(
        `Celebrity names differ: ${payloadA.celebrity.name} vs ${payloadB.celebrity.name}`
      );
    }
    if (
      payloadA.celebrity.name !== "IShowSpeed Squint" ||
      payloadA.celebrity.imageUrl !== "/celebrity-faces/memes/ishowspeed-squint.jpg"
    ) {
      throw new Error(`Unexpected pilot target: ${JSON.stringify(payloadA.celebrity)}`);
    }
    console.log(
      `[smoke] matched with celebrity ${payloadA.celebrity.name} (id=${payloadA.celebrity.id}) — matchId=${payloadA.matchId}`
    );

    // Wait for the countdown to reach 0.
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      const tA = await new Promise((res) => {
        const handler = (p) => {
          sockA.off("countdown_tick", handler);
          res(p);
        };
        sockA.on("countdown_tick", handler);
      });
      if (tA.count <= 0) break;
    }
    await new Promise((r) => setTimeout(r, 200));
    console.log("[smoke] countdown reached 0");

    // Final scores are accepted near the end of the server-owned 10-second
    // scan window, matching what the browser scorer does in production.
    await new Promise((r) => setTimeout(r, 8_600));

    // Submit scores: B is the higher score, so B should win.
    const scoreA = 6.4;
    const scoreB = 8.7;
    const resultA = waitFor(sockA, "match_result");
    const resultB = waitFor(sockB, "match_result");
    sockA.emit("submit_score", { score: scoreA });
    sockB.emit("submit_score", { score: scoreB });
    const [resA, resB] = await Promise.all([resultA, resultB]);

    if (resA.matchId !== payloadA.matchId || resB.matchId !== payloadA.matchId) {
      throw new Error("Result event carried a different matchId");
    }
    if (Math.abs(resA.myScore - scoreA) > 0.05) {
      throw new Error(`Player A score mismatch: ${resA.myScore} vs ${scoreA}`);
    }
    if (Math.abs(resB.myScore - scoreB) > 0.05) {
      throw new Error(`Player B score mismatch: ${resB.myScore} vs ${scoreB}`);
    }
    if (resA.winner !== "rival" || resB.winner !== "you") {
      throw new Error(
        `Winner should be B. Got A=${resA.winner}, B=${resB.winner}`
      );
    }
    if (!resA.celebrity || resA.celebrity.id !== payloadA.celebrity.id) {
      throw new Error("Result event missing or wrong celebrity id");
    }
    console.log(
      `[smoke] result OK: A=${resA.myScore}/B=${resB.myScore}, B wins, celebrity=${resA.celebrity.name}`
    );

    // Duplicate submission guard.
    let secondResultCount = 0;
    const onSecondResult = () => {
      secondResultCount += 1;
    };
    sockA.on("match_result", onSecondResult);
    sockA.emit("submit_score", { score: 9.9 });
    await new Promise((r) => setTimeout(r, 1000));
    sockA.off("match_result", onSecondResult);
    if (secondResultCount !== 0) {
      throw new Error("Duplicate submission produced an extra result event");
    }
    console.log("[smoke] duplicate submission dropped ✓");

    // Mode isolation: an emoji player and celebrity player must remain in
    // separate pools even though both reuse the same queue implementation.
    let crossModeMatchCount = 0;
    const countCrossModeMatch = () => { crossModeMatchCount += 1; };
    sockA.on("match_started", countCrossModeMatch);
    sockB.on("match_started", countCrossModeMatch);
    const emojiWaitingA = waitFor(sockA, "waiting");
    sockA.emit("join_queue", { peerId: `peer-${randomUUID()}`, gameMode: "emoji" });
    await emojiWaitingA;
    const celebrityWaitingB = waitFor(sockB, "waiting");
    sockB.emit("join_queue", { peerId: `peer-${randomUUID()}`, gameMode: "celebrity" });
    await celebrityWaitingB;
    await new Promise((r) => setTimeout(r, 300));
    if (crossModeMatchCount !== 0) throw new Error("Players were matched across game modes");
    sockA.off("match_started", countCrossModeMatch);
    sockB.off("match_started", countCrossModeMatch);

    const emojiMatchA = waitFor(sockA, "match_started");
    const emojiMatchB = waitFor(sockB, "match_started");
    sockB.emit("join_queue", { peerId: `peer-${randomUUID()}`, gameMode: "emoji" });
    const [emojiA, emojiB] = await Promise.all([emojiMatchA, emojiMatchB]);
    if (emojiA.celebrity || emojiB.celebrity) {
      throw new Error("Emoji match unexpectedly received a celebrity target");
    }
    if (!emojiA.emoji || emojiA.emoji !== emojiB.emoji) {
      throw new Error("Emoji match did not receive one synchronized emoji");
    }
    console.log("[smoke] mode isolation and emoji fallback OK ✓");

    sockA.disconnect();
    sockB.disconnect();

    console.log("\n[smoke] ALL CHECKS PASSED");
    await cleanup(0);
  } catch (err) {
    console.error("[smoke] error:", err.message);
    await cleanup(1);
  }
}

run();
