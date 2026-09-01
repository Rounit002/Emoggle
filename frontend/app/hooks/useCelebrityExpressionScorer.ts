"use client";

/**
 * useCelebrityExpressionScorer
 * -----------------------------
 * Real-time mimicry scoring for the Celebrity Face Mimic mode.
 * Mirrors the shape of `useExpressionScorer` so it can drop into
 * the same camera-rig / face-overlay plumbing the emoji duel uses,
 * but evaluates the live MediaPipe landmarks against the celebrity
 * target profile (see `app/lib/celebrityScoring.ts`) instead of
 * against a hard-coded emoji score table.
 *
 * Lifecycle
 *  - `active` flips on when the scan window opens.
 *  - Each animation frame we ask MediaPipe to detect landmarks on
 *    the local video, then run `scoreCelebrityFrame` to compare
 *    the live geometry with the celebrity target.
 *  - We throttle the `onScore` callback (~150ms) so the parent
 *    doesn't re-render on every frame.
 *  - Frames that fail `isScoreableFrame` (no face, multiple
 *    faces, or critical landmarks missing) are silently dropped.
 *
 * The hook returns the latest score + the raw landmarks, so the
 * parent can render a live expression bar AND feed the stable
 * sampler without re-running MediaPipe twice.
 */

import { RefObject, useEffect, useRef, useState } from "react";
import { useMediaPipeFace } from "../context/MediaPipeFaceContext";
import {
  isScoreableFrame,
  scoreCelebrityFrame,
  type ExpressionProfile,
  type ExpressionWeights,
  type LiveExpressionMetrics,
  extractLiveMetrics,
} from "../lib/celebrityScoring";
import type { FaceLandmark } from "./useExpressionScorer";

export interface CelebrityExpressionState {
  /** Current mimicry score (0..10). Null when the scorer isn't running. */
  score: number | null;
  /** Live, normalized expression metrics (0..1) for the current frame. */
  metrics: LiveExpressionMetrics | null;
  /** MediaPipe face bounding box. */
  faceBox: { x: number; y: number; width: number; height: number } | null;
  /** Latest MediaPipe face landmarks (478 points). */
  faceLandmarks: FaceLandmark[] | null;
  /** Lifecycle status of the underlying scorer. */
  status: "idle" | "loading" | "ready" | "no-face" | "error";
}

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

function getFaceBox(landmarks: FaceLandmark[] | null): CelebrityExpressionState["faceBox"] {
  if (!landmarks?.length) return null;
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
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

export function useCelebrityExpressionScorer(
  videoRef: RefObject<HTMLVideoElement | null>,
  targetProfile: ExpressionProfile | null,
  active: boolean,
  onScore: (score: number, metrics: LiveExpressionMetrics | null) => void,
  weights?: ExpressionWeights,
): CelebrityExpressionState {
  const [state, setState] = useState<CelebrityExpressionState>({
    score: null,
    metrics: null,
    faceBox: null,
    faceLandmarks: null,
    status: "idle",
  });

  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastSentRef = useRef(0);
  const onScoreRef = useRef(onScore);
  const detectionErrorRef = useRef(false);
  const profileRef = useRef<ExpressionProfile | null>(targetProfile);
  const weightsRef = useRef<ExpressionWeights | undefined>(weights);
  const { landmarker, status: landmarkerStatus } = useMediaPipeFace();

  useEffect(() => {
    onScoreRef.current = onScore;
  }, [onScore]);

  useEffect(() => {
    profileRef.current = targetProfile;
  }, [targetProfile]);

  useEffect(() => {
    weightsRef.current = weights;
  }, [weights]);

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
    if (landmarkerStatus === "loading" || landmarkerStatus === "idle") {
      setState((prev) => ({ ...prev, score: null, metrics: null, status: "loading" }));
      return;
    }
    if (landmarkerStatus === "error") {
      setState((prev) => ({ ...prev, score: null, metrics: null, status: "error" }));
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

      // Skip inference outside the active phase to keep the rAF cheap.
      if (!active || !profileRef.current) {
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
            console.error("[Celebrity scorer]", error);
          }
          setState((prev) => ({ ...prev, status: "error" }));
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        const faceLandmarks = (result.faceLandmarks?.[0] ?? []) as FaceLandmark[];

        if (!faceLandmarks.length) {
          setState((prev) => ({
            ...prev,
            faceBox: null,
            faceLandmarks: null,
            metrics: null,
            status: "no-face",
          }));
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        // MediaPipe always returns exactly one face when numFaces=1,
        // but defensively drop a frame if a second face is present.
        const detectedCount = result.faceLandmarks?.length ?? 0;
        if (detectedCount !== 1) {
          setState((prev) => ({
            ...prev,
            faceBox: null,
            faceLandmarks: null,
            metrics: null,
            status: "no-face",
          }));
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        if (!isScoreableFrame(faceLandmarks)) {
          setState((prev) => ({
            ...prev,
            faceBox: null,
            faceLandmarks: null,
            metrics: null,
            status: "no-face",
          }));
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        const score = scoreCelebrityFrame(
          faceLandmarks,
          profileRef.current,
          weightsRef.current,
        );
        const metrics = extractLiveMetrics(faceLandmarks);
        setState({
          score,
          metrics,
          faceBox: getFaceBox(faceLandmarks),
          faceLandmarks,
          status: "ready",
        });

        const now = performance.now();
        if (score !== null && now - lastSentRef.current > 150) {
          lastSentRef.current = now;
          onScoreRef.current(score, metrics);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [active, landmarker, landmarkerStatus, videoRef]);

  return state;
}
