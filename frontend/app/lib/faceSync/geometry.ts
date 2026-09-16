/**
 * faceSync/geometry
 * -----------------
 * Turns one frame of MediaPipe face landmarks into a short vector
 * of normalized structural ratios.
 *
 * The whole point of this file is that the number the players see
 * must depend on bone structure and not on the camera. Four things
 * conspire against that, and each gets handled explicitly:
 *
 *  1. Aspect ratio. MediaPipe normalizes `x` against image WIDTH
 *     and `y` against image HEIGHT, so on a 16:9 feed a circle
 *     comes back as an ellipse. Every landmark is converted back
 *     into square pixel space before anything is measured.
 *
 *  2. Head rotation. A canonical basis is built from the face
 *     itself (eye line, and the eye-to-chin direction) and every
 *     landmark is re-expressed in it. Roll is cancelled exactly;
 *     yaw and pitch are largely cancelled because the basis is 3D
 *     and rotates with the head. What is left over is caught by
 *     the pose gate below.
 *
 *  3. Camera distance. Everything is divided by the distance
 *     between the outer eye corners, so the vector is scale-free:
 *     leaning towards the camera changes no component.
 *
 *  4. Expression. Features that a smile or a blink moves are either
 *     excluded (eye and mouth opening) or given a low weight (mouth
 *     width). The remaining ones are skeletal.
 *
 * Privacy: the output is ~20 coarse ratios. It is not an image, not
 * the 478-point mesh, and not a biometric template — you cannot
 * reconstruct or recognise a face from it. It is never persisted,
 * and the sample buffer is dropped the moment a run ends.
 */

import { FACE_VECTOR_LENGTH, type FaceVector } from "./types";

export interface RawLandmark {
  x: number;
  y: number;
  z?: number;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/* ─── Landmark indices ───────────────────────────────────────────
 * Canonical MediaPipe FaceMesh numbering. Named because a bare
 * `p[334]` three screens down is unreadable.
 */
const L = {
  foreheadTop: 10,
  glabella: 9,
  chin: 152,
  chinLipBottom: 17,

  templeLeft: 21,
  templeRight: 251,
  faceLeft: 234,
  faceRight: 454,
  cheekLeft: 123,
  cheekRight: 352,
  jawLeft: 172,
  jawRight: 397,

  eyeOuterLeft: 33,
  eyeInnerLeft: 133,
  eyeOuterRight: 263,
  eyeInnerRight: 362,
  eyeTopLeft: 159,
  eyeBottomLeft: 145,
  eyeTopRight: 386,
  eyeBottomRight: 374,

  browInnerLeft: 55,
  browInnerRight: 285,
  browPeakLeft: 105,
  browPeakRight: 334,

  noseBridge: 168,
  noseTip: 1,
  noseBottom: 2,
  noseAlaLeft: 48,
  noseAlaRight: 278,

  mouthLeft: 61,
  mouthRight: 291,
  lipTop: 0,
} as const;

/** Every index the extractor touches. A frame missing any of these
 *  is unusable, so they are checked up front. */
const REQUIRED_INDICES = Object.values(L);

/* ─── Quality gates ──────────────────────────────────────────────
 * Tuned to be generous: the multi-frame median is the real defence
 * against a bad frame, and rejecting too eagerly means a player who
 * is simply sitting slightly off-axis never gets a result at all.
 */

/** Outer-eye-corner distance, as a fraction of frame width. Below
 *  this the face is too small for the ratios to mean anything. */
const MIN_EYE_SPAN_FRACTION = 0.045;
/** How far outside the frame a landmark may stray. A little slack,
 *  because MediaPipe extrapolates the face oval past the edge. */
const FRAME_MARGIN = 0.06;

/*
 * Head pose is measured as the face's outward normal against the
 * camera axis, in image space — NOT in the canonical frame. The
 * canonical frame rotates with the head by construction, so any
 * quantity computed inside it is rotation-invariant and a gate
 * built from one would happily accept a head turned ninety
 * degrees. The normal's x and y components in image space are
 * sin(yaw) and sin(pitch), which is exactly what we want.
 */
/** sin(yaw) ceiling. ~22 degrees off-axis. */
const MAX_YAW_SIN = 0.38;
/** sin(pitch) ceiling. ~20 degrees, plus whatever small bias the
 *  individual face's forehead-chin axis carries. */
const MAX_PITCH_SIN = 0.34;

export type SampleRejection =
  | "missing_landmarks"
  | "face_too_small"
  | "out_of_frame"
  | "degenerate"
  | "head_turned"
  | "head_tilted";

export type GeometrySample =
  | { ok: true; vector: FaceVector }
  | { ok: false; reason: SampleRejection };

/* ─── Small vector helpers ───────────────────────────────────────── */

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: Vec3) => Math.sqrt(dot(a, a));
const mid = (a: Vec3, b: Vec3): Vec3 => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: (a.z + b.z) / 2,
});

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function scaled(a: Vec3, k: number): Vec3 {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}

/** Returns null rather than NaN-propagating on a zero-length input. */
function unit(a: Vec3): Vec3 | null {
  const length = norm(a);
  if (!Number.isFinite(length) || length < 1e-9) return null;
  return scaled(a, 1 / length);
}

/* ─── Extraction ─────────────────────────────────────────────────── */

/**
 * Build the geometry vector for one frame.
 *
 * `videoWidth` / `videoHeight` are the video's intrinsic pixel
 * dimensions — NOT the CSS box. They are what undoes MediaPipe's
 * per-axis normalization, so passing the rendered size produces a
 * subtly stretched face and a subtly wrong score.
 */
export function extractGeometry(
  landmarks: readonly RawLandmark[] | null | undefined,
  videoWidth: number,
  videoHeight: number,
): GeometrySample {
  if (!landmarks || landmarks.length === 0) return { ok: false, reason: "missing_landmarks" };
  if (!(videoWidth > 0) || !(videoHeight > 0)) return { ok: false, reason: "degenerate" };

  for (const index of REQUIRED_INDICES) {
    const point = landmarks[index];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return { ok: false, reason: "missing_landmarks" };
    }
  }

  // Undo the per-axis normalization. `z` is delivered on roughly
  // the same scale as `x`, so it takes the width too.
  const p = (index: number): Vec3 => {
    const raw = landmarks[index]!;
    return {
      x: raw.x * videoWidth,
      y: raw.y * videoHeight,
      z: (raw.z ?? 0) * videoWidth,
    };
  };

  const eyeOuterL = p(L.eyeOuterLeft);
  const eyeOuterR = p(L.eyeOuterRight);
  const chin = p(L.chin);

  const eyeSpan = norm(sub(eyeOuterR, eyeOuterL));
  if (!(eyeSpan > 0)) return { ok: false, reason: "degenerate" };
  if (eyeSpan < MIN_EYE_SPAN_FRACTION * videoWidth) return { ok: false, reason: "face_too_small" };

  // A face half out of shot gives MediaPipe nothing to fit the oval
  // against, and the width ratios go wild.
  for (const index of REQUIRED_INDICES) {
    const raw = landmarks[index]!;
    if (
      raw.x < -FRAME_MARGIN ||
      raw.x > 1 + FRAME_MARGIN ||
      raw.y < -FRAME_MARGIN ||
      raw.y > 1 + FRAME_MARGIN
    ) {
      return { ok: false, reason: "out_of_frame" };
    }
  }

  /* ── Canonical basis ──
   * x: along the eye line, left ear to right ear
   * y: down the face, eye line to chin
   * z: out of the face
   * Built from the face, so it rotates with the head and takes
   * roll/yaw/pitch out of every measurement below.
   */
  const origin = mid(eyeOuterL, eyeOuterR);
  const xAxis = unit(sub(eyeOuterR, eyeOuterL));
  if (!xAxis) return { ok: false, reason: "degenerate" };

  // Vertical reference runs forehead-to-chin rather than
  // eye-line-to-chin. Both are valid bases, but the long axis is
  // very nearly perpendicular to the eye line on a real head, so
  // the resulting normal sits almost exactly on the camera axis
  // for a face looking straight ahead. Anchoring on the eye line
  // instead leaves a few degrees of built-in tilt that varies per
  // face, which would bias the pitch gate below.
  const down = sub(chin, p(L.foreheadTop));
  const zAxis = unit(cross(xAxis, down));
  if (!zAxis) return { ok: false, reason: "degenerate" };
  const yAxis = unit(cross(zAxis, xAxis));
  if (!yAxis) return { ok: false, reason: "degenerate" };

  /** A landmark in canonical coordinates: rotation-free, and in
   *  units of "outer eye corner distance" so also scale-free. */
  const q = (index: number): Vec3 => {
    const d = sub(p(index), origin);
    return {
      x: dot(d, xAxis) / eyeSpan,
      y: dot(d, yAxis) / eyeSpan,
      z: dot(d, zAxis) / eyeSpan,
    };
  };

  const dist = (a: number, b: number) => norm(sub(q(a), q(b)));

  /* ── Pose gates ──
   * `zAxis` is the face's outward normal expressed in image space,
   * where the camera looks down +z. Its x component is therefore
   * sin(yaw) and its y component sin(pitch); roll leaves both
   * untouched, which is right — a tilted head is still facing us.
   */
  if (Math.abs(zAxis.x) > MAX_YAW_SIN) return { ok: false, reason: "head_turned" };
  if (Math.abs(zAxis.y) > MAX_PITCH_SIN) return { ok: false, reason: "head_tilted" };

  /* ── Features ──
   * Ordering is part of the wire contract: the server reads this
   * vector positionally, so components may be retuned but never
   * reordered without bumping FACE_VECTOR_LENGTH.
   */
  const faceWidth = dist(L.faceLeft, L.faceRight);
  const faceHeight = dist(L.foreheadTop, L.chin);
  const jawWidth = dist(L.jawLeft, L.jawRight);
  const cheekWidth = dist(L.cheekLeft, L.cheekRight);
  const foreheadWidth = dist(L.templeLeft, L.templeRight);
  const innerEyeDist = dist(L.eyeInnerLeft, L.eyeInnerRight);
  const eyeWidthMean =
    (dist(L.eyeOuterLeft, L.eyeInnerLeft) + dist(L.eyeInnerRight, L.eyeOuterRight)) / 2;

  // Canthal tilt: how much higher the outer corner sits than the
  // inner one. Structural, and a blink does not move it.
  const canthalTilt =
    ((q(L.eyeInnerLeft).y - q(L.eyeOuterLeft).y) +
      (q(L.eyeInnerRight).y - q(L.eyeOuterRight).y)) /
    2;

  const noseWidth = dist(L.noseAlaLeft, L.noseAlaRight);
  const noseLength = dist(L.noseBridge, L.noseBottom);
  // How far the nose stands off the face plane.
  const noseProjection = q(L.noseTip).z;

  const mouthWidth = dist(L.mouthLeft, L.mouthRight);
  const upperLipToNose = dist(L.noseBottom, L.lipTop);
  const chinHeight = dist(L.chinLipBottom, L.chin);

  const browSpacing = dist(L.browInnerLeft, L.browInnerRight);
  const eyeCentreY =
    (q(L.eyeOuterLeft).y + q(L.eyeInnerLeft).y + q(L.eyeOuterRight).y + q(L.eyeInnerRight).y) / 4;
  const browPeakY = (q(L.browPeakLeft).y + q(L.browPeakRight).y) / 2;
  const browInnerY = (q(L.browInnerLeft).y + q(L.browInnerRight).y) / 2;
  const browToEye = Math.abs(eyeCentreY - browPeakY);
  const browArch = Math.abs(browInnerY - browPeakY);

  /*
   * Vertical proportions — the thing that reads as "same face
   * shape" at a glance.
   *
   * These are measured against the CRANIAL span (forehead to the
   * base of the nose) and never against the chin. The chin sits on
   * the mandible: open your mouth and it swings down by a tenth of
   * your face height, taking every chin-anchored ratio with it. An
   * earlier version divided by forehead-to-chin and a gasp moved
   * the score by thirty points, which is exactly the instability
   * this feature cannot afford.
   *
   * The lower face still contributes, as its own low-weight
   * feature, so jaw length is not thrown away entirely.
   */
  const foreheadY = q(L.foreheadTop).y;
  const noseBottomY = q(L.noseBottom).y;
  const chinY = q(L.chin).y;
  const cranialSpan = noseBottomY - foreheadY;
  const upperSpan = eyeCentreY - foreheadY;
  if (Math.abs(cranialSpan) < 1e-6 || Math.abs(upperSpan) < 1e-6) {
    return { ok: false, reason: "degenerate" };
  }
  const upperFaceFrac = upperSpan / cranialSpan;
  const midFaceFrac = (noseBottomY - eyeCentreY) / upperSpan;
  const lowerFaceRatio = (chinY - noseBottomY) / cranialSpan;

  const vector: FaceVector = [
    faceWidth,
    faceHeight,
    jawWidth,
    cheekWidth,
    foreheadWidth,
    innerEyeDist,
    eyeWidthMean,
    canthalTilt,
    noseWidth,
    noseLength,
    noseProjection,
    mouthWidth,
    upperLipToNose,
    chinHeight,
    browSpacing,
    browToEye,
    browArch,
    upperFaceFrac,
    midFaceFrac,
    lowerFaceRatio,
  ];

  if (vector.length !== FACE_VECTOR_LENGTH) return { ok: false, reason: "degenerate" };
  for (const value of vector) {
    if (!Number.isFinite(value)) return { ok: false, reason: "degenerate" };
  }

  return { ok: true, vector };
}

/* ─── Multi-frame reduction ──────────────────────────────────────── */

/**
 * Collapse a run of per-frame vectors into one.
 *
 * Component-wise median, not mean: a single frame where MediaPipe
 * briefly fits the mesh to a blink or a half-turn produces a wild
 * outlier in a few components, and the mean carries that outlier
 * into the result while the median discards it outright.
 *
 * For an even sample count the two central values are averaged, so
 * the estimate still moves smoothly as frames accumulate.
 */
export function reduceSamples(samples: readonly FaceVector[]): FaceVector | null {
  if (samples.length === 0) return null;
  const usable = samples.filter(
    (sample) => sample.length === FACE_VECTOR_LENGTH && sample.every(Number.isFinite),
  );
  if (usable.length === 0) return null;

  const out: number[] = new Array(FACE_VECTOR_LENGTH);
  const column: number[] = new Array(usable.length);

  for (let i = 0; i < FACE_VECTOR_LENGTH; i += 1) {
    for (let s = 0; s < usable.length; s += 1) column[s] = usable[s][i];
    column.sort((a, b) => a - b);
    const middle = usable.length >> 1;
    out[i] =
      usable.length % 2 === 1 ? column[middle] : (column[middle - 1] + column[middle]) / 2;
  }
  return out;
}

/**
 * How much the samples disagree, as a mean absolute deviation from
 * the median across all components. Near zero means a still,
 * well-lit face; a large value means the run was jittery and the
 * result is not worth showing.
 */
export function sampleDispersion(
  samples: readonly FaceVector[],
  median: FaceVector,
): number {
  if (samples.length === 0) return Number.POSITIVE_INFINITY;
  let total = 0;
  let count = 0;
  for (const sample of samples) {
    if (sample.length !== FACE_VECTOR_LENGTH) continue;
    for (let i = 0; i < FACE_VECTOR_LENGTH; i += 1) {
      total += Math.abs(sample[i] - median[i]);
      count += 1;
    }
  }
  return count === 0 ? Number.POSITIVE_INFINITY : total / count;
}

/**
 * Above this the run is treated as too unstable to publish.
 *
 * Deliberately a backstop rather than a tight quality bar. The
 * component-wise median already absorbs outlier frames, and a
 * threshold tight enough to be selective would start rejecting
 * people who simply moved during the scan — which costs them the
 * feature entirely. This only catches a run that never settled.
 */
export const MAX_DISPERSION = 0.05;
