/**
 * Prints the geometry vector for the neutral reference head.
 *
 * Kept as a script rather than a one-off because the server's
 * per-feature tolerances are expressed relative to these values:
 * if the feature list in `geometry.ts` changes, run this and copy
 * the numbers into `FEATURES` in `signaling-server/faceSync.js`.
 */
import { extractGeometry, type RawLandmark } from "../app/lib/faceSync/geometry";

const BASE: Record<number, [number, number, number]> = {
  10: [0, -72, 10], 9: [0, -14, 28], 152: [0, 95, 8], 17: [0, 68, 22],
  21: [-62, -40, -8], 251: [62, -40, -8], 234: [-72, 8, -18], 454: [72, 8, -18],
  123: [-62, 28, 0], 352: [62, 28, 0], 172: [-50, 62, -6], 397: [50, 62, -6],
  33: [-45, 0, 15], 133: [-16, 1, 22], 362: [16, 1, 22], 263: [45, 0, 15],
  159: [-30, -7, 20], 145: [-30, 5, 20], 386: [30, -7, 20], 374: [30, 5, 20],
  55: [-14, -22, 24], 285: [14, -22, 24], 105: [-32, -28, 20], 334: [32, -28, 20],
  168: [0, -8, 26], 1: [0, 30, 52], 2: [0, 38, 40], 48: [-17, 36, 30],
  278: [17, 36, 30], 61: [-26, 58, 22], 291: [26, 58, 22], 0: [0, 52, 32],
};

const NAMES = [
  "faceWidth", "faceHeight", "jawWidth", "cheekWidth", "foreheadWidth",
  "innerEyeDist", "eyeWidthMean", "canthalTilt", "noseWidth", "noseLength",
  "noseProjection", "mouthWidth", "upperLipToNose", "chinHeight", "browSpacing",
  "browToEye", "browArch", "upperFaceFrac", "midFaceFrac", "lowerFaceRatio",
];

const W = 640;
const H = 480;
const S = 1.7;

const landmarks: RawLandmark[] = new Array(478);
for (let i = 0; i < 478; i += 1) landmarks[i] = { x: 0.5, y: 0.5, z: 0 };
for (const key of Object.keys(BASE)) {
  const [x, y, z] = BASE[Number(key)];
  landmarks[Number(key)] = { x: (x * S + W / 2) / W, y: (y * S + H / 2) / H, z: (z * S) / W };
}

const result = extractGeometry(landmarks, W, H);
if (!result.ok) {
  console.error("rejected:", result.reason);
  process.exit(1);
}
result.vector.forEach((value, index) => {
  console.log(`${String(index).padStart(2)}  ${NAMES[index].padEnd(16)} ${value.toFixed(4)}`);
});
