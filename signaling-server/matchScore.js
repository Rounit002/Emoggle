const MIN_SCORE = 0;
const MAX_SCORE = 10;

function clampScore(score) {
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, score));
}

function finiteSamples(samples) {
  if (!Array.isArray(samples)) return [];
  return samples
    .filter((value) => typeof value === "number" && Number.isFinite(value))
    .map(clampScore);
}

function averageSamples(samples) {
  const valid = finiteSamples(samples);
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

/**
 * Normalize an explicit end-of-round submission. The server's
 * time-windowed live sample mean and the client's fixed-interval
 * round mean each contribute half, preserving the existing scoring
 * formula while keeping the final value bounded and deterministic.
 */
function submittedRoundScore(samples, clientFinal, minSamples = 5) {
  const valid = finiteSamples(samples);
  if (valid.length < minSamples) return null;
  if (typeof clientFinal !== "number" || !Number.isFinite(clientFinal)) return null;
  const sampleAverage = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  return clampScore(Number(((sampleAverage + clampScore(clientFinal)) / 2).toFixed(1)));
}

/**
 * Deadline fallback for a client that did not submit. This is based
 * on samples already received during the authoritative scan window;
 * a player with no valid samples resolves to 0 instead of leaving the
 * opponent on an endless result spinner.
 */
function deadlineRoundScore(samples) {
  const average = averageSamples(samples);
  return average === null ? 0 : clampScore(Number(average.toFixed(1)));
}

function buildMatchResultPayloads({ matchId, match, player1Score, player2Score, elo }) {
  const winnerSocketId =
    player1Score === player2Score
      ? null
      : player1Score > player2Score
        ? match.player1SocketId
        : match.player2SocketId;

  return {
    winnerSocketId,
    player1: {
      matchId,
      myScore: player1Score,
      partnerScore: player2Score,
      winner: winnerSocketId === null ? "tie" : winnerSocketId === match.player1SocketId ? "you" : "rival",
      winnerSocketId,
      myElo: elo.player1.newElo,
      partnerElo: elo.player2.newElo,
      myEloDelta: elo.player1.delta,
      partnerEloDelta: elo.player2.delta,
      myTier: elo.player1.tier,
      partnerTier: elo.player2.tier,
    },
    player2: {
      matchId,
      myScore: player2Score,
      partnerScore: player1Score,
      winner: winnerSocketId === null ? "tie" : winnerSocketId === match.player2SocketId ? "you" : "rival",
      winnerSocketId,
      myElo: elo.player2.newElo,
      partnerElo: elo.player1.newElo,
      myEloDelta: elo.player2.delta,
      partnerEloDelta: elo.player1.delta,
      myTier: elo.player2.tier,
      partnerTier: elo.player1.tier,
    },
  };
}

module.exports = {
  averageSamples,
  buildMatchResultPayloads,
  clampScore,
  deadlineRoundScore,
  submittedRoundScore,
};
