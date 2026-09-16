const assert = require("node:assert/strict");
const test = require("node:test");

const {
  FACE_VECTOR_LENGTH,
  readFaceVector,
  vectorDistance,
  computeFaceSync,
  categoryForScore,
  variantSeedFromMatchId,
  __CURVE,
} = require("../faceSync");

/** A plausible neutral vector, positionally matching the extractor. */
const NEUTRAL = [
  1.60, 1.86, 1.19, 1.39, 1.39, 0.36, 0.32, 0.02, 0.38, 0.52,
  0.35, 0.58, 0.17, 0.30, 0.31, 0.30, 0.07, 0.43, 0.40, 0.55,
];

const shift = (vector, factor) => vector.map((value) => value * factor);

/* ─── Input validation ─────────────────────────────────────────── */

test("accepts a well-formed vector", () => {
  assert.deepEqual(readFaceVector(NEUTRAL), NEUTRAL);
});

test("rejects anything that is not a vector of the right length", () => {
  assert.equal(readFaceVector(null), null);
  assert.equal(readFaceVector(undefined), null);
  assert.equal(readFaceVector("not a vector"), null);
  assert.equal(readFaceVector(42), null);
  assert.equal(readFaceVector({ 0: 1, length: FACE_VECTOR_LENGTH }), null);
  assert.equal(readFaceVector([]), null);
  assert.equal(readFaceVector(NEUTRAL.slice(0, -1)), null);
  assert.equal(readFaceVector([...NEUTRAL, 0.5]), null);
});

test("rejects non-finite and out-of-range components", () => {
  const withNaN = [...NEUTRAL];
  withNaN[7] = Number.NaN;
  assert.equal(readFaceVector(withNaN), null);

  const withInfinity = [...NEUTRAL];
  withInfinity[3] = Number.POSITIVE_INFINITY;
  assert.equal(readFaceVector(withInfinity), null);

  const withString = [...NEUTRAL];
  withString[0] = "1.6";
  assert.equal(readFaceVector(withString), null);

  const tooBig = [...NEUTRAL];
  tooBig[1] = 9999;
  assert.equal(readFaceVector(tooBig), null);

  const tooSmall = [...NEUTRAL];
  tooSmall[1] = -9999;
  assert.equal(readFaceVector(tooSmall), null);
});

test("a malformed vector produces no result rather than a bad one", () => {
  assert.equal(computeFaceSync(NEUTRAL, null), null);
  assert.equal(computeFaceSync(null, NEUTRAL), null);
  assert.equal(computeFaceSync(NEUTRAL, [1, 2, 3]), null);
  assert.equal(computeFaceSync("x", "y"), null);
});

/* ─── The score itself ─────────────────────────────────────────── */

test("identical geometry scores at the ceiling", () => {
  const result = computeFaceSync(NEUTRAL, NEUTRAL, 0);
  assert.equal(result.score, __CURVE.SCORE_MAX);
  assert.equal(result.category, "copy_paste");
});

test("distance to an identical vector is zero", () => {
  assert.equal(vectorDistance(NEUTRAL, NEUTRAL), 0);
});

test("the score is symmetric in its arguments", () => {
  // Both players must see the same number, so argument order can
  // never matter - not for the score, the band, or the copy.
  for (const factor of [1.02, 1.08, 1.2, 0.85]) {
    const other = shift(NEUTRAL, factor);
    const forward = computeFaceSync(NEUTRAL, other, 7);
    const backward = computeFaceSync(other, NEUTRAL, 7);
    assert.deepEqual(forward, backward, `asymmetric at factor ${factor}`);
  }
});

test("the score falls monotonically as the faces diverge", () => {
  let previous = Number.POSITIVE_INFINITY;
  for (const factor of [1.0, 1.02, 1.05, 1.1, 1.2, 1.35, 1.6]) {
    const result = computeFaceSync(NEUTRAL, shift(NEUTRAL, factor), 0);
    assert.ok(
      result.score <= previous,
      `score rose from ${previous} to ${result.score} at factor ${factor}`,
    );
    previous = result.score;
  }
});

test("the score always lands inside the published range", () => {
  const extremes = [
    [NEUTRAL, NEUTRAL],
    [NEUTRAL, shift(NEUTRAL, 2.0)],
    [NEUTRAL, shift(NEUTRAL, 0.42)],
    [new Array(FACE_VECTOR_LENGTH).fill(-4), new Array(FACE_VECTOR_LENGTH).fill(4)],
    [new Array(FACE_VECTOR_LENGTH).fill(0), new Array(FACE_VECTOR_LENGTH).fill(0)],
  ];
  for (const [a, b] of extremes) {
    const result = computeFaceSync(a, b, 0);
    assert.ok(result, "expected a result");
    assert.ok(Number.isInteger(result.score), `non-integer score ${result.score}`);
    assert.ok(
      result.score >= __CURVE.SCORE_MIN && result.score <= __CURVE.SCORE_MAX,
      `score ${result.score} outside ${__CURVE.SCORE_MIN}-${__CURVE.SCORE_MAX}`,
    );
  }
});

test("wildly different geometry never scores 0 or 100", () => {
  const worst = computeFaceSync(
    new Array(FACE_VECTOR_LENGTH).fill(-4),
    new Array(FACE_VECTOR_LENGTH).fill(4),
    0,
  );
  assert.ok(worst.score > 0, "a 0% would be needlessly mean");
  assert.equal(worst.category, "different_universes");

  const best = computeFaceSync(NEUTRAL, NEUTRAL, 0);
  assert.ok(best.score < 100, "a 100% would overclaim");
});

/* ─── Bands ────────────────────────────────────────────────────── */

test("every score maps to exactly one band", () => {
  for (let score = 0; score <= 100; score += 1) {
    const category = categoryForScore(score);
    assert.ok(typeof category === "string" && category.length > 0, `no band for ${score}`);
  }
});

test("band boundaries land where the spec puts them", () => {
  assert.equal(categoryForScore(0), "different_universes");
  assert.equal(categoryForScore(19), "different_universes");
  assert.equal(categoryForScore(20), "not_related");
  assert.equal(categoryForScore(34), "not_related");
  assert.equal(categoryForScore(35), "distant_cousin");
  assert.equal(categoryForScore(49), "distant_cousin");
  assert.equal(categoryForScore(50), "kinda_see_it");
  assert.equal(categoryForScore(64), "kinda_see_it");
  assert.equal(categoryForScore(65), "cousin_energy");
  assert.equal(categoryForScore(74), "cousin_energy");
  assert.equal(categoryForScore(75), "same_bloodline");
  assert.equal(categoryForScore(84), "same_bloodline");
  assert.equal(categoryForScore(85), "twin_energy");
  assert.equal(categoryForScore(94), "twin_energy");
  assert.equal(categoryForScore(95), "copy_paste");
  assert.equal(categoryForScore(100), "copy_paste");
});

/* ─── Copy variant ─────────────────────────────────────────────── */

test("the copy variant is stable for a match and varies between them", () => {
  const seed = variantSeedFromMatchId("11111111-2222-3333-4444-555555555555");
  assert.equal(seed, variantSeedFromMatchId("11111111-2222-3333-4444-555555555555"));
  assert.notEqual(seed, variantSeedFromMatchId("11111111-2222-3333-4444-555555555556"));
  assert.ok(Number.isInteger(seed) && seed >= 0);

  assert.equal(variantSeedFromMatchId(null), 0);
  assert.equal(variantSeedFromMatchId(""), 0);
  assert.equal(variantSeedFromMatchId(12345), 0);
});

test("variants spread across the copy lists rather than clustering", () => {
  // Five lines per band; a hash that only ever produced one or two
  // of them would make the feature feel canned.
  const seen = new Set();
  for (let i = 0; i < 400; i += 1) {
    const seed = variantSeedFromMatchId(`match-${i}-${i * 7919}`);
    const result = computeFaceSync(NEUTRAL, NEUTRAL, seed);
    seen.add(result.variant % 5);
  }
  assert.equal(seen.size, 5, `only hit ${seen.size} of 5 lines`);
});

test("the variant is a small non-negative integer", () => {
  for (const seed of [0, 1, -12, 2 ** 31, Number.MAX_SAFE_INTEGER]) {
    const result = computeFaceSync(NEUTRAL, NEUTRAL, seed);
    assert.ok(Number.isInteger(result.variant), `non-integer ${result.variant}`);
    assert.ok(result.variant >= 0 && result.variant < 997, `out of range ${result.variant}`);
  }
});
