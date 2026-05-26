const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Waiting room queue: stores { socketId, peerId }
const waitingQueue = [];

// Active pairs: socketId -> roomId (both users share the same roomId)
const socketToRoom = new Map();
const socketToPeer = new Map();
const countdownTimers = new Map(); // roomId -> intervalId
const roomScores = new Map();      // roomId -> [{ socketId, score }, ...]

const EMOJI_PROMPTS = [
  "\u{1F600}",
  "\u{1F601}",
  "\u{1F602}",
  "\u{1F62E}",
  "\u{1F632}",
  "\u{1F609}",
  "\u{1F61C}",
  "\u{1F621}",
  "\u{1F624}",
  "\u{1F622}",
  "\u{1F62D}",
  "\u{1F60E}",
  "\u{1F928}",
  "\u{1F610}",
  "\u{1F611}",
  "\u{1F633}",
  "\u{1F62C}",
  "\u{1F60F}",
];

function pickEmojiPrompt() {
  return EMOJI_PROMPTS[Math.floor(Math.random() * EMOJI_PROMPTS.length)];
}

function removeFromQueue(socketId) {
  const idx = waitingQueue.findIndex((u) => u.socketId === socketId);
  if (idx !== -1) waitingQueue.splice(idx, 1);
}

function cleanupRoom(roomId) {
  const members = Array.from(io.sockets.adapter.rooms.get(roomId) ?? []);

  if (countdownTimers.has(roomId)) {
    clearInterval(countdownTimers.get(roomId));
    countdownTimers.delete(roomId);
  }
  roomScores.delete(roomId);

  for (const socketId of members) {
    const memberSocket = io.sockets.sockets.get(socketId);
    memberSocket?.leave(roomId);
    socketToRoom.delete(socketId);
  }

  return members;
}

function broadcastCountdown(roomId, startFrom = 3) {
  let count = startFrom;
  const interval = setInterval(() => {
    io.to(roomId).emit("countdown_tick", { count });
    if (count === 0) {
      clearInterval(interval);
      countdownTimers.delete(roomId);
    }
    count--;
  }, 1000);
  countdownTimers.set(roomId, interval);
}

function startMatch(socket, partner) {
  const partnerSocket = io.sockets.sockets.get(partner.socketId);
  if (!partnerSocket) return false;

  const roomId = `room_${partner.socketId}_${socket.id}`;
  socket.join(roomId);
  partnerSocket.join(roomId);
  socketToRoom.set(socket.id, roomId);
  socketToRoom.set(partner.socketId, roomId);
  const emoji = pickEmojiPrompt();

  partnerSocket.emit("match_found", {
    partnerPeerId: socketToPeer.get(socket.id),
    role: "caller",
    emoji,
  });
  socket.emit("match_found", {
    partnerPeerId: partner.peerId,
    role: "receiver",
    emoji,
  });

  console.log(`[M] Matched ${partner.socketId} <-> ${socket.id} in ${roomId}`);
  setTimeout(() => {
    if (socketToRoom.get(socket.id) === roomId && socketToRoom.get(partner.socketId) === roomId) {
      broadcastCountdown(roomId, 3);
    }
  }, 500);

  return true;
}

function enqueueSocket(socket, peerId, skippedSocketId = null) {
  if (!socket?.connected || !peerId) return;

  removeFromQueue(socket.id);

  for (let i = 0; i < waitingQueue.length; i++) {
    const candidate = waitingQueue[i];
    const candidateSocket = io.sockets.sockets.get(candidate.socketId);

    if (!candidateSocket) {
      waitingQueue.splice(i, 1);
      i--;
      continue;
    }

    const blockedBySkip =
      candidate.socketId === skippedSocketId || candidate.skippedSocketId === socket.id;

    if (!blockedBySkip) {
      waitingQueue.splice(i, 1);
      if (startMatch(socket, candidate)) return;
      i--;
    }
  }

  waitingQueue.push({ socketId: socket.id, peerId, skippedSocketId });
  socket.emit("waiting");
  console.log(`[W] ${socket.id} is waiting...`);
}

io.on("connection", (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // Client registers their PeerJS ID when ready
  socket.on("join_queue", ({ peerId }) => {
    console.log(`[Q] ${socket.id} joined queue with peerId=${peerId}`);
    socketToPeer.set(socket.id, peerId);

    enqueueSocket(socket, peerId);
  });

  socket.on("skip_user", () => {
    const roomId = socketToRoom.get(socket.id);
    const peerId = socketToPeer.get(socket.id);

    if (!roomId) {
      enqueueSocket(socket, peerId);
      return;
    }

    const members = cleanupRoom(roomId);
    const partnerId = members.find((id) => id !== socket.id) ?? null;

    for (const memberId of members) {
      const memberSocket = io.sockets.sockets.get(memberId);
      const memberPeerId = socketToPeer.get(memberId);
      const skippedSocketId = members.find((id) => id !== memberId) ?? null;

      memberSocket?.emit("match_skipped", { bySelf: memberId === socket.id });

      if (memberSocket && memberPeerId) {
        setTimeout(() => enqueueSocket(memberSocket, memberPeerId, skippedSocketId), 250);
      }
    }

    console.log(`[S] ${socket.id} skipped room ${roomId}${partnerId ? ` with ${partnerId}` : ""}`);
  });

  /* ── Chat relay: forward message to the other person in the room only ── */
  socket.on("chat_message", ({ text }) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId || !text) return;
    // Broadcast to the room EXCEPT the sender
    socket.to(roomId).emit("chat_message", { text, fromSelf: false });
  });

  socket.on("live_score", ({ score }) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId || typeof score !== "number") return;
    socket.to(roomId).emit("partner_live_score", {
      score: Math.max(0, Math.min(10, score)),
    });
  });

  /* ── Score submission: collect both, then broadcast comparison ── */
  socket.on("submit_score", ({ score }) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) return;

    if (!roomScores.has(roomId)) roomScores.set(roomId, []);
    const entries = roomScores.get(roomId);

    // Avoid duplicate submission from same socket
    if (entries.find((e) => e.socketId === socket.id)) return;
    entries.push({ socketId: socket.id, score });

    if (entries.length === 2) {
      const [a, b] = entries;
      // Send each person their own score and the partner's score
      io.to(a.socketId).emit("scores_ready", { myScore: a.score, partnerScore: b.score });
      io.to(b.socketId).emit("scores_ready", { myScore: b.score, partnerScore: a.score });
      roomScores.delete(roomId);
    }
  });

  socket.on("stop_matching", () => {
    const roomId = socketToRoom.get(socket.id);

    if (roomId) {
      const members = cleanupRoom(roomId);
      for (const memberId of members) {
        if (memberId === socket.id) continue;
        const memberSocket = io.sockets.sockets.get(memberId);
        const memberPeerId = socketToPeer.get(memberId);
        memberSocket?.emit("match_skipped", { bySelf: false });
        if (memberSocket && memberPeerId) {
          setTimeout(() => enqueueSocket(memberSocket, memberPeerId, socket.id), 250);
        }
      }
    } else {
      removeFromQueue(socket.id);
    }

    console.log(`[P] ${socket.id} stopped matching`);
  });

  socket.on("disconnect", () => {
    // Remove from queue if still waiting
    removeFromQueue(socket.id);

    // Clean up room mapping
    const roomId = socketToRoom.get(socket.id);
    if (roomId) {
      const members = cleanupRoom(roomId).filter((id) => id !== socket.id);
      for (const memberId of members) {
        const memberSocket = io.sockets.sockets.get(memberId);
        memberSocket?.emit("match_skipped", { bySelf: false });
        const memberPeerId = socketToPeer.get(memberId);
        if (memberSocket && memberPeerId) {
          setTimeout(() => enqueueSocket(memberSocket, memberPeerId, socket.id), 250);
        }
      }
    }
    socketToPeer.delete(socket.id);

    console.log(`[-] Disconnected: ${socket.id}`);
  });
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.get("/online", (_req, res) => {
  res.json({ count: io.engine.clientsCount ?? 0 });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Signaling server running on :${PORT}`));
