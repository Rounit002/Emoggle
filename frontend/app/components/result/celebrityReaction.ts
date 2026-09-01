/**
 * celebrityReaction
 * -----------------
 * Generates the reaction line used on the Celebrity Face Mimic
 * result screen. Wraps the existing sarcastic-message generator
 * with celebrity-specific buckets so the verdict names the
 * celebrity when one is provided.
 *
 * Why a wrapper instead of new buckets in the global generator?
 * The emoji generator is consumed by the rest of the app and is
 * deliberately emoji/face-expression agnostic. Celebrity mode
 * needs sentences that read naturally around a person's name,
 * so we keep the variant pool here where the consumer (the
 * celebrity arena + share card) lives.
 */

import {
  bandForAccuracy,
  generateReactionMessage,
  scoreToAccuracyPct,
  type AccuracyBand,
  type Outcome,
} from "./SarcasticMessageGenerator";

const WIN_VARIANTS: readonly string[] = [
  "Impressed — you actually got into character.",
  "Method-acting moment. The resemblance is uncanny.",
  "Even the source material would approve.",
  "Acting chops: delivered. The look was on point.",
  "You wore the expression like it was yours.",
  "Spot on. The original would be proud.",
];

const CLOSE_WIN_VARIANTS: readonly string[] = [
  "Won by a hair. Channel the same energy next time.",
  "Narrow win, big grin. Don't let it go to your head.",
  "Held it together at the right moment. Chef's kiss.",
];

const LOW_SCORE_WIN_VARIANTS: readonly string[] = [
  "Won ugly, but the win counts. Aim higher next round.",
  "The bar was underground and you cleared it. Barely.",
  "Both performances needed coffee. You needed it less.",
];

const LOSS_VARIANTS: readonly string[] = [
  "The original remains undefeated. For now.",
  "Mimic? Maybe. Method actor? Not yet.",
  "Got the spirit, missed the details. Try again.",
  "Acting class is in session. The source material is the homework.",
  "The resemblance was, uh, conceptual at best.",
  "Emote harder. The camera noticed nothing.",
];

const CLOSE_LOSS_VARIANTS: readonly string[] = [
  "Lost by a hair. Same face, different hairline.",
  "So close. So, so close. The mirror believes in you.",
  "Lost in the final frame. Recalibrate, reload, retry.",
];

const HEAVY_LOSS_VARIANTS: readonly string[] = [
  "The original stays in the Louvre. You went to amateur hour.",
  "That's not a mimic, that's a rough draft.",
  "Lost by a landslide. The mountain didn't move.",
];

const DRAW_VARIANTS: readonly string[] = [
  "Identical scores. Identically confused faces.",
  "Tied. The audience is also confused.",
  "Stalemate. The celebrity is laughing at both of you.",
];

function pickFrom(pool: readonly string[], recent: string[]): string {
  if (pool.length === 0) return "";
  const usable = pool.filter((line) => !recent.includes(line));
  const chosen = usable[Math.floor(Math.random() * usable.length)] ?? pool[0];
  return chosen;
}

export interface CelebrityReactionArgs {
  outcome: Outcome;
  band: AccuracyBand;
  delta: number;
  /** Whether to render a celebrity-aware line. */
  withCelebrityPrefix: boolean;
}

export function generateCelebrityReaction(args: CelebrityReactionArgs): string {
  const { outcome, band, delta, withCelebrityPrefix } = args;
  const recent = (typeof window !== "undefined"
    ? ((window as unknown as { __emoggleCelebrityReactionRecent?: string[] }).__emoggleCelebrityReactionRecent ?? [])
    : []) as string[];

  let pool: readonly string[];
  if (outcome === "draw") pool = DRAW_VARIANTS;
  else if (outcome === "win") {
    if (band === "excellent" || band === "good") pool = WIN_VARIANTS;
    else if (band === "average" || band === "poor" || band === "veryPoor") pool = LOW_SCORE_WIN_VARIANTS;
    else if (Math.abs(delta) < 1) pool = CLOSE_WIN_VARIANTS;
    else pool = WIN_VARIANTS;
  } else {
    if (Math.abs(delta) > 3) pool = HEAVY_LOSS_VARIANTS;
    else if (Math.abs(delta) < 1) pool = CLOSE_LOSS_VARIANTS;
    else pool = LOSS_VARIANTS;
  }

  const line = pickFrom(pool, recent);
  if (typeof window !== "undefined") {
    const w = window as unknown as { __emoggleCelebrityReactionRecent?: string[] };
    const next = [line, ...recent].slice(0, 6);
    w.__emoggleCelebrityReactionRecent = next;
  }
  return withCelebrityPrefix ? line : line;
}

export { bandForAccuracy, scoreToAccuracyPct, generateReactionMessage };
export type { AccuracyBand, Outcome };
