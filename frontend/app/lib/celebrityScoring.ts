/**
 * celebrityScoring
 * ----------------
 * Local-only expression-imitation scoring for the Celebrity Face
 * Mimic mode. Both clients compute their own score from their
 * own webcam feed; the server never sees raw video frames.
 *
 * Design goals
 *  - Robust across different face shapes, camera distances,
 *    lighting conditions, and genders. All measurements are
 *    normalized by the player's own face scale so a wider face
 *    or a closer camera doesn't unfairly inflate the score.
 *  - Strictly compares EXPRESSION GEOMETRY — we never attempt
 *    identity recognition. A user imitating a wide-smile
 *    celebrity with a wide smile should score the same as a
 *    user with a narrower face doing the same smile.
 *  - Pure math. The 478-point MediaPipe Face Mesh gives us
 *    stable anchor landmarks for the eyes, mouth, eyebrows
 *    and face bounding box. No AI vision API, no model file
 *    beyond the existing MediaPipe Face Landmarker already
 *    initialized in `MediaPipeFaceContext`.
 *  - Score is a smooth, bounded 0..10 number (0 = very poor
 *    match, 10 = extremely close match). It updates every
 *    frame during the 10s mimic phase; the player's *peak*
 *    valid score across the round is the final submitted
 *    score.
 *
 * Target profiles
 *  Each celebrity has a target `ExpressionProfile` in the
 *  0..1 range for every metric. The same module exposes
 *  default profiles based on `difficulty` and `category` so
 *  rows that don't have a hand-curated profile still produce
 *  a meaningful, deterministic target. Rows that DO have
 *  pre-computed `facial_landmarks` (full 478-point array)
 *  are converted to a profile on the fly.
 */

import type { FaceLandmark } from "../hooks/useExpressionScorer";

/**
 * The target expression profile we compare each live frame
 * against. Every field is in the 0..1 range. A value of 0
 * means "not present", 1 means "extreme". The scorer is
 * symmetric — under- and over-shooting both reduce the score.
 */
export interface ExpressionProfile {
  /** Mouth vertical opening (inner upper lip to inner lower lip). 0=closed, 1=jaw fully dropped. */
  mouthOpen: number;
  /** Mouth horizontal width relative to face scale. 0=narrow, 1=wide grin. */
  mouthWidth: number;
  /** Mouth corner lift (smile curvature). 0=neutral/flat, 1=extreme grin. */
  mouthSmile: number;
  /** Mouth corner drop (frown). 0=neutral, 1=extreme frown. */
  mouthFrown: number;
  /** Average eye opening. 0=fully closed, 1=very wide. */
  eyeOpen: number;
  /** Eye squint (eyes mostly closed in a happy squint). 0=not squinting, 1=fully squinted. */
  eyeSquint: number;
  /** Brow raise distance above neutral. 0=neutral, 1=fully raised. */
  browRaise: number;
  /** Brow drop / inner-brow drop (anger). 0=neutral, 1=fully knit. */
  browDown: number;
  /** Lip pucker (kissing face). 0=neutral, 1=fully puckered. */
  lipPucker: number;
}

/**
 * The metric weight set we use to combine the per-axis
 * distances into a single 0..10 score. The defaults
 * emphasise the mouth (the most expressive part of a
 * celebrity photo) while still rewarding eye + brow shape.
 */
export interface ExpressionWeights {
  mouthOpen: number;
  mouthWidth: number;
  mouthSmile: number;
  mouthFrown: number;
  eyeOpen: number;
  eyeSquint: number;
  browRaise: number;
  browDown: number;
  lipPucker: number;
}

export const DEFAULT_WEIGHTS: ExpressionWeights = {
  mouthOpen: 1.0,
  mouthWidth: 0.6,
  mouthSmile: 0.9,
  mouthFrown: 0.6,
  eyeOpen: 0.7,
  eyeSquint: 0.7,
  browRaise: 0.6,
  browDown: 0.5,
  lipPucker: 0.5,
};

export const DIFFICULTY = {
  easy: "easy",
  medium: "medium",
  hard: "hard",
} as const;
export type Difficulty = (typeof DIFFICULTY)[keyof typeof DIFFICULTY];

export const CATEGORY = {
  meme: "meme",
  celebrity: "celebrity",
  character: "character",
} as const;
export type Category = (typeof CATEGORY)[keyof typeof CATEGORY];

/** Celebrity target row as returned by the signaling server. */
export interface CelebrityTarget {
  id: number;
  name: string;
  category: Category | string;
  imageUrl: string;
  difficulty: Difficulty | string;
  /** Optional hand-curated 0..1 target profile. */
  expressionProfile?: ExpressionProfile | null;
  /** Optional pre-computed MediaPipe Face Mesh landmarks. */
  facialLandmarks?: FaceLandmark[] | null;
}

/* ─── Live-frame metrics ──────────────────────────────────────────── */

function dist(a: FaceLandmark, b: FaceLandmark) {
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.hypot(a.x - b.x, a.y - b.y, dz);
}

function point(landmarks: FaceLandmark[], index: number): FaceLandmark | null {
  return landmarks[index] ?? null;
}

/** Average of the requested Y coordinates. Returns null when empty. */
function avgY(landmarks: FaceLandmark[], indexes: number[]): number | null {
  const values: number[] = [];
  for (const index of indexes) {
    const p = point(landmarks, index);
    if (p) values.push(p.y);
  }
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** A face-scale denominator. Temple-to-temple is the most
 *  camera-distance-invariant width measure; chin-to-forehead
 *  is the fallback when temples aren't visible. */
function faceScale(landmarks: FaceLandmark[]): number {
  const leftTemple = point(landmarks, 234);
  const rightTemple = point(landmarks, 454);
  const width = leftTemple && rightTemple ? dist(leftTemple, rightTemple) : 0;
  if (width > 0) return width;
  const faceTop = point(landmarks, 10);
  const faceBottom = point(landmarks, 152);
  if (faceTop && faceBottom) return dist(faceTop, faceBottom);
  // Worst-case fallback so the scorer never divides by zero.
  return 1;
}

/* Normalization constants, calibrated from a wide range of
 * MediaPipe samples. These are the *face-scale-normalized*
 * values we expect to see at the extremes (0 and 1). Anything
 * outside the range is clamped. */
const MOUTH_OPEN_AT_FULL = 0.22; // dist(13,14) / faceScale
const MOUTH_WIDTH_AT_FULL = 0.50; // dist(61,291) / faceScale
const MOUTH_SMILE_AT_FULL = 0.06; // corner lift / faceScale
const MOUTH_FROWN_AT_FULL = 0.08; // corner drop / faceScale
const EYE_OPEN_AT_FULL = 0.10; // dist(159,145) / faceScale
const EYE_SQUINT_AT_FULL = 0.025; // tiny vertical eye opening
const BROW_RAISE_AT_FULL = 0.18; // eye_y - brow_y / faceScale
const BROW_DOWN_AT_FULL = 0.10; // brow_y - eye_y / faceScale
const LIP_PUCKER_AT_FULL = 0.32; // (width compression + upper-lip protrusion proxy)

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalize(raw: number, fullAt: number): number {
  if (fullAt <= 0) return 0;
  return clamp01(raw / fullAt);
}

/** Live-frame expression metrics, all normalized to 0..1. */
export interface LiveExpressionMetrics {
  mouthOpen: number;
  mouthWidth: number;
  mouthSmile: number;
  mouthFrown: number;
  eyeOpen: number;
  eyeSquint: number;
  browRaise: number;
  browDown: number;
  lipPucker: number;
}

export function extractLiveMetrics(landmarks: FaceLandmark[]): LiveExpressionMetrics {
  if (!landmarks?.length) {
    return {
      mouthOpen: 0,
      mouthWidth: 0,
      mouthSmile: 0,
      mouthFrown: 0,
      eyeOpen: 0,
      eyeSquint: 0,
      browRaise: 0,
      browDown: 0,
      lipPucker: 0,
    };
  }

  const scale = faceScale(landmarks);

  // Mouth opening — inner upper lip (13) to inner lower lip (14).
  const upperLip = point(landmarks, 13);
  const lowerLip = point(landmarks, 14);
  const mouthOpen = upperLip && lowerLip ? dist(upperLip, lowerLip) / scale : 0;

  // Mouth width — left corner (61) to right corner (291).
  const leftCorner = point(landmarks, 61);
  const rightCorner = point(landmarks, 291);
  const mouthWidth = leftCorner && rightCorner ? dist(leftCorner, rightCorner) / scale : 0;

  // Smile / frown — corner position relative to upper-lip midpoint.
  // A positive (mouth corner above upper lip) means smile; negative
  // means frown. We use the absolute lift to drive both axes, then
  // split the sign into smile vs frown.
  let smile = 0;
  let frown = 0;
  if (leftCorner && rightCorner && upperLip) {
    const leftLift = (upperLip.y - leftCorner.y) / scale;
    const rightLift = (upperLip.y - rightCorner.y) / scale;
    const avgLift = (leftLift + rightLift) / 2;
    if (avgLift > 0) smile = avgLift;
    else frown = -avgLift;
  }

  // Eye openness — averaged left/right.
  const leftEyeTop = point(landmarks, 159);
  const leftEyeBottom = point(landmarks, 145);
  const rightEyeTop = point(landmarks, 386);
  const rightEyeBottom = point(landmarks, 374);
  const leftEye =
    leftEyeTop && leftEyeBottom ? dist(leftEyeTop, leftEyeBottom) / scale : 0;
  const rightEye =
    rightEyeTop && rightEyeBottom ? dist(rightEyeTop, rightEyeBottom) / scale : 0;
  const eyeOpen = (leftEye + rightEye) / 2;
  // Squint: the OPENING of a happy squint is small but the eye is
  // still *open* (not fully closed). We treat eye-open values below
  // the squint threshold as proportional squint, with eyeOpen itself
  // being the canonical openness measurement.
  const eyeSquint = eyeOpen > 0 && eyeOpen < EYE_OPEN_AT_FULL
    ? clamp01(1 - (eyeOpen - EYE_SQUINT_AT_FULL) / (EYE_OPEN_AT_FULL - EYE_SQUINT_AT_FULL))
    : 0;

  // Brow raise / drop — distance between eye centerline and brow centerline.
  // Positive (brow above eye, smaller y) = raise; negative = drop.
  const leftEyeY = avgY(landmarks, [145, 159]);
  const rightEyeY = avgY(landmarks, [374, 386]);
  const leftBrowY = avgY(landmarks, [70, 63, 105, 107]);
  const rightBrowY = avgY(landmarks, [300, 336, 296, 334]);
  let browRaise = 0;
  let browDown = 0;
  if (leftEyeY !== null && rightEyeY !== null && leftBrowY !== null && rightBrowY !== null) {
    const eyeY = (leftEyeY + rightEyeY) / 2;
    const browY = (leftBrowY + rightBrowY) / 2;
    const gap = (eyeY - browY) / scale; // positive => brow is above eye (raise)
    if (gap > 0) browRaise = gap;
    else browDown = -gap;
  }

  // Lip pucker — approximated by mouth width compression + the
  // vertical distance between the upper and lower lip. A puckered
  // mouth is BOTH narrower AND more closed than a neutral one.
  // We measure the inverse relationship against the canonical
  // "neutral" (width = ~0.32, opening = ~0.04) and combine.
  const puckerWidth = mouthWidth > 0
    ? clamp01(1 - (mouthWidth - 0.2) / (0.45 - 0.2))
    : 0;
  const puckerOpen = clamp01(1 - mouthOpen / 0.10);
  const lipPucker = clamp01(puckerWidth * 0.6 + puckerOpen * 0.4);

  return {
    mouthOpen: normalize(mouthOpen, MOUTH_OPEN_AT_FULL),
    mouthWidth: normalize(mouthWidth, MOUTH_WIDTH_AT_FULL),
    mouthSmile: normalize(smile, MOUTH_SMILE_AT_FULL),
    mouthFrown: normalize(frown, MOUTH_FROWN_AT_FULL),
    eyeOpen: normalize(eyeOpen, EYE_OPEN_AT_FULL),
    eyeSquint: clamp01(eyeSquint),
    browRaise: normalize(browRaise, BROW_RAISE_AT_FULL),
    browDown: normalize(browDown, BROW_DOWN_AT_FULL),
    lipPucker: normalize(lipPucker, LIP_PUCKER_AT_FULL),
  };
}

/* ─── Target profile resolution ───────────────────────────────────── */

/** The Neutral target — used as a deterministic fallback when no
 *  profile can be derived from the celebrity row. A user that
 *  makes a "neutral face" scores ~5/10 against a Neutral target. */
export const NEUTRAL_PROFILE: ExpressionProfile = {
  mouthOpen: 0.0,
  mouthWidth: 0.32,
  mouthSmile: 0.0,
  mouthFrown: 0.0,
  eyeOpen: 0.45,
  eyeSquint: 0.0,
  browRaise: 0.0,
  browDown: 0.0,
  lipPucker: 0.0,
};

/**
 * Resolve the final `ExpressionProfile` for a celebrity.
 *
 *  1. If the row carries a hand-curated `expressionProfile`, use it.
 *  2. If the row carries pre-computed `facialLandmarks`, derive the
 *     same `LiveExpressionMetrics` shape we extract from the live
 *     feed and treat it as the target.
 *  3. Otherwise fall back to a deterministic, category/difficulty
 *     tuned default so every celebrity still has a target. The
 *     defaults are documented in `CELEBRITY_DEFAULT_PROFILES` so
 *     anyone adding a new row can see the resulting target.
 */
export function resolveExpressionProfile(target: CelebrityTarget): ExpressionProfile {
  if (target.expressionProfile && isValidProfile(target.expressionProfile)) {
    return clampProfile(target.expressionProfile);
  }
  if (Array.isArray(target.facialLandmarks) && target.facialLandmarks.length > 0) {
    return clampProfile(extractLiveMetrics(target.facialLandmarks));
  }
  return CELEBRITY_DEFAULT_PROFILES[target.category]?.[target.difficulty] ?? NEUTRAL_PROFILE;
}

function isValidProfile(p: unknown): p is ExpressionProfile {
  if (!p || typeof p !== "object") return false;
  const r = p as Record<string, unknown>;
  const keys: (keyof ExpressionProfile)[] = [
    "mouthOpen",
    "mouthWidth",
    "mouthSmile",
    "mouthFrown",
    "eyeOpen",
    "eyeSquint",
    "browRaise",
    "browDown",
    "lipPucker",
  ];
  return keys.every((k) => typeof r[k] === "number" && Number.isFinite(r[k] as number));
}

function clampProfile(p: ExpressionProfile): ExpressionProfile {
  return {
    mouthOpen: clamp01(p.mouthOpen),
    mouthWidth: clamp01(p.mouthWidth),
    mouthSmile: clamp01(p.mouthSmile),
    mouthFrown: clamp01(p.mouthFrown),
    eyeOpen: clamp01(p.eyeOpen),
    eyeSquint: clamp01(p.eyeSquint),
    browRaise: clamp01(p.browRaise),
    browDown: clamp01(p.browDown),
    lipPucker: clamp01(p.lipPucker),
  };
}

/**
 * Deterministic fallback targets keyed by category → difficulty.
 *
 * These are intentionally not "neutral" — each is the *kind* of
 * expression a typical meme/celebrity/character photo in that
 * bucket tends to capture, so a player who nails the spirit of
 * the picture still scores well even without per-row tuning.
 *
 *   easy   — extreme, easy-to-spot features (big mouth, big eyes)
 *   medium — moderate, balanced expressions
 *   hard   — subtle / mixed signals
 */
export const CELEBRITY_DEFAULT_PROFILES: Record<
  string,
  Record<string, ExpressionProfile>
> = {
  meme: {
    easy: {
      mouthOpen: 0.0,
      mouthWidth: 0.55,
      mouthSmile: 0.65,
      mouthFrown: 0.0,
      eyeOpen: 0.55,
      eyeSquint: 0.0,
      browRaise: 0.4,
      browDown: 0.0,
      lipPucker: 0.0,
    },
    medium: {
      mouthOpen: 0.15,
      mouthWidth: 0.45,
      mouthSmile: 0.4,
      mouthFrown: 0.0,
      eyeOpen: 0.7,
      eyeSquint: 0.0,
      browRaise: 0.5,
      browDown: 0.0,
      lipPucker: 0.0,
    },
    hard: {
      mouthOpen: 0.05,
      mouthWidth: 0.35,
      mouthSmile: 0.0,
      mouthFrown: 0.25,
      eyeOpen: 0.5,
      eyeSquint: 0.0,
      browRaise: 0.0,
      browDown: 0.45,
      lipPucker: 0.0,
    },
  },
  celebrity: {
    easy: {
      mouthOpen: 0.2,
      mouthWidth: 0.55,
      mouthSmile: 0.55,
      mouthFrown: 0.0,
      eyeOpen: 0.6,
      eyeSquint: 0.0,
      browRaise: 0.3,
      browDown: 0.0,
      lipPucker: 0.0,
    },
    medium: {
      mouthOpen: 0.0,
      mouthWidth: 0.4,
      mouthSmile: 0.4,
      mouthFrown: 0.0,
      eyeOpen: 0.5,
      eyeSquint: 0.0,
      browRaise: 0.25,
      browDown: 0.0,
      lipPucker: 0.0,
    },
    hard: {
      mouthOpen: 0.0,
      mouthWidth: 0.42,
      mouthSmile: 0.6,
      mouthFrown: 0.0,
      eyeOpen: 0.4,
      eyeSquint: 0.4,
      browRaise: 0.55,
      browDown: 0.0,
      lipPucker: 0.0,
    },
  },
  character: {
    easy: {
      mouthOpen: 0.0,
      mouthWidth: 0.3,
      mouthSmile: 0.0,
      mouthFrown: 0.0,
      eyeOpen: 0.4,
      eyeSquint: 0.0,
      browRaise: 0.0,
      browDown: 0.0,
      lipPucker: 0.0,
    },
    medium: {
      mouthOpen: 0.0,
      mouthWidth: 0.45,
      mouthSmile: 0.55,
      mouthFrown: 0.0,
      eyeOpen: 0.55,
      eyeSquint: 0.0,
      browRaise: 0.5,
      browDown: 0.0,
      lipPucker: 0.0,
    },
    hard: {
      mouthOpen: 0.5,
      mouthWidth: 0.65,
      mouthSmile: 0.0,
      mouthFrown: 0.0,
      eyeOpen: 0.65,
      eyeSquint: 0.0,
      browRaise: 0.65,
      browDown: 0.0,
      lipPucker: 0.0,
    },
  },
};

/* ─── Scoring ─────────────────────────────────────────────────────── */

/** Per-axis score in the 0..1 range. Symmetric: |target - live|. */
function axisScore(target: number, live: number): number {
  const diff = Math.abs(target - live);
  // A perfect match (diff=0) yields 1. A diff of 0.5 (half the
  // unit range) already yields 0.25, and 0.6+ yields 0. The
  // curve is smooth so a single noisy frame can't create a
  // 0→10 spike, and a player can still improve their score
  // during the round.
  return clamp01(1 - diff * diff * 4);
}

/**
 * Compute the mimicry score for a single live frame.
 *
 * Returns a number in the 0..10 range. Returns `null` when
 * the frame is not scoreable (e.g. the caller passed no
 * landmarks) so the stable sampler can drop it.
 */
export function scoreCelebrityFrame(
  live: FaceLandmark[] | null,
  profile: ExpressionProfile,
  weights: ExpressionWeights = DEFAULT_WEIGHTS,
): number | null {
  if (!live || live.length === 0) return null;

  const metrics = extractLiveMetrics(live);
  const keys: (keyof ExpressionProfile)[] = [
    "mouthOpen",
    "mouthWidth",
    "mouthSmile",
    "mouthFrown",
    "eyeOpen",
    "eyeSquint",
    "browRaise",
    "browDown",
    "lipPucker",
  ];

  let totalWeight = 0;
  let weightedSum = 0;
  for (const key of keys) {
    const w = weights[key] ?? 0;
    if (w <= 0) continue;
    const axis = axisScore(profile[key], metrics[key]);
    weightedSum += axis * w;
    totalWeight += w;
  }
  if (totalWeight === 0) return null;

  const normalized = weightedSum / totalWeight;
  return Number((normalized * 10).toFixed(2));
}

/**
 * Lightweight no-landmark scorer used by the UI to decide
 * whether a frame should be ignored (no face) vs. just scored
 * low (face present but expression is far from the target).
 */
export function isScoreableFrame(landmarks: FaceLandmark[] | null): boolean {
  if (!landmarks || landmarks.length < 50) return false;
  // Require at least the canonical mouth + eye landmarks. If
  // any of these are missing the metric extraction would
  // silently zero out and the score would be artificially
  // low, so we drop the frame instead.
  const required = [13, 14, 61, 291, 145, 159, 374, 386, 70, 336, 10, 152];
  let hasMeaningfulX = false;
  let hasMeaningfulY = false;
  for (const index of required) {
    const p = landmarks[index];
    if (!p) return false;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    if (p.x > 0.05) hasMeaningfulX = true;
    if (p.y > 0.05) hasMeaningfulY = true;
  }
  // A face that is entirely clustered at the origin (0, 0) is
  // the classic "MediaPipe returned a half-formed detection"
  // state. Drop it so a sparse frame can't zero out the score.
  return hasMeaningfulX && hasMeaningfulY;
}

/* ─── Peak-scored aggregation ─────────────────────────────────────── */

/**
 * Aggregator that mirrors `useStableScoreSampler` but keeps
 * the BEST score across the round rather than the running
 * mean. The instructions call for "peak/best valid expression
 * score" — a single great frame should not be lost to a
 * few bad ones at the end of the round.
 */
export interface PeakScoreAccumulator {
  samples: number;
  peak: number;
  average: number;
}

export function createPeakAccumulator(): PeakScoreAccumulator {
  return { samples: 0, peak: 0, average: 0 };
}

export function pushPeakSample(
  acc: PeakScoreAccumulator,
  score: number,
): PeakScoreAccumulator {
  if (!Number.isFinite(score)) return acc;
  const samples = acc.samples + 1;
  const average = (acc.average * acc.samples + score) / samples;
  const peak = score > acc.peak ? score : acc.peak;
  return { samples, peak, average };
}

/** Round the final peak score to 1 decimal place to match the
 *  existing emoji-duel score format. */
export function finalizePeakScore(acc: PeakScoreAccumulator): number {
  if (acc.samples === 0) return 0;
  return Number(acc.peak.toFixed(1));
}
