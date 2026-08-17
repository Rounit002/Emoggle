/**
 * SarcasticMessageGenerator
 * ------------------------
 * Produces a single, randomized, meme-friendly reaction sentence for the
 * end-of-match result screen. The same string is reused verbatim inside
 * the generated share-card image so the user sees one consistent line
 * on screen and on the picture they post.
 *
 * Design rules
 *  - Playful, never insulting or discriminatory.
 *  - Driven by a small number of high-level buckets so the text always
 *    matches the actual outcome of the round (win/loss/draw, accuracy
 *    band, margin).
 *  - Each bucket holds a small pool of variants. A short session-local
 *    "recently used" set prevents the same line from appearing back to
 *    back in the same browser tab.
 *
 * Adding messages
 *  Drop a new line into the relevant bucket. The bucket list and
 *  selection logic intentionally stays dumb — `pickFromBucket` is a
 *  plain random-with-anti-repeat helper, no nested if-trees.
 */

export type AccuracyBand =
  | "excellent" // 90–100%
  | "good"      // 75–89%
  | "average"   // 50–74%
  | "poor"      // 25–49%
  | "veryPoor"; //  0–24%

export type Outcome = "win" | "loss" | "draw";

export type Bucket =
  | "dominantWin"   // big win margin, both scored well
  | "closeWin"      // win, both scored close
  | "lowScoreWin"   // user won but accuracy was average/poor
  | "closeLoss"     // lost by < 5 points
  | "heavyLoss"     // lost by a lot
  | "draw"          // tied
  | "excellentAccuracy"
  | "goodAccuracy"
  | "averageAccuracy"
  | "poorAccuracy"
  | "veryPoorAccuracy";

interface MessageSet {
  readonly [key: string]: readonly string[];
}

/**
 * Each bucket is a flat array of one-liners. The pool is intentionally
 * larger than what's needed per round so consecutive matches can vary
 * even with a single user. Keep the tone light, no slurs, no body
 * shaming, no targeting of any protected group.
 */
const MESSAGES: MessageSet = {
  // ── Win variants ─────────────────────────────────────────────────
  dominantWin: [
    "Bro didn't win. Bro committed a violation.",
    "That wasn't a win, that was a crime scene.",
    "Your face had the emoji on life support.",
    "Somebody call the emoji police.",
    "That emoji is looking for a new job.",
    "You didn't win. You displaced.",
    "The emoji requested a transfer.",
    "Rival called their therapist after that one.",
    "That's not a face. That's a federal offense.",
    "You didn't win. You terrorised.",
    "Somewhere, an emoji is re-evaluating its career choices.",
  ],
  closeWin: [
    "Won by the skin of your facial muscles.",
    "Clutch. Questionable. But clutch.",
    "Won so slow the camera almost fell asleep.",
    "You won. The bar was underground.",
    "Won. The bar is in hell and you barely cleared it.",
    "Cut it close. Like, eyebrow-raisingly close.",
    "That was closer than it needed to be. Take a breath.",
    "Narrow win. Your heart rate is the actual MVP.",
    "Won by a hair. Your hair. You should wash it.",
  ],
  lowScoreWin: [
    "Didn't cook... but somehow won 💀",
    "Won ugly. But ugly still wins.",
    "The score is a cry for help, but a W is a W.",
    "Won. The emoji wants a recount.",
    "The scoreboard said yes. Your face said no.",
    "Got the dub. The performance said otherwise.",
    "Statistically embarrassing. Emotionally victorious.",
    "Both of you flunked. You just flunked less.",
  ],

  // ── Loss variants ────────────────────────────────────────────────
  closeLoss: [
    "Lost by THIS much 🤏",
    "Lost by a pixel. A sad, tired pixel.",
    "Lost close. The emoji felt bad for you.",
    "Lost. But the emoji saw you trying.",
    "Lost by the width of one eyebrow.",
    "Lost. Your eyebrows are filing a complaint.",
    "Lost in the most brutal way possible: close.",
    "Lost. The emoji respects the effort though.",
    "Defeated. Marginally. Empathically.",
  ],
  heavyLoss: [
    "Opponent sent bro back to facial expression training.",
    "You didn't lose. You were relocated.",
    "That was an eviction notice for your face.",
    "Lost. Your face has been reported.",
    "Your face is on a watchlist now.",
    "Lost. Hard. The camera is concerned.",
    "The opponent cooked you and served you with rice.",
    "That wasn't a duel. That was a public service announcement.",
    "Your face has left the group chat.",
    "Rival didn't just win, they took a selfie with your L.",
    "Lost so bad the emoji is showing you mercy.",
  ],

  // ── Draw variants ────────────────────────────────────────────────
  draw: [
    "Same brain. Same face.",
    "Perfectly balanced, unfortunately.",
    "Neither of you wanted to win 💀",
    "Rematch. Immediately.",
    "A draw. The emoji is unimpressed by both of you.",
    "Tied. The bar is underground and you both limbo'd under it.",
    "Draw. Two Ls cancelling out into an L.",
    "Tied. The camera is the real winner here.",
    "Same energy. Same bad energy.",
    "Tied. The result is \"everyone lost.\"",
  ],

  // ── Accuracy-only bands (used as tiebreakers) ───────────────────
  excellentAccuracy: [
    "Bro became the emoji 💀",
    "Emoji copied YOU this time.",
    "Facial muscles unlocked 🔓",
    "Okay Shakespeare, calm down.",
    "Bro understood the assignment.",
    "That emoji never stood a chance.",
    "Face ID upgraded.",
    "Emoji who? You're the main character now.",
    "Your face is the new reference image.",
    "That's not mimicry, that's a hostile takeover.",
  ],
  goodAccuracy: [
    "Not bad... suspiciously good actually 👀",
    "Bro has been practicing in the mirror.",
    "The emoji approves.",
    "Main character performance.",
    "Facial muscles working overtime.",
    "Actually cooked 🔥",
    "Emoji-compatible. Fr.",
    "Slight menace detected. Respected.",
    "Bro learned that face from a tutorial, didn't they?",
    "Your face passed the vibe check.",
  ],
  averageAccuracy: [
    "Close enough... probably.",
    "The emoji is slightly confused.",
    "Bro gave it his best face.",
    "Almost cooked.",
    "Expression.exe is still loading.",
    "We can pretend that was intentional.",
    "The emoji is giving you the benefit of the doubt.",
    "Mid. Comfortably mid.",
    "The emoji shrugged. That's a neutral shrug.",
    "Your face is in the middle of the bell curve.",
    "Halfway there. Emotionally. Literally.",
  ],
  poorAccuracy: [
    "Bro's face had other plans 💀",
    "The emoji is filing a complaint.",
    "Was that even the same emotion? 😭",
    "Facial expression left the chat.",
    "Bro tried. That's what matters.",
    "Mirror practice starts tomorrow.",
    "The camera witnessed everything.",
    "The emoji is re-reading the prompt.",
    "Your face has joined the witness protection program.",
    "The emoji is questioning its life choices.",
    "Expression delivered: wrong one.",
  ],
  veryPoorAccuracy: [
    "Bro fought the emoji and lost 💀",
    "We might need a rematch immediately.",
    "The emoji wants an apology.",
    "What expression was THAT? 😭",
    "Camera: 🤨",
    "Bro invented a new emotion.",
    "Achievement unlocked: Confusion.",
    "Delete the evidence... or share it.",
    "Your face has been forwarded to the emoji union.",
    "That's not a face. That's a cry for help.",
    "The emoji is calling its manager.",
    "Expression status: lost in translation.",
    "Your face is on a milk carton now.",
    "Camera malfunction OR you. We can't tell.",
  ],
};

/**
 * Map a 0-100 percentage into the corresponding accuracy band. Bands
 * are inclusive of the lower bound and exclusive of the upper bound
 * (i.e. 90 maps to excellent, 89.99 maps to good).
 */
export function bandForAccuracy(accuracyPct: number | null | undefined): AccuracyBand {
  if (accuracyPct === null || accuracyPct === undefined || Number.isNaN(accuracyPct)) {
    return "poor";
  }
  if (accuracyPct >= 90) return "excellent";
  if (accuracyPct >= 75) return "good";
  if (accuracyPct >= 50) return "average";
  if (accuracyPct >= 25) return "poor";
  return "veryPoor";
}

/**
 * Map a numeric (0-10) Emoggle score to a 0-100 accuracy percentage.
 * The game reports scores out of 10, but the share-card display
 * prefers whole percent.
 */
export function scoreToAccuracyPct(score: number | null | undefined): number {
  if (score === null || score === undefined || !Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round((score / 10) * 100)));
}

/**
 * Decide the primary bucket for a given outcome + accuracy band. The
 * margin (delta between player and opponent) only matters on wins
 * and losses; the accuracy band kicks in for the secondary fall-back
 * selection.
 */
export function pickBucket(
  outcome: Outcome,
  band: AccuracyBand,
  delta: number | null,
): Bucket {
  if (outcome === "draw") return "draw";
  if (outcome === "win") {
    if (band === "excellent" || band === "good") {
      return delta !== null && delta < 1.5 ? "closeWin" : "dominantWin";
    }
    return "lowScoreWin";
  }
  // loss
  if (delta !== null && delta < 5) return "closeLoss";
  return "heavyLoss";
}

/**
 * The selection helper used by `generateReactionMessage`. It uses
 * a small session-local "recent" buffer so the same joke doesn't
 * play twice in a row in the same tab.
 */
const RECENT_LIMIT = 3;
const recentByBucket = new Map<Bucket, string[]>();

function pickFromBucket(bucket: Bucket): string {
  const pool = MESSAGES[bucket];
  if (!pool || pool.length === 0) {
    // Should never happen with the static table above, but stay
    // safe so a missing bucket can't crash the result screen.
    return "Got the result. That's the main thing.";
  }
  const recent = recentByBucket.get(bucket) ?? [];
  const banned = new Set(recent);
  const candidates = pool.filter((m) => !banned.has(m));
  const list = candidates.length > 0 ? candidates : pool;
  const choice = list[Math.floor(Math.random() * list.length)];

  const nextRecent = [choice, ...recent].slice(0, RECENT_LIMIT);
  recentByBucket.set(bucket, nextRecent);
  return choice;
}

/**
 * The single public entry point. Given a normalized match result
 * (player/outcome/band), it returns one witty line. Pure function,
 * so it can be called during render and the result memoized.
 */
export function generateReactionMessage(args: {
  outcome: Outcome;
  band: AccuracyBand;
  delta: number | null;
}): string {
  const { outcome, band, delta } = args;
  const primary = pickBucket(outcome, band, delta);

  // 50/50 between the primary outcome bucket and the accuracy
  // band bucket, weighted slightly toward the outcome bucket so
  // wins feel like wins and losses feel like losses.
  const usePrimary = Math.random() < 0.65 || primary === "draw";
  const bucket = usePrimary ? primary : (bandToBucket(band) ?? primary);
  return pickFromBucket(bucket);
}

function bandToBucket(band: AccuracyBand): Bucket | null {
  switch (band) {
    case "excellent":
      return "excellentAccuracy";
    case "good":
      return "goodAccuracy";
    case "average":
      return "averageAccuracy";
    case "poor":
      return "poorAccuracy";
    case "veryPoor":
      return "veryPoorAccuracy";
  }
}

/**
 * Test helper: clear the recently-used buffer between unit tests so
 * anti-repeat logic doesn't poison subsequent runs.
 */
export function __resetReactionStateForTests(): void {
  recentByBucket.clear();
}
