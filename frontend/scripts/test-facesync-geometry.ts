/**
 * FaceSync geometry test.
 *
 * Builds synthetic 3D faces, renders them to MediaPipe-shaped
 * normalized landmarks under a range of camera and pose conditions,
 * and checks the extracted vector is invariant to everything that
 * is not bone structure.
 *
 * The invariances that matter, and why each is tested:
 *   scale      - leaning towards the camera must not move the score
 *   aspect     - a 4:3 webcam and a 16:9 webcam must agree
 *   translate  - sitting off-centre must not matter
 *   roll       - a tilted head is the same head
 *   yaw/pitch  - a slightly off-axis head is the same head
 *   jitter     - per-frame detector noise must wash out in the median
 *
 * A synthetic face is an optimistic model of a real one (no
 * occlusion, no lens distortion, perfect landmark fit), so the
 * tolerances here are tighter than a real camera would achieve.
 * What the test proves is that the maths itself is sound — it
 * cannot stand in for real faces on real webcams.
 */
import {
  MAX_DISPERSION,
  extractGeometry,
  reduceSamples,
  sampleDispersion,
  type RawLandmark,
} from "../app/lib/faceSync/geometry";
import { FACE_VECTOR_LENGTH, type FaceVector } from "../app/lib/faceSync/types";

let failed = 0;
const expect = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "OK  " : "FAIL"}  ${name.padEnd(52)}  ${extra}`);
  if (!ok) failed += 1;
};

/* ─── A synthetic face ───────────────────────────────────────────── */

type Point3 = [number, number, number];
type FaceModel = Record<number, Point3>;

/** Neutral reference head. x right, y down, z out of the face. */
const BASE: FaceModel = {
  10: [0, -72, 10],      // forehead top
  9: [0, -14, 28],       // glabella
  152: [0, 95, 8],       // chin
  17: [0, 68, 22],       // below lower lip
  21: [-62, -40, -8],    // left temple
  251: [62, -40, -8],    // right temple
  234: [-72, 8, -18],    // left face edge
  454: [72, 8, -18],     // right face edge
  123: [-62, 28, 0],     // left cheek
  352: [62, 28, 0],      // right cheek
  172: [-50, 62, -6],    // left jaw
  397: [50, 62, -6],     // right jaw
  33: [-45, 0, 15],      // left eye outer
  133: [-16, 1, 22],     // left eye inner
  362: [16, 1, 22],      // right eye inner
  263: [45, 0, 15],      // right eye outer
  159: [-30, -7, 20],
  145: [-30, 5, 20],
  386: [30, -7, 20],
  374: [30, 5, 20],
  55: [-14, -22, 24],    // left brow inner
  285: [14, -22, 24],    // right brow inner
  105: [-32, -28, 20],   // left brow peak
  334: [32, -28, 20],    // right brow peak
  168: [0, -8, 26],      // nose bridge
  1: [0, 30, 52],        // nose tip
  2: [0, 38, 40],        // nose bottom
  48: [-17, 36, 30],     // left ala
  278: [17, 36, 30],     // right ala
  61: [-26, 58, 22],     // left mouth corner
  291: [26, 58, 22],     // right mouth corner
  0: [0, 52, 32],        // upper lip top
};

/** Apply per-axis multipliers to a region, producing a new face. */
function variant(changes: Partial<Record<number, Point3>>): FaceModel {
  return { ...BASE, ...changes };
}

/** A wider, squarer jaw. */
const WIDE_JAW = variant({
  172: [-62, 64, -6], 397: [62, 64, -6],
  123: [-70, 30, 0], 352: [70, 30, 0],
  234: [-80, 8, -18], 454: [80, 8, -18],
});

/** A long, narrow face with a long nose. */
const LONG_FACE = variant({
  10: [0, -88, 10], 152: [0, 116, 8], 17: [0, 86, 22],
  1: [0, 38, 56], 2: [0, 50, 42], 168: [0, -10, 26],
  48: [-13, 48, 30], 278: [13, 48, 30],
  61: [-23, 72, 22], 291: [23, 72, 22], 0: [0, 66, 32],
  234: [-64, 8, -18], 454: [64, 8, -18],
});

/** Wide-set eyes and high brows. */
const WIDE_EYES = variant({
  33: [-52, 0, 13], 133: [-23, 1, 21],
  362: [23, 1, 21], 263: [52, 0, 13],
  55: [-20, -30, 24], 285: [20, -30, 24],
  105: [-38, -36, 18], 334: [38, -36, 18],
  159: [-37, -7, 19], 145: [-37, 5, 19],
  386: [37, -7, 19], 374: [37, 5, 19],
});

/* ─── Rendering a model to MediaPipe-shaped landmarks ────────────── */

interface Pose {
  yawDeg?: number;
  pitchDeg?: number;
  rollDeg?: number;
  /** Pixels per model unit. Bigger = closer to the camera. */
  scale?: number;
  /** Frame-centre offset in pixels. */
  offsetX?: number;
  offsetY?: number;
  /** Std dev of per-landmark noise, in pixels. */
  jitter?: number;
  seed?: number;
}

/** Deterministic Gaussian, so a failure is always reproducible. */
function makeNoise(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    // xorshift32 -> two uniforms -> Box-Muller
    const next = () => {
      state ^= state << 13; state >>>= 0;
      state ^= state >> 17;
      state ^= state << 5; state >>>= 0;
      return (state >>> 8) / 0x01000000;
    };
    const u = Math.max(next(), 1e-9);
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

function rotate([x, y, z]: Point3, pose: Pose): Point3 {
  const rx = ((pose.pitchDeg ?? 0) * Math.PI) / 180;
  const ry = ((pose.yawDeg ?? 0) * Math.PI) / 180;
  const rz = ((pose.rollDeg ?? 0) * Math.PI) / 180;

  // Rx (pitch)
  let a = x;
  let b = y * Math.cos(rx) - z * Math.sin(rx);
  let c = y * Math.sin(rx) + z * Math.cos(rx);
  // Ry (yaw)
  let a2 = a * Math.cos(ry) + c * Math.sin(ry);
  const b2 = b;
  const c2 = -a * Math.sin(ry) + c * Math.cos(ry);
  // Rz (roll)
  a = a2 * Math.cos(rz) - b2 * Math.sin(rz);
  b = a2 * Math.sin(rz) + b2 * Math.cos(rz);
  c = c2;
  return [a, b, c];
}

/**
 * Project to the normalized space MediaPipe reports: `x` over frame
 * width, `y` over frame height, `z` on roughly the same scale as x.
 * The per-axis denominators are the aspect-ratio trap the extractor
 * has to undo.
 */
function render(
  model: FaceModel,
  width: number,
  height: number,
  pose: Pose = {},
): RawLandmark[] {
  const scale = pose.scale ?? 1.7;
  const cx = width / 2 + (pose.offsetX ?? 0);
  const cy = height / 2 + (pose.offsetY ?? 0);
  const noise = makeNoise(pose.seed ?? 12345);
  const jitter = pose.jitter ?? 0;

  // Sparse array: only the indices the extractor reads are filled,
  // exactly like reading a subset of the 478-point mesh.
  const out: RawLandmark[] = new Array(478);
  for (let i = 0; i < 478; i += 1) out[i] = { x: 0.5, y: 0.5, z: 0 };

  for (const key of Object.keys(model)) {
    const index = Number(key);
    const [X, Y, Z] = rotate(model[index], pose);
    const px = X * scale + cx + (jitter ? noise() * jitter : 0);
    const py = Y * scale + cy + (jitter ? noise() * jitter : 0);
    const pz = Z * scale + (jitter ? noise() * jitter : 0);
    out[index] = { x: px / width, y: py / height, z: pz / width };
  }
  return out;
}

function vectorOf(model: FaceModel, width: number, height: number, pose: Pose = {}): FaceVector {
  const sample = extractGeometry(render(model, width, height, pose), width, height);
  if (!sample.ok) throw new Error(`expected a vector, got rejection: ${sample.reason}`);
  return sample.vector;
}

/** Largest absolute difference between two vectors. */
function maxDelta(a: FaceVector, b: FaceVector): number {
  let worst = 0;
  for (let i = 0; i < a.length; i += 1) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  return worst;
}

/** Mean absolute difference — the summary the score actually sees. */
function meanDelta(a: FaceVector, b: FaceVector): number {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += Math.abs(a[i] - b[i]);
  return total / a.length;
}

/* ─── Shape ──────────────────────────────────────────────────────── */

const reference = vectorOf(BASE, 640, 480);
expect("vector has the declared length", reference.length === FACE_VECTOR_LENGTH, String(reference.length));
expect("every component is finite", reference.every(Number.isFinite));
expect(
  "components sit in the validated range",
  reference.every((v) => v > -4 && v < 4),
  `min ${Math.min(...reference).toFixed(3)} max ${Math.max(...reference).toFixed(3)}`,
);

/* ─── Invariance ─────────────────────────────────────────────────── */

{
  // Camera distance: same face, half and double the size in frame.
  const near = vectorOf(BASE, 640, 480, { scale: 2.2 });
  const far = vectorOf(BASE, 640, 480, { scale: 1.1 });
  const delta = maxDelta(near, far);
  expect("scale invariant (2x size change)", delta < 1e-9, `max delta ${delta.toExponential(2)}`);
}

{
  // Aspect ratio: 4:3 against 16:9. This is the one that silently
  // ruins everything if the per-axis normalization is not undone.
  const fourThree = vectorOf(BASE, 640, 480, { scale: 1.7 });
  const sixteenNine = vectorOf(BASE, 1280, 720, { scale: 1.7 });
  const delta = maxDelta(fourThree, sixteenNine);
  expect("aspect-ratio invariant (4:3 vs 16:9)", delta < 1e-9, `max delta ${delta.toExponential(2)}`);
}

{
  const centred = vectorOf(BASE, 640, 480);
  const offset = vectorOf(BASE, 640, 480, { offsetX: -90, offsetY: 55 });
  const delta = maxDelta(centred, offset);
  expect("translation invariant", delta < 1e-9, `max delta ${delta.toExponential(2)}`);
}

{
  // Roll is cancelled exactly by the eye-line basis.
  const upright = vectorOf(BASE, 640, 480);
  const tilted = vectorOf(BASE, 640, 480, { rollDeg: 22 });
  const delta = maxDelta(upright, tilted);
  expect("roll invariant (22 deg)", delta < 1e-9, `max delta ${delta.toExponential(2)}`);
}

{
  const straight = vectorOf(BASE, 640, 480);
  for (const yaw of [-14, -7, 7, 14]) {
    const turned = vectorOf(BASE, 640, 480, { yawDeg: yaw });
    const delta = maxDelta(straight, turned);
    expect(`yaw tolerant (${yaw} deg)`, delta < 0.02, `max delta ${delta.toFixed(5)}`);
  }
}

{
  const straight = vectorOf(BASE, 640, 480);
  for (const pitch of [-10, -5, 5, 10]) {
    const nodded = vectorOf(BASE, 640, 480, { pitchDeg: pitch });
    const delta = maxDelta(straight, nodded);
    expect(`pitch tolerant (${pitch} deg)`, delta < 0.02, `max delta ${delta.toFixed(5)}`);
  }
}

{
  // Everything at once: a person sitting slightly off-axis, closer,
  // and off-centre on a widescreen camera.
  const clean = vectorOf(BASE, 640, 480);
  const messy = vectorOf(BASE, 1280, 720, {
    yawDeg: 9, pitchDeg: -6, rollDeg: 12, scale: 3.0, offsetX: 120, offsetY: -40,
  });
  const delta = meanDelta(clean, messy);
  expect("combined pose + camera change stays small", delta < 0.01, `mean delta ${delta.toFixed(5)}`);
}

/* ─── Discrimination ─────────────────────────────────────────────── */

{
  // The flip side of invariance: genuinely different bone structure
  // has to move the vector far more than pose noise does.
  const base = vectorOf(BASE, 640, 480);
  const poseNoise = meanDelta(base, vectorOf(BASE, 640, 480, { yawDeg: 12, rollDeg: 15 }));

  for (const [name, model] of [
    ["wide jaw", WIDE_JAW],
    ["long face", LONG_FACE],
    ["wide-set eyes", WIDE_EYES],
  ] as const) {
    const other = meanDelta(base, vectorOf(model, 640, 480));
    expect(
      `${name} differs far more than pose noise`,
      other > poseNoise * 8,
      `structure ${other.toFixed(4)} vs pose ${poseNoise.toFixed(4)}`,
    );
  }
}

/* ─── Rejection gates ────────────────────────────────────────────── */

{
  const turned = extractGeometry(render(BASE, 640, 480, { yawDeg: 42 }), 640, 480);
  expect("hard yaw rejected", !turned.ok && turned.reason === "head_turned",
    turned.ok ? "accepted" : turned.reason);
}

{
  const nodded = extractGeometry(render(BASE, 640, 480, { pitchDeg: 40 }), 640, 480);
  expect("hard pitch rejected", !nodded.ok && nodded.reason === "head_tilted",
    nodded.ok ? "accepted" : nodded.reason);
}

{
  const tiny = extractGeometry(render(BASE, 640, 480, { scale: 0.25 }), 640, 480);
  expect("distant face rejected", !tiny.ok && tiny.reason === "face_too_small",
    tiny.ok ? "accepted" : tiny.reason);
}

{
  const edge = extractGeometry(render(BASE, 640, 480, { offsetX: 280 }), 640, 480);
  expect("face off the edge rejected", !edge.ok && edge.reason === "out_of_frame",
    edge.ok ? "accepted" : edge.reason);
}

{
  expect("empty landmarks rejected",
    extractGeometry([], 640, 480).ok === false);
  expect("null landmarks rejected",
    extractGeometry(null, 640, 480).ok === false);

  const holed = render(BASE, 640, 480);
  // @ts-expect-error deliberately corrupting a required index
  holed[152] = undefined;
  const missing = extractGeometry(holed, 640, 480);
  expect("missing required landmark rejected",
    !missing.ok && missing.reason === "missing_landmarks",
    missing.ok ? "accepted" : missing.reason);

  const nan = render(BASE, 640, 480);
  nan[1] = { x: Number.NaN, y: 0.5, z: 0 };
  expect("NaN landmark rejected", extractGeometry(nan, 640, 480).ok === false);

  expect("zero video size rejected", extractGeometry(render(BASE, 640, 480), 0, 480).ok === false);
}

/* ─── Multi-frame reduction ──────────────────────────────────────── */

{
  const clean = vectorOf(BASE, 640, 480);

  // A realistic run: 24 frames of detector jitter around one face.
  const noisy: FaceVector[] = [];
  for (let i = 0; i < 24; i += 1) {
    noisy.push(vectorOf(BASE, 640, 480, { jitter: 1.4, seed: 1000 + i, yawDeg: (i % 5) - 2 }));
  }
  const singleFrameError = meanDelta(clean, noisy[0]);
  const median = reduceSamples(noisy)!;
  const medianError = meanDelta(clean, median);

  expect("median beats a single noisy frame",
    medianError < singleFrameError,
    `median ${medianError.toFixed(5)} vs single ${singleFrameError.toFixed(5)}`);
  expect("median of a jittery run is close to truth",
    medianError < 0.004, `mean delta ${medianError.toFixed(5)}`);

  // One catastrophically bad frame must not move the median.
  const poisoned = [...noisy, LONG_FACE].map((v) =>
    Array.isArray(v) ? (v as FaceVector) : vectorOf(v as FaceModel, 640, 480),
  );
  const poisonedMedian = reduceSamples(poisoned)!;
  const shift = meanDelta(median, poisonedMedian);
  expect("one outlier frame barely moves the median", shift < 0.01, `shift ${shift.toFixed(5)}`);

  // Dispersion is the backstop for a run that never settled.
  const steady = sampleDispersion(noisy, median);
  expect("steady run is under the dispersion ceiling",
    steady < MAX_DISPERSION, `dispersion ${steady.toFixed(5)}`);

  const mixed = [clean, vectorOf(LONG_FACE, 640, 480), vectorOf(WIDE_JAW, 640, 480)];
  const mixedDispersion = sampleDispersion(mixed, reduceSamples(mixed)!);
  expect("a mixed-face run disperses well above a steady one",
    mixedDispersion > steady * 2,
    `mixed ${mixedDispersion.toFixed(5)} vs steady ${steady.toFixed(5)}`);

  // Heavy detector thrash — the case the ceiling actually exists for.
  const thrash: FaceVector[] = [];
  for (let i = 0; i < 20; i += 1) {
    thrash.push(vectorOf(BASE, 640, 480, { jitter: 11, seed: 7000 + i }));
  }
  const thrashDispersion = sampleDispersion(thrash, reduceSamples(thrash)!);
  expect("a thrashing run exceeds the dispersion ceiling",
    thrashDispersion > MAX_DISPERSION, `dispersion ${thrashDispersion.toFixed(5)}`);
}

/* --- Pose gate boundaries ---------------------------------------- */

{
  // The gate has to sit between "sitting slightly off-axis", which
  // must still get a result, and "looking away", which must not.
  for (const yaw of [0, 10, 18]) {
    const r = extractGeometry(render(BASE, 640, 480, { yawDeg: yaw }), 640, 480);
    expect(`yaw ${yaw} deg accepted`, r.ok === true, r.ok ? "" : r.reason);
  }
  for (const yaw of [30, 45, 60, -50]) {
    const r = extractGeometry(render(BASE, 640, 480, { yawDeg: yaw }), 640, 480);
    expect(`yaw ${yaw} deg rejected`, !r.ok && r.reason === "head_turned",
      r.ok ? "accepted" : r.reason);
  }
  for (const pitch of [0, 8, -8]) {
    const r = extractGeometry(render(BASE, 640, 480, { pitchDeg: pitch }), 640, 480);
    expect(`pitch ${pitch} deg accepted`, r.ok === true, r.ok ? "" : r.reason);
  }
  for (const pitch of [30, -30, 45]) {
    const r = extractGeometry(render(BASE, 640, 480, { pitchDeg: pitch }), 640, 480);
    expect(`pitch ${pitch} deg rejected`, !r.ok && r.reason === "head_tilted",
      r.ok ? "accepted" : r.reason);
  }
  // Roll is not a pose problem — a tilted head is still facing us.
  for (const roll of [25, -35, 55]) {
    const r = extractGeometry(render(BASE, 640, 480, { rollDeg: roll }), 640, 480);
    expect(`roll ${roll} deg still accepted`, r.ok === true, r.ok ? "" : r.reason);
  }
}

{
  expect("reduceSamples of nothing is null", reduceSamples([]) === null);
  expect("reduceSamples rejects wrong-length input", reduceSamples([[1, 2, 3]]) === null);
  const even = reduceSamples([
    new Array(FACE_VECTOR_LENGTH).fill(1),
    new Array(FACE_VECTOR_LENGTH).fill(3),
  ])!;
  expect("even sample count averages the middle pair", even[0] === 2, String(even[0]));
}

console.log("\n" + (failed === 0 ? "ALL OK" : failed + " FAILED"));
process.exit(failed === 0 ? 0 : 1);
