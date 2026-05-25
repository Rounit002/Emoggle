"use client";

import { RefObject, useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";

interface ExpressionState {
  score: number | null;
  faceBox: FaceBox | null;
  status: "idle" | "loading" | "ready" | "no-face" | "error";
}

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

type BlendshapeMap = Record<string, number>;

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const TFLITE_INFO_MESSAGE = "Created TensorFlow Lite XNNPACK delegate for CPU";

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

function getFaceBox(landmarks: Array<{ x: number; y: number }> | undefined): FaceBox | null {
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

function scoreEmoji(emoji: string, shapes: BlendshapeMap) {
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

  return Math.round(clamp(raw) * 100);
}

export function useExpressionScorer(
  webcamRef: RefObject<Webcam | null>,
  emoji: string | null,
  active: boolean,
  onScore: (score: number) => void
): ExpressionState {
  const [state, setState] = useState<ExpressionState>({ score: null, faceBox: null, status: "idle" });
  const scorerRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastSentRef = useRef(0);
  const onScoreRef = useRef(onScore);
  const detectionErrorRef = useRef(false);

  useEffect(() => {
    const originalInfo = console.info;
    const originalLog = console.log;
    const shouldSuppress = (args: unknown[]) =>
      args.some((arg) => typeof arg === "string" && arg.includes(TFLITE_INFO_MESSAGE));

    console.info = (...args: unknown[]) => {
      if (!shouldSuppress(args)) originalInfo(...args);
    };
    console.log = (...args: unknown[]) => {
      if (!shouldSuppress(args)) originalLog(...args);
    };

    return () => {
      console.info = originalInfo;
      console.log = originalLog;
    };
  }, []);

  useEffect(() => {
    onScoreRef.current = onScore;
  }, [onScore]);

  useEffect(() => {
    let cancelled = false;

    async function loadModel() {
      if (scorerRef.current || !active) return;
      setState((prev) => ({ ...prev, status: "loading" }));
      try {
        const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
        scorerRef.current = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
        });
        if (!cancelled) setState((prev) => ({ ...prev, status: "ready" }));
      } catch (error) {
        console.error("[Expression scorer]", error);
        if (!cancelled) setState((prev) => ({ ...prev, status: "error" }));
      }
    }

    loadModel();

    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (!active || !emoji) {
      setState({ score: null, faceBox: null, status: scorerRef.current ? "ready" : "idle" });
      return;
    }

    const tick = () => {
      const video = webcamRef.current?.video as HTMLVideoElement | undefined;
      const scorer = scorerRef.current;

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
          if (!detectionErrorRef.current) {
            detectionErrorRef.current = true;
            console.error("[Expression scorer]", error);
          }
          setState((prev) => ({ ...prev, status: "error" }));
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        const categories = result.faceBlendshapes?.[0]?.categories;

        if (!categories?.length) {
          setState((prev) => ({ ...prev, faceBox: null, status: "no-face" }));
        } else {
          const shapes: BlendshapeMap = {};
          for (const category of categories) {
            shapes[category.categoryName] = category.score;
          }

          const score = scoreEmoji(emoji, shapes);
          setState({
            score,
            faceBox: getFaceBox(result.faceLandmarks?.[0]),
            status: "ready",
          });

          const now = performance.now();
          if (now - lastSentRef.current > 180) {
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
  }, [active, emoji, webcamRef]);

  return state;
}
