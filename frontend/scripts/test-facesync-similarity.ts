/**
 * FaceSync similarity + calibration test.
 *
 * This deliberately runs the REAL pipeline end to end: randomized
 * 3D head models -> rendered to MediaPipe-shaped landmarks -> the
 * real geometry extractor -> the real server scorer. Nothing is
 * stubbed, so a change to either side shows up here.
 *
 * Why not just feed the scorer Gaussian vectors? Because the
 * tolerances in `faceSync.js` assume a population spread, and
 * generating vectors from that same assumption would make the
 * calibration check circular and meaningless. Driving it from
 * random *head shapes* means the feature correlations are whatever
 * the geometry produces (a wide face really does have wide cheeks),
 * which is the thing the calibration has to survive.
 *
 * What this can and cannot tell you: it validates that the maths is
 * stable, symmetric, monotonic, and lands the distribution where it
 * was designed to. It is NOT evidence about real human faces --
 * these are parametric models, not people, and only real cameras
 * and real faces can confirm the feel of the number.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { extractGeometry, reduceSamples, type RawLandmark } from "../app/lib/faceSync/geometry";
import type { FaceVector } from "../app/lib/faceSync/types";

const requireCjs = createRequire(path.join(process.cwd(), "noop.js"));
const {
  computeFaceSync,
  vectorDistance,
} = requireCjs("../signaling-server/faceSync.js") as {
  computeFaceSync: (
    a: FaceVector,
    b: FaceVector,
    seed?: number,
  ) => { score: number; category: string; variant: number } | null;
  vectorDistance: (a: FaceVector, b: FaceVector) => number;
};

let failed = 0;
const expect = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "OK  " : "FAIL"}  ${name.padEnd(54)}  ${extra}`);
  if (!ok) failed += 1;
};

/* ─── Random heads ───────────────────────────────────────────────── */

type Point3 = [number, number, number];
type FaceModel = Record<number, Point3>;

/** Deterministic uniform/normal pair, so failures reproduce. */
function rng(seed: number) {
  let state = seed >>> 0 || 1;
  const next = () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return (state >>> 8) / 0x01000000;
  };
  return {
    uniform: next,
    normal: (mean = 0, sd = 1) => {
      const u = Math.max(next(), 1e-9);
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
}

/**
 * Latent head parameters. Each is a multiplier on one region, with
 * a spread in the range real facial proportions vary over.
 */
interface Head {
  faceW: number; faceH: number; jawW: number; cheekW: number; foreheadW: number;
  eyeSpacing: number; eyeSize: number; browH: number; browSpacing: number;
  noseW: number; noseL: number; noseZ: number;
  mouthW: number; mouthY: number; chinL: number; foreheadH: number;
}

function randomHead(seed: number): Head {
  const r = rng(seed);
  return {
    faceW: r.normal(1, 0.075), faceH: r.normal(1, 0.075),
    jawW: r.normal(1, 0.090), cheekW: r.normal(1, 0.080), foreheadW: r.normal(1, 0.085),
    eyeSpacing: r.normal(1, 0.070), eyeSize: r.normal(1, 0.080),
    browH: r.normal(1, 0.110), browSpacing: r.normal(1, 0.110),
    noseW: r.normal(1, 0.095), noseL: r.normal(1, 0.100), noseZ: r.normal(1, 0.130),
    mouthW: r.normal(1, 0.090), mouthY: r.normal(1, 0.055),
    chinL: r.normal(1, 0.090), foreheadH: r.normal(1, 0.080),
  };
}

const NEUTRAL_HEAD: Head = {
  faceW: 1, faceH: 1, jawW: 1, cheekW: 1, foreheadW: 1,
  eyeSpacing: 1, eyeSize: 1, browH: 1, browSpacing: 1,
  noseW: 1, noseL: 1, noseZ: 1, mouthW: 1, mouthY: 1, chinL: 1, foreheadH: 1,
};

/** How a smile or a gasp moves the soft tissue. */
interface Expression {
  mouthWiden?: number;
  mouthCornerLift?: number;
  jawDrop?: number;
  browLift?: number;
  eyeNarrow?: number;
}

/** Build the landmark model for a head, optionally mid-expression. */
function buildModel(head: Head, expression: Expression = {}): FaceModel {
  const w = head.faceW;
  const h = head.faceH;
  const mouthWiden = expression.mouthWiden ?? 1;
  const cornerLift = expression.mouthCornerLift ?? 0;
  const jawDrop = expression.jawDrop ?? 0;
  const browLift = expression.browLift ?? 0;
  const eyeNarrow = expression.eyeNarrow ?? 0;

  const eyeX = 45 * head.eyeSpacing * w;
  const eyeInX = 16 * head.eyeSpacing * w;
  const eyeMidX = (eyeX + eyeInX) / 2;
  const browY = -22 * head.browH * h - browLift * 9;
  const peakY = -28 * head.browH * h - browLift * 11;
  const noseBottomY = 38 * head.noseL * h;
  const mouthY = 58 * head.mouthY * h + jawDrop * 5;
  const lipTopY = 52 * head.mouthY * h;
  const chinY = 95 * h * head.chinL + jawDrop * 9;

  return {
    10: [0, -72 * h * head.foreheadH, 10],
    9: [0, -14 * h, 28],
    152: [0, chinY, 8],
    17: [0, 68 * h * head.chinL + jawDrop * 7, 22],
    21: [-62 * w * head.foreheadW, -40 * h, -8],
    251: [62 * w * head.foreheadW, -40 * h, -8],
    234: [-72 * w, 8 * h, -18],
    454: [72 * w, 8 * h, -18],
    123: [-62 * w * head.cheekW, 28 * h, 0],
    352: [62 * w * head.cheekW, 28 * h, 0],
    172: [-50 * w * head.jawW, 62 * h * head.chinL, -6],
    397: [50 * w * head.jawW, 62 * h * head.chinL, -6],
    33: [-eyeX, 0, 15],
    133: [-eyeInX, 1, 22],
    362: [eyeInX, 1, 22],
    263: [eyeX, 0, 15],
    159: [-eyeMidX, (-7 + eyeNarrow * 4) * head.eyeSize, 20],
    145: [-eyeMidX, (5 - eyeNarrow * 4) * head.eyeSize, 20],
    386: [eyeMidX, (-7 + eyeNarrow * 4) * head.eyeSize, 20],
    374: [eyeMidX, (5 - eyeNarrow * 4) * head.eyeSize, 20],
    55: [-14 * w * head.browSpacing, browY, 24],
    285: [14 * w * head.browSpacing, browY, 24],
    105: [-32 * w * head.browSpacing, peakY, 20],
    334: [32 * w * head.browSpacing, peakY, 20],
    168: [0, -8 * h, 26],
    1: [0, 30 * head.noseL * h, 52 * head.noseZ],
    2: [0, noseBottomY, 40 * head.noseZ],
    48: [-17 * head.noseW * w, noseBottomY - 2, 30],
    278: [17 * head.noseW * w, noseBottomY - 2, 30],
    61: [-26 * head.mouthW * w * mouthWiden, mouthY - cornerLift * 5, 22],
    291: [26 * head.mouthW * w * mouthWiden, mouthY - cornerLift * 5, 22],
    0: [0, lipTopY, 32],
  };
}

/* ─── Rendering (same projection model as the geometry test) ─────── */

interface Pose {
  yawDeg?: number; pitchDeg?: number; rollDeg?: number;
  scale?: number; offsetX?: number; offsetY?: number;
  jitter?: number; seed?: number;
}

function rotate([x, y, z]: Point3, pose: Pose): Point3 {
  const rx = ((pose.pitchDeg ?? 0) * Math.PI) / 180;
  const ry = ((pose.yawDeg ?? 0) * Math.PI) / 180;
  const rz = ((pose.rollDeg ?? 0) * Math.PI) / 180;
  const b0 = y * Math.cos(rx) - z * Math.sin(rx);
  const c0 = y * Math.sin(rx) + z * Math.cos(rx);
  const a1 = x * Math.cos(ry) + c0 * Math.sin(ry);
  const c1 = -x * Math.sin(ry) + c0 * Math.cos(ry);
  return [a1 * Math.cos(rz) - b0 * Math.sin(rz), a1 * Math.sin(rz) + b0 * Math.cos(rz), c1];
}

function render(model: FaceModel, width: number, height: number, pose: Pose = {}): RawLandmark[] {
  const scale = pose.scale ?? 1.7;
  const cx = width / 2 + (pose.offsetX ?? 0);
  const cy = height / 2 + (pose.offsetY ?? 0);
  const r = rng(pose.seed ?? 4242);
  const jitter = pose.jitter ?? 0;

  const out: RawLandmark[] = new Array(478);
  for (let i = 0; i < 478; i += 1) out[i] = { x: 0.5, y: 0.5, z: 0 };
  for (const key of Object.keys(model)) {
    const index = Number(key);
    const [X, Y, Z] = rotate(model[index], pose);
    out[index] = {
      x: (X * scale + cx + (jitter ? r.normal(0, jitter) : 0)) / width,
      y: (Y * scale + cy + (jitter ? r.normal(0, jitter) : 0)) / height,
      z: (Z * scale + (jitter ? r.normal(0, jitter) : 0)) / width,
    };
  }
  return out;
}

/**
 * A realistic capture: several jittery frames at slightly varying
 * pose, reduced by the median, exactly as a live run does it.
 */
function capture(
  head: Head,
  opts: {
    expression?: Expression;
    width?: number; height?: number;
    scale?: number; yaw?: number; pitch?: number; roll?: number;
    jitter?: number; seed?: number; frames?: number;
  } = {},
): FaceVector {
  const width = opts.width ?? 640;
  const height = opts.height ?? 480;
  const frames = opts.frames ?? 20;
  const model = buildModel(head, opts.expression);
  const samples: FaceVector[] = [];
  for (let i = 0; i < frames; i += 1) {
    const sample = extractGeometry(
      render(model, width, height, {
        scale: opts.scale ?? 1.7,
        yawDeg: (opts.yaw ?? 0) + Math.sin(i * 0.7) * 2.5,
        pitchDeg: (opts.pitch ?? 0) + Math.cos(i * 0.5) * 2,
        rollDeg: opts.roll ?? 0,
        jitter: opts.jitter ?? 1.2,
        seed: (opts.seed ?? 99) + i * 13,
      }),
      width,
      height,
    );
    if (sample.ok) samples.push(sample.vector);
  }
  const median = reduceSamples(samples);
  if (!median) throw new Error("capture produced no usable samples");
  return median;
}

const scoreOf = (a: FaceVector, b: FaceVector) => computeFaceSync(a, b, 0)!.score;

/* ─── Stability: the same person, measured twice ─────────────────── */

{
  // Two independent captures of one head on different cameras, at
  // different distances and slightly different angles. This is the
  // closest analogue to "does the number hold still".
  const scores: number[] = [];
  for (let i = 0; i < 60; i += 1) {
    const head = randomHead(3000 + i);
    const a = capture(head, { width: 640, height: 480, scale: 1.55, yaw: -5, seed: 11 + i });
    const b = capture(head, { width: 1280, height: 720, scale: 2.1, yaw: 6, pitch: 4, roll: 9, seed: 500 + i });
    scores.push(scoreOf(a, b));
  }
  const worst = Math.min(...scores);
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  expect("same head, two cameras -> stays very high",
    worst >= 90, `worst ${worst}, mean ${mean.toFixed(1)}`);
}

{
  // Camera distance alone must barely register.
  const head = randomHead(777);
  const near = capture(head, { scale: 2.4, seed: 1 });
  const far = capture(head, { scale: 1.15, seed: 2 });
  expect("moving closer / further barely moves the score",
    scoreOf(near, far) >= 95, `score ${scoreOf(near, far)}`);
}

{
  // Detector noise stands in for poor lighting: a dim frame makes
  // MediaPipe's landmark fit noisier, which is what this models.
  const head = randomHead(888);
  const clean = capture(head, { jitter: 0.5, seed: 3 });
  const noisy = capture(head, { jitter: 3.2, seed: 4 });
  const score = scoreOf(clean, noisy);
  expect("heavy landmark noise still reads as the same face",
    score >= 88, `score ${score}`);
}

/* ─── Expression robustness ──────────────────────────────────────── */

{
  const drops: number[] = [];
  for (let i = 0; i < 40; i += 1) {
    const head = randomHead(6000 + i);
    const neutral = capture(head, { seed: 20 + i });
    for (const [, expression] of [
      ["smile", { mouthWiden: 1.18, mouthCornerLift: 1 }],
      ["gasp", { jawDrop: 1, browLift: 1 }],
      ["squint", { eyeNarrow: 1, mouthWiden: 1.06 }],
    ] as const) {
      const moved = capture(head, { expression, seed: 300 + i });
      drops.push(scoreOf(neutral, moved));
    }
  }
  const worst = Math.min(...drops);
  const mean = drops.reduce((s, v) => s + v, 0) / drops.length;
  expect("expressions do not change who you resemble",
    worst >= 85, `worst ${worst}, mean ${mean.toFixed(1)}`);
}

/* ─── Distribution across a population ───────────────────────────── */

{
  const POPULATION = 220;
  const heads = Array.from({ length: POPULATION }, (_, i) => capture(randomHead(10_000 + i), { seed: i }));

  const scores: number[] = [];
  for (let i = 0; i < POPULATION; i += 1) {
    for (let j = i + 1; j < POPULATION; j += 1) scores.push(scoreOf(heads[i], heads[j]));
  }
  scores.sort((a, b) => a - b);

  const at = (p: number) => scores[Math.floor((scores.length - 1) * p)];
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  const median = at(0.5);

  console.log(
    `\n  population: ${scores.length} pairs  ` +
    `min ${scores[0]}  p10 ${at(0.1)}  p25 ${at(0.25)}  median ${median}  ` +
    `p75 ${at(0.75)}  p90 ${at(0.9)}  max ${scores[scores.length - 1]}  mean ${mean.toFixed(1)}\n`,
  );

  // The brief's headline requirement: strangers must not all pile
  // up at 10-25%, or the feature is a dud every round.
  expect("median stranger is not a dud", median >= 35 && median <= 62, `median ${median}`);
  expect("the bottom quartile is still not brutal", at(0.25) >= 25, `p25 ${at(0.25)}`);

  // ...but it must not be flattering to everyone either, or the
  // number stops meaning anything.
  expect("high scores stay rare", at(0.9) <= 82, `p90 ${at(0.9)}`);

  const twins = scores.filter((s) => s >= 85).length / scores.length;
  expect("twin-tier is genuinely uncommon", twins < 0.04, `${(twins * 100).toFixed(2)}% >= 85`);

  // Real spread, not a constant dressed up as a score.
  const spread = at(0.9) - at(0.1);
  expect("the range is actually used", spread >= 28, `p10-p90 spread ${spread}`);

  const distinct = new Set(scores).size;
  expect("scores are not clustered on a few values", distinct >= 40, `${distinct} distinct`);
}

/* ─── Geometry drives the score ──────────────────────────────────── */

{
  // The number has to be a function of face shape, not decoration.
  // Rank correlation between geometric distance and score should be
  // essentially perfect and negative.
  const heads = Array.from({ length: 60 }, (_, i) => capture(randomHead(20_000 + i), { seed: i }));
  const pairs: Array<{ d: number; s: number }> = [];
  for (let i = 0; i < heads.length; i += 1) {
    for (let j = i + 1; j < heads.length; j += 1) {
      pairs.push({ d: vectorDistance(heads[i], heads[j]), s: scoreOf(heads[i], heads[j]) });
    }
  }
  const byDistance = [...pairs].sort((a, b) => a.d - b.d);
  let inversions = 0;
  for (let i = 1; i < byDistance.length; i += 1) {
    if (byDistance[i].s > byDistance[i - 1].s) inversions += 1;
  }
  // Ties from integer rounding are fine; a real inversion is not.
  const inversionRate = inversions / byDistance.length;
  expect("score decreases monotonically with geometric distance",
    inversionRate === 0, `${inversions} inversions in ${byDistance.length}`);
}

{
  // The top bands must be genuinely reachable. The synthetic
  // population above contains no lookalikes by construction --
  // every head is drawn with independent parameters -- so its thin
  // upper tail says nothing about whether a real similar pair can
  // get there. Build one deliberately and check.
  const anchor = randomHead(31_337);
  const nudge = (k: number) => ({
    ...anchor,
    faceW: anchor.faceW * (1 + 0.010 * k),
    jawW: anchor.jawW * (1 - 0.014 * k),
    noseW: anchor.noseW * (1 + 0.018 * k),
    browSpacing: anchor.browSpacing * (1 - 0.015 * k),
    cheekW: anchor.cheekW * (1 + 0.012 * k),
  });
  const base = capture(anchor, { seed: 61 });
  const bands: Record<string, number> = {};
  for (let k = 0; k <= 9; k += 1) {
    const result = computeFaceSync(base, capture(nudge(k), { seed: 62 + k }), 0)!;
    bands[result.category] = Math.max(bands[result.category] ?? 0, result.score);
  }
  const reached = Object.keys(bands);
  expect("close-but-not-identical pairs reach the top bands",
    reached.includes("twin_energy") || reached.includes("copy_paste"),
    reached.join(", "));
  expect("a graded family of faces spans several bands",
    reached.length >= 3, `${reached.length} bands: ${reached.join(", ")}`);
}

{
  // A head that differs in exactly one dimension should lose points
  // in proportion to how far it differs.
  const base = capture(NEUTRAL_HEAD, { seed: 5 });
  let previous = 101;
  for (const jaw of [1.0, 1.05, 1.12, 1.22, 1.35]) {
    const score = scoreOf(base, capture({ ...NEUTRAL_HEAD, jawW: jaw }, { seed: 6 }));
    expect(`jaw width ${jaw.toFixed(2)} -> score falls`, score <= previous, `score ${score}`);
    previous = score;
  }
}

console.log("\n" + (failed === 0 ? "ALL OK" : failed + " FAILED"));
process.exit(failed === 0 ? 0 : 1);
