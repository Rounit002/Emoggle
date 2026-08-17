const assert = require("node:assert/strict");
const test = require("node:test");

const {
  averageSamples,
  buildMatchResultPayloads,
  clampScore,
  deadlineRoundScore,
  submittedRoundScore,
} = require("../matchScore");

test("clamps all final scores to the 0-10 range", () => {
  assert.equal(clampScore(-3), 0);
  assert.equal(clampScore(12), 10);
  assert.equal(clampScore(7.4), 7.4);
});

test("averages only finite in-window samples", () => {
  assert.equal(averageSamples([2, 4, Number.NaN, 12]), 16 / 3);
  assert.equal(averageSamples([]), null);
});

test("preserves the submitted round normalization formula", () => {
  assert.equal(submittedRoundScore([6, 6, 8, 8, 7], 9), 8);
  assert.equal(submittedRoundScore([6, 7, 8, 9], 9), null);
});

test("deadline score resolves from received samples or cleanly falls back to zero", () => {
  assert.equal(deadlineRoundScore([4, 5, 6]), 5);
  assert.equal(deadlineRoundScore([]), 0);
});

test("builds mirrored player-relative result payloads", () => {
  const payloads = buildMatchResultPayloads({
    matchId: "match-1",
    match: { player1SocketId: "socket-a", player2SocketId: "socket-b" },
    player1Score: 8.2,
    player2Score: 6.4,
    elo: {
      player1: { newElo: 1016, delta: 16, tier: "Novice" },
      player2: { newElo: 984, delta: -16, tier: "Statue" },
    },
  });

  assert.equal(payloads.player1.myScore, 8.2);
  assert.equal(payloads.player1.partnerScore, 6.4);
  assert.equal(payloads.player1.winner, "you");
  assert.equal(payloads.player2.myScore, 6.4);
  assert.equal(payloads.player2.partnerScore, 8.2);
  assert.equal(payloads.player2.winner, "rival");
  assert.equal(payloads.player1.winnerSocketId, payloads.player2.winnerSocketId);
});
