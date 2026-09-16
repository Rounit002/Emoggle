/**
 * Sweeps the distance-to-score curve constant against the synthetic
 * population, so CURVE_A is chosen from measured band occupancy
 * rather than guessed.
 *
 * Run this after any change to the feature list or weights in
 * `signaling-server/faceSync.js`.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { extractGeometry, reduceSamples, type RawLandmark } from "../app/lib/faceSync/geometry";
import type { FaceVector } from "../app/lib/faceSync/types";

const requireCjs = createRequire(path.join(process.cwd(), "noop.js"));
const { vectorDistance, __CURVE } = requireCjs("../signaling-server/faceSync.js") as {
  vectorDistance: (a: FaceVector, b: FaceVector) => number;
  __CURVE: { CURVE_A: number; CURVE_B: number; SCORE_MIN: number; SCORE_MAX: number };
};

type Point3 = [number, number, number];

function rng(seed: number) {
  let state = seed >>> 0 || 1;
  const next = () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return (state >>> 8) / 0x01000000;
  };
  return (mean = 0, sd = 1) => {
    const u = Math.max(next(), 1e-9);
    const v = next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

function head(seed: number) {
  const n = rng(seed);
  return {
    faceW: n(1, 0.075), faceH: n(1, 0.075), jawW: n(1, 0.09), cheekW: n(1, 0.08),
    foreheadW: n(1, 0.085), eyeSpacing: n(1, 0.07), eyeSize: n(1, 0.08),
    browH: n(1, 0.11), browSpacing: n(1, 0.11), noseW: n(1, 0.095),
    noseL: n(1, 0.1), noseZ: n(1, 0.13), mouthW: n(1, 0.09), mouthY: n(1, 0.055),
    chinL: n(1, 0.09), foreheadH: n(1, 0.08),
  };
}

function vectorFor(seed: number): FaceVector {
  const h = head(seed);
  const eyeX = 45 * h.eyeSpacing * h.faceW;
  const eyeInX = 16 * h.eyeSpacing * h.faceW;
  const eyeMidX = (eyeX + eyeInX) / 2;
  const noseBottomY = 38 * h.noseL * h.faceH;
  const model: Record<number, Point3> = {
    10: [0, -72 * h.faceH * h.foreheadH, 10], 9: [0, -14 * h.faceH, 28],
    152: [0, 95 * h.faceH * h.chinL, 8], 17: [0, 68 * h.faceH * h.chinL, 22],
    21: [-62 * h.faceW * h.foreheadW, -40 * h.faceH, -8],
    251: [62 * h.faceW * h.foreheadW, -40 * h.faceH, -8],
    234: [-72 * h.faceW, 8 * h.faceH, -18], 454: [72 * h.faceW, 8 * h.faceH, -18],
    123: [-62 * h.faceW * h.cheekW, 28 * h.faceH, 0],
    352: [62 * h.faceW * h.cheekW, 28 * h.faceH, 0],
    172: [-50 * h.faceW * h.jawW, 62 * h.faceH * h.chinL, -6],
    397: [50 * h.faceW * h.jawW, 62 * h.faceH * h.chinL, -6],
    33: [-eyeX, 0, 15], 133: [-eyeInX, 1, 22], 362: [eyeInX, 1, 22], 263: [eyeX, 0, 15],
    159: [-eyeMidX, -7 * h.eyeSize, 20], 145: [-eyeMidX, 5 * h.eyeSize, 20],
    386: [eyeMidX, -7 * h.eyeSize, 20], 374: [eyeMidX, 5 * h.eyeSize, 20],
    55: [-14 * h.faceW * h.browSpacing, -22 * h.browH * h.faceH, 24],
    285: [14 * h.faceW * h.browSpacing, -22 * h.browH * h.faceH, 24],
    105: [-32 * h.faceW * h.browSpacing, -28 * h.browH * h.faceH, 20],
    334: [32 * h.faceW * h.browSpacing, -28 * h.browH * h.faceH, 20],
    168: [0, -8 * h.faceH, 26], 1: [0, 30 * h.noseL * h.faceH, 52 * h.noseZ],
    2: [0, noseBottomY, 40 * h.noseZ],
    48: [-17 * h.noseW * h.faceW, noseBottomY - 2, 30],
    278: [17 * h.noseW * h.faceW, noseBottomY - 2, 30],
    61: [-26 * h.mouthW * h.faceW, 58 * h.mouthY * h.faceH, 22],
    291: [26 * h.mouthW * h.faceW, 58 * h.mouthY * h.faceH, 22],
    0: [0, 52 * h.mouthY * h.faceH, 32],
  };

  const W = 640;
  const H = 480;
  const S = 1.7;
  const landmarks: RawLandmark[] = new Array(478);
  for (let i = 0; i < 478; i += 1) landmarks[i] = { x: 0.5, y: 0.5, z: 0 };
  for (const key of Object.keys(model)) {
    const [x, y, z] = model[Number(key)];
    landmarks[Number(key)] = { x: (x * S + W / 2) / W, y: (y * S + H / 2) / H, z: (z * S) / W };
  }
  const r = extractGeometry(landmarks, W, H);
  if (!r.ok) throw new Error(r.reason);
  return reduceSamples([r.vector])!;
}

const N = 220;
const population = Array.from({ length: N }, (_, i) => vectorFor(40_000 + i));
const distances: number[] = [];
for (let i = 0; i < N; i += 1) {
  for (let j = i + 1; j < N; j += 1) distances.push(vectorDistance(population[i], population[j]));
}

const BANDS: Array<[number, string]> = [
  [95, "copy_paste"], [85, "twin"], [75, "bloodline"], [65, "cousin"],
  [50, "kinda"], [35, "distant"], [20, "not_rel"], [0, "different"],
];

console.log(`population: ${distances.length} pairs, CURVE_B = ${__CURVE.CURVE_B}\n`);
console.log(
  "  A     median  p75  p90  p99  | " +
  BANDS.map(([, n]) => n.padStart(9)).join(" "),
);

for (const A of [1.60, 1.727, 1.80, 1.90, 2.00, 2.10, 2.25]) {
  const scores = distances
    .map((d) =>
      Math.max(
        __CURVE.SCORE_MIN,
        Math.min(__CURVE.SCORE_MAX, Math.round(100 * Math.exp(-Math.pow(d / A, __CURVE.CURVE_B)))),
      ),
    )
    .sort((a, b) => a - b);
  const at = (p: number) => scores[Math.floor((scores.length - 1) * p)];

  // BANDS runs high-to-low, so this band's upper bound is the
  // previous entry's lower bound.
  const counts = BANDS.map(([min], i) => {
    const upper = i === 0 ? 101 : BANDS[i - 1][0];
    return scores.filter((s) => s >= min && s < upper).length / scores.length;
  });

  console.log(
    `  ${A.toFixed(3)}  ${String(at(0.5)).padStart(5)}  ${String(at(0.75)).padStart(3)}  ` +
    `${String(at(0.9)).padStart(3)}  ${String(at(0.99)).padStart(3)}  | ` +
    counts.map((c) => `${(c * 100).toFixed(2)}%`.padStart(9)).join(" "),
  );
}
console.log(`\ncurrent CURVE_A = ${__CURVE.CURVE_A}`);
