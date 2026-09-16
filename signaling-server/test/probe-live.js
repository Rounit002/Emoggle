/**
 * Read-only probe against an already-running signaling server.
 * Pairs two clients and reports whether the build in front of us
 * speaks FaceSync. Changes no server state beyond one throwaway
 * match, which it leaves immediately.
 *
 *   node test/probe-live.js [http://localhost:3001]
 */
const { io: ioClient } = require("socket.io-client");
const { randomUUID } = require("crypto");

const BASE = process.argv[2] || "http://localhost:3001";

const VECTOR = [
  1.6, 1.856, 1.111, 1.378, 1.378, 0.356, 0.332, 0.01, 0.378, 0.534,
  0.415, 0.578, 0.179, 0.338, 0.311, 0.317, 0.066, 0.66, 0.514, 0.523,
];

async function session() {
  const res = await fetch(`${BASE}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`session ${res.status}`);
  return res.json();
}

function connect(token) {
  return ioClient(BASE, { transports: ["websocket"], auth: { token }, reconnection: false });
}

function once(socket, event, ms = 12_000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload ?? {});
    });
  });
}

(async () => {
  const [sa, sb] = [await session(), await session()];
  const a = connect(sa.socketToken);
  const b = connect(sb.socketToken);
  await Promise.all([once(a, "connect"), once(b, "connect")]);

  const ma = once(a, "match_started");
  const mb = once(b, "match_started");
  a.emit("join_queue", { peerId: `probe-${randomUUID()}` });
  await once(a, "waiting", 4000);
  b.emit("join_queue", { peerId: `probe-${randomUUID()}` });
  const [pa, pb] = await Promise.all([ma, mb]);

  if (!pa || !pb) {
    console.log("RESULT: could not pair — server unreachable or busy");
    process.exit(2);
  }

  const hasField = typeof pa.faceSyncEndsAt === "number";
  console.log(`match_started carries faceSyncEndsAt : ${hasField}`);

  const ra = once(a, "face_sync_result", 6000);
  const rb = once(b, "face_sync_result", 6000);
  a.emit("face_sync_sample", { vector: VECTOR });
  b.emit("face_sync_sample", { vector: VECTOR.map((v, i) => v * (i % 2 ? 1.05 : 0.97)) });
  const [xa, xb] = await Promise.all([ra, rb]);

  if (xa && xb) {
    console.log(`face_sync_result A=${xa.score} B=${xb.score} band=${xa.category}`);
    console.log(`RESULT: live server SPEAKS FaceSync (identical: ${xa.score === xb.score})`);
  } else {
    console.log("RESULT: live server does NOT speak FaceSync (no result event)");
  }

  a.emit("stop_matching");
  b.emit("stop_matching");
  a.close();
  b.close();
  process.exit(0);
})().catch((error) => {
  console.error("probe failed:", error.message);
  process.exit(1);
});
