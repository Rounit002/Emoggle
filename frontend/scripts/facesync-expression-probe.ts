/**
 * Diagnostic: which features does each expression actually move,
 * and how much does each contribute to the score drop?
 *
 * Prints the per-feature z-shift (difference measured in the
 * server's own tolerance units) so the weighting can be aimed at
 * the real offenders instead of guessed at.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { extractGeometry, reduceSamples, type RawLandmark } from "../app/lib/faceSync/geometry";
import type { FaceVector } from "../app/lib/faceSync/types";

const requireCjs = createRequire(path.join(process.cwd(), "noop.js"));
const { computeFaceSync, __FEATURES } = requireCjs("../signaling-server/faceSync.js") as {
  computeFaceSync: (a: FaceVector, b: FaceVector, s?: number) => { score: number } | null;
  __FEATURES: Array<{ name: string; typical: number; cv: number; weight: number }>;
};

type Point3 = [number, number, number];
type FaceModel = Record<number, Point3>;

interface Expression {
  mouthWiden?: number;
  mouthCornerLift?: number;
  jawDrop?: number;
  browLift?: number;
  eyeNarrow?: number;
}

function buildModel(e: Expression = {}): FaceModel {
  const mouthWiden = e.mouthWiden ?? 1;
  const cornerLift = e.mouthCornerLift ?? 0;
  const jawDrop = e.jawDrop ?? 0;
  const browLift = e.browLift ?? 0;
  const eyeNarrow = e.eyeNarrow ?? 0;
  return {
    10: [0, -72, 10], 9: [0, -14, 28],
    152: [0, 95 + jawDrop * 9, 8],
    17: [0, 68 + jawDrop * 7, 22],
    21: [-62, -40, -8], 251: [62, -40, -8],
    234: [-72, 8, -18], 454: [72, 8, -18],
    123: [-62, 28, 0], 352: [62, 28, 0],
    172: [-50, 62, -6], 397: [50, 62, -6],
    33: [-45, 0, 15], 133: [-16, 1, 22], 362: [16, 1, 22], 263: [45, 0, 15],
    159: [-30.5, -7 + eyeNarrow * 4, 20], 145: [-30.5, 5 - eyeNarrow * 4, 20],
    386: [30.5, -7 + eyeNarrow * 4, 20], 374: [30.5, 5 - eyeNarrow * 4, 20],
    55: [-14, -22 - browLift * 9, 24], 285: [14, -22 - browLift * 9, 24],
    105: [-32, -28 - browLift * 11, 20], 334: [32, -28 - browLift * 11, 20],
    168: [0, -8, 26], 1: [0, 30, 52], 2: [0, 38, 40],
    48: [-17, 36, 30], 278: [17, 36, 30],
    61: [-26 * mouthWiden, 58 + jawDrop * 5 - cornerLift * 5, 22],
    291: [26 * mouthWiden, 58 + jawDrop * 5 - cornerLift * 5, 22],
    0: [0, 52, 32],
  };
}

function vectorOf(model: FaceModel): FaceVector {
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

const neutral = vectorOf(buildModel());

const EXPRESSIONS: Array<[string, Expression]> = [
  ["smile", { mouthWiden: 1.18, mouthCornerLift: 1 }],
  ["gasp", { jawDrop: 1, browLift: 1 }],
  ["squint", { eyeNarrow: 1, mouthWiden: 1.06 }],
  ["jawDrop only", { jawDrop: 1 }],
  ["browLift only", { browLift: 1 }],
  ["mouthWiden only", { mouthWiden: 1.18 }],
];

for (const [name, expression] of EXPRESSIONS) {
  const moved = vectorOf(buildModel(expression));
  const score = computeFaceSync(neutral, moved, 0)!.score;
  console.log(`\n=== ${name}  ->  score ${score}`);

  const rows = __FEATURES.map((feature, i) => {
    const tolerance = Math.max(feature.typical * feature.cv, 1e-4);
    const z = (neutral[i] - moved[i]) / tolerance;
    return { name: feature.name, z, weight: feature.weight, cost: feature.weight * z * z };
  })
    .filter((row) => Math.abs(row.z) > 0.05)
    .sort((a, b) => b.cost - a.cost);

  const total = rows.reduce((s, r) => s + r.cost, 0);
  for (const row of rows.slice(0, 6)) {
    console.log(
      `   ${row.name.padEnd(16)} z=${row.z.toFixed(2).padStart(7)}  ` +
      `w=${row.weight.toFixed(2)}  cost=${row.cost.toFixed(2).padStart(7)}  ` +
      `${((row.cost / total) * 100).toFixed(0)}% of drop`,
    );
  }
}
