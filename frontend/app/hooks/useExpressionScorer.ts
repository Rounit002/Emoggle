"use client";

import { RefObject, useEffect, useRef, useState } from "react";
import { useMediaPipeFace } from "../context/MediaPipeFaceContext";

interface ExpressionState {
  score: number | null;
  faceBox: FaceBox | null;
  faceLandmarks: FaceLandmark[] | null;
  status: "idle" | "loading" | "ready" | "no-face" | "error";
}

export interface FaceLandmark {
  x: number;
  y: number;
  z?: number;
}

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

type BlendshapeMap = Record<string, number>;

const TFLITE_INFO_MESSAGE = "Created TensorFlow Lite XNNPACK delegate for CPU";

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isBenignTfliteInfo(error: unknown) {
  return errorText(error).includes(TFLITE_INFO_MESSAGE);
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function avg(...values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getScore(shapes: BlendshapeMap, name: string) {
  return shapes[name] ?? 0;
}

function scale(value: number, min: number, max: number) {
  return clamp((value - min) / (max - min));
}

function getFaceBox(landmarks: FaceLandmark[] | undefined): FaceBox | null {
  if (!landmarks?.length) return null;

  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;

  for (const landmark of landmarks) {
    minX = Math.min(minX, landmark.x);
    minY = Math.min(minY, landmark.y);
    maxX = Math.max(maxX, landmark.x);
    maxY = Math.max(maxY, landmark.y);
  }

  const paddingX = 0.05;
  const paddingY = 0.07;
  return {
    x: clamp(minX - paddingX, 0, 1),
    y: clamp(minY - paddingY, 0, 1),
    width: clamp(maxX - minX + paddingX * 2, 0.1, 1),
    height: clamp(maxY - minY + paddingY * 2, 0.1, 1),
  };
}

function point(landmarks: FaceLandmark[], index: number) {
  return landmarks[index] ?? null;
}

function avgY(landmarks: FaceLandmark[], indexes: number[]) {
  const values = indexes.map((index) => point(landmarks, index)?.y).filter((value): value is number => typeof value === "number");
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function euclideanDistance(a: FaceLandmark | null, b: FaceLandmark | null) {
  if (!a || !b) return 0;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.hypot(a.x - b.x, a.y - b.y, dz);
}

function faceScale(landmarks: FaceLandmark[]) {
  const leftTemple = point(landmarks, 234);
  const rightTemple = point(landmarks, 454);
  const faceTop = point(landmarks, 10);
  const faceBottom = point(landmarks, 152);
  return euclideanDistance(leftTemple, rightTemple) || euclideanDistance(faceTop, faceBottom) || getFaceBox(landmarks)?.height || 1;
}

function scoreAstonishedGeometry(landmarks: FaceLandmark[]) {
  const scaleBase = faceScale(landmarks);

  const innerUpperLip = point(landmarks, 13);
  const innerLowerLip = point(landmarks, 14);
  const innerLipOpen = euclideanDistance(innerUpperLip, innerLowerLip) / scaleBase;

  const browY = avg(
    avgY(landmarks, [63, 66, 70, 105, 107]) ?? 0,
    avgY(landmarks, [293, 296, 300, 334, 336]) ?? 0
  );
  const eyeY = avg(
    avgY(landmarks, [145, 159]) ?? 0,
    avgY(landmarks, [374, 386]) ?? 0
  );
  const eyebrowElevation = Math.max(0, eyeY - browY) / scaleBase;

  const mouthScore = scale(innerLipOpen, 0.045, 0.22);
  const browScore = scale(eyebrowElevation, 0.055, 0.16);
  return Number((clamp(mouthScore * 0.72 + browScore * 0.28) * 10).toFixed(2));
}

function scoreSmileGeometry(landmarks: FaceLandmark[]) {
  const scaleBase = faceScale(landmarks);
  const leftCorner = point(landmarks, 61);
  const rightCorner = point(landmarks, 291);
  const upperLip = point(landmarks, 13);
  const mouthWidth = euclideanDistance(leftCorner, rightCorner) / scaleBase;
  const cornerLift = avg(
    Math.max(0, (upperLip?.y ?? 0) - (leftCorner?.y ?? 0)),
    Math.max(0, (upperLip?.y ?? 0) - (rightCorner?.y ?? 0))
  ) / scaleBase;
  return Number((avg(scale(mouthWidth, 0.28, 0.48), scale(cornerLift, 0.005, 0.05)) * 10).toFixed(2));
}

function scoreBlinkGeometry(landmarks: FaceLandmark[]) {
  const scaleBase = faceScale(landmarks);
  const leftEyeOpen = euclideanDistance(point(landmarks, 159), point(landmarks, 145)) / scaleBase;
  const rightEyeOpen = euclideanDistance(point(landmarks, 386), point(landmarks, 374)) / scaleBase;
  const asymmetry = Math.abs(leftEyeOpen - rightEyeOpen);
  return Number((avg(scale(asymmetry, 0.015, 0.08), 1 - scale(Math.min(leftEyeOpen, rightEyeOpen), 0.01, 0.05)) * 10).toFixed(2));
}

function scoreAngryGeometry(landmarks: FaceLandmark[]) {
  const scaleBase = faceScale(landmarks);
  const innerBrowDrop = avg(
    Math.max(0, (point(landmarks, 105)?.y ?? 0) - (point(landmarks, 159)?.y ?? 0)),
    Math.max(0, (point(landmarks, 334)?.y ?? 0) - (point(landmarks, 386)?.y ?? 0))
  ) / scaleBase;
  const eyeNarrow = 1 - scale(avg(
    euclideanDistance(point(landmarks, 159), point(landmarks, 145)),
    euclideanDistance(point(landmarks, 386), point(landmarks, 374))
  ) / scaleBase, 0.025, 0.08);
  return Number((avg(scale(innerBrowDrop, 0.0, 0.05), eyeNarrow) * 10).toFixed(2));
}

function scoreSadGeometry(landmarks: FaceLandmark[]) {
  const scaleBase = faceScale(landmarks);
  const leftCorner = point(landmarks, 61);
  const rightCorner = point(landmarks, 291);
  const lowerLip = point(landmarks, 14);
  const cornerDrop = avg(
    Math.max(0, (leftCorner?.y ?? 0) - (lowerLip?.y ?? 0)),
    Math.max(0, (rightCorner?.y ?? 0) - (lowerLip?.y ?? 0))
  ) / scaleBase;
  return Number((scale(cornerDrop, 0.0, 0.055) * 10).toFixed(2));
}

function scoreEmoji(emoji: string, shapes: BlendshapeMap, landmarks: FaceLandmark[]) {
  if (landmarks.length) {
    if (emoji === "\u{1F62E}" || emoji === "\u{1F632}") return scoreAstonishedGeometry(landmarks);
    if (emoji === "\u{1F600}" || emoji === "\u{1F601}" || emoji === "\u{1F602}") return scoreSmileGeometry(landmarks);
    if (emoji === "\u{1F609}" || emoji === "\u{1F61C}") return scoreBlinkGeometry(landmarks);
    if (emoji === "\u{1F621}" || emoji === "\u{1F624}") return scoreAngryGeometry(landmarks);
    if (emoji === "\u{1F622}" || emoji === "\u{1F62D}") return scoreSadGeometry(landmarks);
  }

  const smile = avg(getScore(shapes, "mouthSmileLeft"), getScore(shapes, "mouthSmileRight"));
  const jawOpen = getScore(shapes, "jawOpen");
  const browUp = avg(
    getScore(shapes, "browInnerUp"),
    getScore(shapes, "browOuterUpLeft"),
    getScore(shapes, "browOuterUpRight")
  );
  const browDown = avg(getScore(shapes, "browDownLeft"), getScore(shapes, "browDownRight"));
  const frown = avg(getScore(shapes, "mouthFrownLeft"), getScore(shapes, "mouthFrownRight"));
  const eyeWide = avg(getScore(shapes, "eyeWideLeft"), getScore(shapes, "eyeWideRight"));
  const eyeBlinkLeft = getScore(shapes, "eyeBlinkLeft");
  const eyeBlinkRight = getScore(shapes, "eyeBlinkRight");
  const eyeSquint = avg(getScore(shapes, "eyeSquintLeft"), getScore(shapes, "eyeSquintRight"));
  const mouthPucker = getScore(shapes, "mouthPucker");
  const cheekSquint = avg(getScore(shapes, "cheekSquintLeft"), getScore(shapes, "cheekSquintRight"));
  const mouthStretch = avg(getScore(shapes, "mouthStretchLeft"), getScore(shapes, "mouthStretchRight"));
  const mouthPress = avg(getScore(shapes, "mouthPressLeft"), getScore(shapes, "mouthPressRight"));
  const mouthShrug = avg(getScore(shapes, "mouthShrugLower"), getScore(shapes, "mouthShrugUpper"));
  const smileAsymmetry = Math.abs(getScore(shapes, "mouthSmileLeft") - getScore(shapes, "mouthSmileRight"));
  const browAsymmetry = Math.abs(getScore(shapes, "browOuterUpLeft") - getScore(shapes, "browOuterUpRight"));
  const blinkAsymmetry = Math.abs(eyeBlinkLeft - eyeBlinkRight);
  const expressionEnergy = Math.max(smile, jawOpen, browUp, browDown, frown, eyeWide, mouthPucker);

  const raw = (() => {
    switch (emoji) {
      case "\u{1F600}":
        return avg(scale(smile, 0.18, 0.75), scale(cheekSquint, 0.05, 0.35));
      case "\u{1F601}":
        return avg(scale(smile, 0.22, 0.82), scale(cheekSquint, 0.08, 0.42), scale(eyeSquint, 0.04, 0.35));
      case "\u{1F602}":
        return avg(scale(smile, 0.25, 0.85), scale(cheekSquint, 0.1, 0.5), scale(jawOpen, 0.08, 0.45));
      case "\u{1F62E}":
        return avg(scale(jawOpen, 0.18, 0.75), scale(eyeWide, 0.08, 0.45), scale(browUp, 0.08, 0.5));
      case "\u{1F632}":
        return avg(scale(jawOpen, 0.2, 0.78), scale(eyeWide, 0.12, 0.55), scale(browUp, 0.12, 0.6));
      case "\u{1F609}":
        return avg(scale(blinkAsymmetry, 0.25, 0.85), scale(Math.max(eyeBlinkLeft, eyeBlinkRight), 0.35, 0.9), scale(smile, 0.12, 0.65));
      case "\u{1F61C}":
        return avg(scale(blinkAsymmetry, 0.2, 0.85), scale(jawOpen, 0.08, 0.55), scale(smile, 0.12, 0.65));
      case "\u{1F621}":
        return avg(scale(browDown, 0.18, 0.75), scale(eyeSquint, 0.08, 0.5), scale(Math.max(frown, mouthPucker), 0.08, 0.5));
      case "\u{1F624}":
        return avg(scale(browDown, 0.16, 0.7), scale(eyeSquint, 0.1, 0.52), scale(mouthPress, 0.08, 0.45));
      case "\u{1F622}":
        return avg(scale(frown, 0.08, 0.55), scale(browUp, 0.06, 0.45), 1 - scale(smile, 0.05, 0.35));
      case "\u{1F62D}":
        return avg(scale(frown, 0.12, 0.65), scale(browUp, 0.08, 0.5), scale(jawOpen, 0.08, 0.5), 1 - scale(smile, 0.05, 0.35));
      case "\u{1F60E}":
        return avg(scale(smile, 0.12, 0.65), scale(eyeSquint, 0.08, 0.45), 1 - scale(jawOpen, 0.1, 0.45));
      case "\u{1F928}":
        return avg(scale(browAsymmetry, 0.08, 0.45), scale(eyeSquint, 0.04, 0.35), 1 - scale(jawOpen, 0.1, 0.45));
      case "\u{1F610}":
        return 1 - scale(expressionEnergy, 0.08, 0.45);
      case "\u{1F611}":
        return avg(1 - scale(expressionEnergy, 0.06, 0.35), scale(eyeSquint, 0.04, 0.35));
      case "\u{1F633}":
        return avg(scale(eyeWide, 0.1, 0.55), scale(browUp, 0.08, 0.5), 1 - scale(jawOpen, 0.14, 0.5));
      case "\u{1F62C}":
        return avg(scale(mouthStretch, 0.08, 0.55), scale(mouthPress, 0.06, 0.45), scale(eyeWide, 0.05, 0.4));
      case "\u{1F60F}":
        return avg(scale(smileAsymmetry, 0.08, 0.55), scale(smile, 0.08, 0.55), scale(mouthShrug, 0.04, 0.35));
      default:
        return scale(smile, 0.18, 0.75);
    }
  })();

  return Number((clamp(raw) * 10).toFixed(2));
}

export function useExpressionScorer(
  videoRef: RefObject<HTMLVideoElement | null>,
  emoji: string | null,
  active: boolean,
  onScore: (score: number) => void
): ExpressionState {
  const [state, setState] = useState<ExpressionState>({ score: null, faceBox: null, faceLandmarks: null, status: "idle" });
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastSentRef = useRef(0);
  const onScoreRef = useRef(onScore);
  const detectionErrorRef = useRef(false);
  const { landmarker, status: landmarkerStatus } = useMediaPipeFace();

  useEffect(() => {
    const originalInfo = console.info;
    const originalLog = console.log;
    const originalError = console.error;
    const shouldSuppress = (args: unknown[]) =>
      args.some((arg) => errorText(arg).includes(TFLITE_INFO_MESSAGE));

    console.info = (...args: unknown[]) => {
      if (!shouldSuppress(args)) originalInfo(...args);
    };
    console.log = (...args: unknown[]) => {
      if (!shouldSuppress(args)) originalLog(...args);
    };
    console.error = (...args: unknown[]) => {
      if (!shouldSuppress(args)) originalError(...args);
    };

    return () => {
      console.info = originalInfo;
      console.log = originalLog;
      console.error = originalError;
    };
  }, []);

  useEffect(() => {
    onScoreRef.current = onScore;
  }, [onScore]);

  useEffect(() => {
    if (landmarkerStatus === "loading" || landmarkerStatus === "idle") {
      setState((prev) => ({ ...prev, score: null, status: "loading" }));
      return;
    }
    if (landmarkerStatus === "error") {
      setState((prev) => ({ ...prev, score: null, status: "error" }));
      return;
    }
    if (!landmarker) return;

    const tick = () => {
      const video = videoRef.current;
      const scorer = landmarker;

      if (!video || !scorer || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        let result;
        try {
          result = scorer.detectForVideo(video, performance.now());
          detectionErrorRef.current = false;
        } catch (error) {
          if (isBenignTfliteInfo(error)) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }
          if (!detectionErrorRef.current) {
            detectionErrorRef.current = true;
            console.error("[Expression scorer]", error);
          }
          setState((prev) => ({ ...prev, status: "error" }));
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        const categories = result.faceBlendshapes?.[0]?.categories;
        const landmarks = (result.faceLandmarks?.[0] ?? []) as FaceLandmark[];

        if (!landmarks.length) {
          setState((prev) => ({ ...prev, faceBox: null, faceLandmarks: null, status: "no-face" }));
        } else {
          const shapes: BlendshapeMap = {};
          for (const category of categories ?? []) {
            shapes[category.categoryName] = category.score;
          }

          const score = active && emoji ? scoreEmoji(emoji, shapes, landmarks) : null;
          setState({
            score,
            faceBox: getFaceBox(landmarks),
            faceLandmarks: landmarks,
            status: "ready",
          });

          const now = performance.now();
          if (score !== null && now - lastSentRef.current > 180) {
            lastSentRef.current = now;
            onScoreRef.current(score);
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [active, emoji, landmarker, landmarkerStatus, videoRef]);

  return state;
}
