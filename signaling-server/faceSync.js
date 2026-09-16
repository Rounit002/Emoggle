/**
 * faceSync
 * --------
 * Server-side half of FaceSync: validate two client-supplied
 * geometry vectors, turn them into one similarity score, and pick
 * the band and copy variant both players will see.
 *
 * Why this is on the server at all. Each client measures its own
 * face from its own camera, because the WebRTC copy of the
 * partner's video is compressed and lower-resolution — if each
 * side measured the other, the two would legitimately disagree and
 * the players would see different numbers. Combining here means
 * one calculation, one result, broadcast to both. It also means a
 * client never sends a score, only raw geometry, so there is
 * nothing to forge except a face shape.
 *
 * What the vectors are. Twenty coarse ratios (face width over eye
 * span, nose width, where the eye line sits vertically, and so on),
 * described in `frontend/app/lib/faceSync/geometry.ts`. They are
 * not images, not the 478-point mesh, and not a biometric template
 * — you cannot recognise or reconstruct anyone from them. They are
 * held on the match object in memory, never written to the
 * database, never logged, and dropped with the match.
 *
 * Nothing here looks at, infers, or could infer skin tone,
 * ethnicity, gender or age. The inputs are distance ratios between
 * landmark points and there is no path from those to demographics.
 */

"use strict";

/** Must match FACE_VECTOR_LENGTH in the frontend types. */
const FACE_VECTOR_LENGTH = 20;
const FACE_VECTOR_MIN = -4;
const FACE_VECTOR_MAX = 4;

/*
 * Per-feature calibration, positionally aligned with the vector the
 * extractor builds. `typical` values come from
 * `frontend/scripts/facesync-probe.ts` — rerun it if the feature
 * list changes.
 *
 *  typical - the value a neutral reference face produces. Only used
 *            to turn the coefficient of variation into an absolute
 *            tolerance, so it does not need to be exact.
 *  cv      - how much this ratio varies between people, as a
 *            fraction of `typical`. Human facial proportions
 *            generally vary by something like 5-12%; the looser
 *            numbers here are the features that are also noisier to
 *            measure.
 *  weight  - how much the feature counts.
 *
 * Weighting is split along one line: can a muscle move it?
 * The cranial features (skull width, eye and brow SPACING, nose,
 * the upper-face proportions) are rigid and carry full weight.
 * Anything the jaw, lips or brows can move carries a fraction of
 * it, so that smiling or gasping mid-scan shifts the score by a few
 * points rather than tens. Face height is in the middle: a genuine
 * structural feature whose lower endpoint happens to be the chin.
 *
 * Brow HEIGHT is the one to watch. It is pure frontalis-muscle soft
 * tissue and the most expression-labile measurement on a face: a
 * raised eyebrow moved it nearly three population sigmas in
 * testing, which at a skeletal weight cost twenty points on its
 * own. It is damped hard and given a wide tolerance. Brow SPACING,
 * which is horizontal and bony, keeps its full weight.
 */
const FEATURES = [
  { name: "faceWidth",      typical: 1.600, cv: 0.075, weight: 1.0 },
  { name: "faceHeight",     typical: 1.856, cv: 0.080, weight: 0.7 },
  { name: "jawWidth",       typical: 1.111, cv: 0.090, weight: 0.8 },
  { name: "cheekWidth",     typical: 1.378, cv: 0.085, weight: 1.0 },
  { name: "foreheadWidth",  typical: 1.378, cv: 0.090, weight: 1.0 },
  { name: "innerEyeDist",   typical: 0.356, cv: 0.100, weight: 1.0 },
  { name: "eyeWidthMean",   typical: 0.332, cv: 0.095, weight: 1.0 },
  { name: "canthalTilt",    typical: 0.030, cv: 0.700, weight: 0.5 },
  { name: "noseWidth",      typical: 0.378, cv: 0.095, weight: 1.0 },
  { name: "noseLength",     typical: 0.534, cv: 0.100, weight: 1.0 },
  { name: "noseProjection", typical: 0.415, cv: 0.130, weight: 0.7 },
  { name: "mouthWidth",     typical: 0.578, cv: 0.100, weight: 0.30 },
  { name: "upperLipToNose", typical: 0.179, cv: 0.150, weight: 0.30 },
  { name: "chinHeight",     typical: 0.338, cv: 0.140, weight: 0.35 },
  { name: "browSpacing",    typical: 0.311, cv: 0.130, weight: 0.9 },
  { name: "browToEye",      typical: 0.317, cv: 0.220, weight: 0.25 },
  { name: "browArch",       typical: 0.066, cv: 0.380, weight: 0.30 },
  { name: "upperFaceFrac",  typical: 0.660, cv: 0.070, weight: 1.0 },
  { name: "midFaceFrac",    typical: 0.514, cv: 0.080, weight: 1.0 },
  { name: "lowerFaceRatio", typical: 0.523, cv: 0.110, weight: 0.30 },
];

/** Absolute per-feature tolerance, precomputed. */
const TOLERANCE = FEATURES.map((f) => Math.max(f.typical * f.cv, 1e-4));
const WEIGHT_TOTAL = FEATURES.reduce((sum, f) => sum + f.weight, 0);

/*
 * Distance-to-score curve: score = 100 * exp(-(D / CURVE_A) ^ CURVE_B).
 *
 * D is a weighted RMS of per-feature differences measured in
 * tolerances, so two unrelated faces land near sqrt(2) by
 * construction: each feature is roughly one population sigma from
 * the mean, and the difference of two such draws has variance 2.
 *
 * The constants are solved from three anchor points chosen for how
 * the feature should FEEL rather than for statistical purity:
 *
 *   D = 0.40  ->  90   two very similar face shapes
 *   D = 1.41  ->  53   two unrelated strangers
 *   D = 2.50  ->  24   two conspicuously different faces
 *
 * The middle anchor is the important one. A statistically "honest"
 * curve would put the median stranger near 10-20%, and then almost
 * every round shows a dud number and nobody plays with it twice.
 * Sitting the median just under half keeps the tail interesting
 * while the geometry still fully determines where in the range a
 * given pair lands.
 *
 * CURVE_A is the single knob for generosity: raising it lifts the
 * whole distribution without changing any pair's RANK, so the
 * geometry still decides who scores higher than whom. It was
 * chosen by sweeping band occupancy across a synthetic population
 * (frontend/scripts/facesync-curve-sweep.ts), which lands the
 * median near 47. That population contains no genuine lookalikes
 * by construction, so it says nothing about how often the top
 * bands come up in the wild — only real traffic can tune that.
 */
const CURVE_A = 1.90;
const CURVE_B = 1.405;

/** Never show a 0 (needlessly mean) or a 100 (overclaims). */
const SCORE_MIN = 3;
const SCORE_MAX = 99;

/** Band thresholds, lower bound inclusive. Ordered high to low. */
const BANDS = [
  { min: 95, category: "copy_paste" },
  { min: 85, category: "twin_energy" },
  { min: 75, category: "same_bloodline" },
  { min: 65, category: "cousin_energy" },
  { min: 50, category: "kinda_see_it" },
  { min: 35, category: "distant_cousin" },
  { min: 20, category: "not_related" },
  { min: 0, category: "different_universes" },
];

/**
 * Validate a vector off the wire.
 *
 * Returns the vector or null. Everything is checked: a client can
 * send anything at all, and a NaN slipped into one component would
 * propagate through the distance and out to both players.
 */
function readFaceVector(value) {
  if (!Array.isArray(value)) return null;
  if (value.length !== FACE_VECTOR_LENGTH) return null;
  const out = new Array(FACE_VECTOR_LENGTH);
  for (let i = 0; i < FACE_VECTOR_LENGTH; i += 1) {
    const component = value[i];
    if (typeof component !== "number" || !Number.isFinite(component)) return null;
    if (component < FACE_VECTOR_MIN || component > FACE_VECTOR_MAX) return null;
    out[i] = component;
  }
  return out;
}

/**
 * Weighted RMS distance between two validated vectors, in units of
 * per-feature population spread.
 */
function vectorDistance(a, b) {
  let total = 0;
  for (let i = 0; i < FACE_VECTOR_LENGTH; i += 1) {
    const z = (a[i] - b[i]) / TOLERANCE[i];
    total += FEATURES[i].weight * z * z;
  }
  return Math.sqrt(total / WEIGHT_TOTAL);
}

function categoryForScore(score) {
  for (const band of BANDS) {
    if (score >= band.min) return band.category;
  }
  return "different_universes";
}

/**
 * Turn two geometry vectors into the result both players see.
 *
 * Symmetric by construction — `vectorDistance` only reads the
 * absolute difference per component — so it cannot matter which
 * player's vector arrives first.
 *
 * `variantSeed` picks the line of copy. It is derived from the
 * match id by the caller so both players read the same joke and a
 * rematch with the same score does not repeat it.
 */
function computeFaceSync(vectorA, vectorB, variantSeed = 0) {
  const a = readFaceVector(vectorA);
  const b = readFaceVector(vectorB);
  if (!a || !b) return null;

  const distance = vectorDistance(a, b);
  if (!Number.isFinite(distance)) return null;

  const raw = 100 * Math.exp(-Math.pow(distance / CURVE_A, CURVE_B));
  const score = Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(raw)));

  return {
    score,
    category: categoryForScore(score),
    variant: Math.abs(Math.trunc(variantSeed)) % 997,
  };
}

/** Stable small integer from a match id, for the copy variant. */
function variantSeedFromMatchId(matchId) {
  if (typeof matchId !== "string" || matchId.length === 0) return 0;
  let hash = 2166136261;
  for (let i = 0; i < matchId.length; i += 1) {
    hash ^= matchId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

module.exports = {
  FACE_VECTOR_LENGTH,
  FACE_VECTOR_MIN,
  FACE_VECTOR_MAX,
  readFaceVector,
  vectorDistance,
  computeFaceSync,
  categoryForScore,
  variantSeedFromMatchId,
  // Exposed for the calibration test only.
  __FEATURES: FEATURES,
  __CURVE: { CURVE_A, CURVE_B, SCORE_MIN, SCORE_MAX },
};
