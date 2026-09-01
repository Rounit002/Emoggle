/**
 * Unit checks for the celebrity scoring library. These run
 * without a server / DB / camera — just the pure math + a few
 * fake MediaPipe landmark arrays.
 *
 * Run with:
 *   npx tsx app/lib/celebrityScoring.test.ts
 *
 * The build doesn't depend on this passing — the file is a
 * smoke test, not a CI gate. It exists so anyone editing the
 * scoring weights or profile defaults can verify the surface
 * behaviour didn't accidentally collapse.
 */

import {
  extractLiveMetrics,
  scoreCelebrityFrame,
  isScoreableFrame,
  resolveExpressionProfile,
  createPeakAccumulator,
  pushPeakSample,
  finalizePeakScore,
  NEUTRAL_PROFILE,
  CELEBRITY_DEFAULT_PROFILES,
  type ExpressionProfile,
} from "./celebrityScoring";
import type { FaceLandmark } from "../hooks/useExpressionScorer";

function makeLandmark(x: number, y: number, z = 0): FaceLandmark {
  return { x, y, z };
}

function neutralLandmarks(scale = 0.2): FaceLandmark[] {
  // Build a synthetic 478-point array where the geometry roughly
  // matches the NEUTRAL_PROFILE defined in the library. The
  // numbers below are tuned so the live-metric extractor lands
  // inside the "good match" envelope of the target.
  const out: FaceLandmark[] = [];
  for (let i = 0; i < 478; i += 1) {
    out.push(makeLandmark(0.5, 0.5, 0));
  }
  out[10] = makeLandmark(0.5, 0.30, 0);
  out[152] = makeLandmark(0.5, 0.78, 0);
  out[234] = makeLandmark(0.5 - scale / 2, 0.45, 0);
  out[454] = makeLandmark(0.5 + scale / 2, 0.45, 0);
  // Mouth corners — set to a "neutral" width that, after
  // normalization against faceScale=0.2, gives mouthWidth ≈ 0.32
  // (the target's neutral mouthWidth).
  out[61] = makeLandmark(0.5 - 0.032, 0.55, 0);
  out[291] = makeLandmark(0.5 + 0.032, 0.55, 0);
  // Inner lips touching (closed mouth) → mouthOpen ≈ 0.
  out[13] = makeLandmark(0.5, 0.55, 0);
  out[14] = makeLandmark(0.5, 0.551, 0);
  // Eyes: a moderately open eye with a small vertical gap.
  out[159] = makeLandmark(0.42, 0.42, 0);
  out[145] = makeLandmark(0.42, 0.43, 0);
  out[386] = makeLandmark(0.58, 0.42, 0);
  out[374] = makeLandmark(0.58, 0.43, 0);
  // Brows directly above the eyes (no raise / drop).
  out[70] = makeLandmark(0.42, 0.42, 0);
  out[105] = makeLandmark(0.45, 0.42, 0);
  out[336] = makeLandmark(0.58, 0.42, 0);
  out[300] = makeLandmark(0.55, 0.42, 0);
  out[63] = makeLandmark(0.44, 0.42, 0);
  out[107] = makeLandmark(0.46, 0.42, 0);
  out[296] = makeLandmark(0.56, 0.42, 0);
  out[293] = makeLandmark(0.54, 0.42, 0);
  return out;
}

function openMouthLandmarks(): FaceLandmark[] {
  const lm = neutralLandmarks();
  // Drop the lower lip well below the upper lip so the open
  // mouth metric jumps to ~0.6 (a clear, large jaw drop).
  lm[14] = makeLandmark(0.5, 0.68, 0);
  return lm;
}

function smileLandmarks(): FaceLandmark[] {
  const lm = neutralLandmarks();
  // Lift the mouth corners above the upper-lip Y so the smile
  // metric is positive. We use a generous lift so the score
  // visibly improves against the smile target.
  lm[61] = makeLandmark(0.5 - 0.04, 0.49, 0);
  lm[291] = makeLandmark(0.5 + 0.04, 0.49, 0);
  return lm;
}

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
  }
}

console.log("celebrityScoring unit checks");

// 1. Neutral landmarks against a neutral target should score high.
{
  const score = scoreCelebrityFrame(neutralLandmarks(), NEUTRAL_PROFILE);
  check(
    "neutral landmarks vs neutral profile score > 5",
    typeof score === "number" && score > 5,
    `got ${score}`
  );
}

// 2. A perfectly open mouth against the neutral target should
//    score worse than a neutral face, but not 0.
{
  const neutralScore = scoreCelebrityFrame(neutralLandmarks(), NEUTRAL_PROFILE) ?? 0;
  const openScore = scoreCelebrityFrame(openMouthLandmarks(), NEUTRAL_PROFILE) ?? 0;
  check(
    "open mouth vs neutral target scores lower than neutral face",
    openScore < neutralScore,
    `open=${openScore}, neutral=${neutralScore}`
  );
  check(
    "open mouth vs neutral target is still > 0 (no zero-floor blowup)",
    openScore > 0,
    `open=${openScore}`
  );
}

// 3. A smile against a smile target should beat a smile against
//    a neutral target — the mouthSmile axis is the discriminator.
{
  const smileAgainstNeutral = scoreCelebrityFrame(smileLandmarks(), {
    ...NEUTRAL_PROFILE,
  }) ?? 0;
  const smileAgainstSmile = scoreCelebrityFrame(smileLandmarks(), {
    ...NEUTRAL_PROFILE,
    mouthSmile: 0.7,
  }) ?? 0;
  check(
    "smile vs smile-target scores higher than smile vs neutral-target",
    smileAgainstSmile > smileAgainstNeutral,
    `smile-target=${smileAgainstSmile}, neutral-target=${smileAgainstNeutral}`
  );
}

// 4. isScoreableFrame must reject empty arrays.
{
  check("isScoreableFrame([]) === false", isScoreableFrame([]) === false);
  check(
    "isScoreableFrame(null) === false",
    isScoreableFrame(null) === false
  );
  // A partial array with most points missing the canonical
  // mouth/eye anchors must also be rejected.
  const sparse: FaceLandmark[] = new Array(478).fill(null).map(() =>
    makeLandmark(0, 0)
  );
  // Default fill at 0,0 fails the "valid landmark coordinate"
  // floor on multiple required indexes.
  check(
    "isScoreableFrame(sparse) === false",
    isScoreableFrame(sparse) === false
  );
  check("isScoreableFrame(neutral) === true", isScoreableFrame(neutralLandmarks()) === true);
}

// 5. extractLiveMetrics should produce finite, clamped values for
//    every axis on a valid frame.
{
  const metrics = extractLiveMetrics(neutralLandmarks());
  for (const k of Object.keys(metrics) as (keyof typeof metrics)[]) {
    const v = metrics[k];
    check(
      `metric ${k} is in [0,1]`,
      typeof v === "number" && v >= 0 && v <= 1,
      `got ${v}`
    );
  }
}

// 6. resolveExpressionProfile should fall back to the
//    category/difficulty default when the target carries no profile.
{
  const resolved = resolveExpressionProfile({
    id: 1,
    name: "X",
    category: "meme",
    imageUrl: "/x.jpg",
    difficulty: "hard",
  });
  check(
    "fallback target matches CELEBRITY_DEFAULT_PROFILES.meme.hard",
    JSON.stringify(resolved) ===
      JSON.stringify(CELEBRITY_DEFAULT_PROFILES.meme.hard)
  );
}

// 7. resolveExpressionProfile should respect a hand-curated profile.
{
  const custom: ExpressionProfile = {
    mouthOpen: 0.7,
    mouthWidth: 0.2,
    mouthSmile: 0.0,
    mouthFrown: 0.0,
    eyeOpen: 0.7,
    eyeSquint: 0.0,
    browRaise: 0.8,
    browDown: 0.0,
    lipPucker: 0.0,
  };
  const resolved = resolveExpressionProfile({
    id: 2,
    name: "Y",
    category: "celebrity",
    imageUrl: "/y.jpg",
    difficulty: "medium",
    expressionProfile: custom,
  });
  check(
    "curated profile is honored",
    JSON.stringify(resolved) === JSON.stringify(custom)
  );
}

// 8. Peak accumulator should retain the BEST score across pushes.
{
  let acc = createPeakAccumulator();
  acc = pushPeakSample(acc, 3.2);
  acc = pushPeakSample(acc, 5.1);
  acc = pushPeakSample(acc, 7.8);
  acc = pushPeakSample(acc, 4.0);
  check("peak accumulator .peak === 7.8", acc.peak === 7.8, `got ${acc.peak}`);
  check("peak accumulator .samples === 4", acc.samples === 4, `got ${acc.samples}`);
  check(
    "finalizePeakScore === 7.8 (1dp)",
    finalizePeakScore(acc) === 7.8,
    `got ${finalizePeakScore(acc)}`
  );
}

// 9. Push should ignore non-finite scores (e.g. NaN) and keep
//    the previous peak.
{
  let acc = createPeakAccumulator();
  acc = pushPeakSample(acc, 4.5);
  acc = pushPeakSample(acc, Number.NaN);
  acc = pushPeakSample(acc, 2.0);
  check("NaN push is ignored", acc.peak === 4.5, `got ${acc.peak}`);
  check("NaN push does not change samples", acc.samples === 2, `got ${acc.samples}`);
}

// 10. Empty peak accumulator finalizes to 0 (no positive-default
//     inflation).
{
  check(
    "empty peak accumulator finalizes to 0",
    finalizePeakScore(createPeakAccumulator()) === 0
  );
}

if (process.exitCode === 1) {
  console.error("\n[FAIL] some checks did not pass");
  process.exit(1);
} else {
  console.log("\n[OK] all checks passed");
}
