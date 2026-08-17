"use client";

/**
 * useStableScoreSampler
 * ----------------------
 * Collects the player's expression-match score at a fixed interval
 * (default 100ms) during the active phase of a round and exposes
 * a running average plus a sample count. The same hook is used by
 * the duel arena and the solo judge so both modes share identical
 * scoring semantics.
 *
 * Why a fixed interval
 *  The face-detection loop in `useExpressionScorer` runs on
 *  `requestAnimationFrame` (~60Hz when the tab is foreground) and
 *  throttles its `onScore` callback to ~180ms. That gives us a
 *  variable, device-dependent sampling rate. For a fair 10-second
 *  score we want a deterministic, time-driven sample count — so
 *  the final number reflects "the user held the expression for
 *  most of the round" rather than "the last frame happened to
 *  land on a good detection". A `setInterval` gives us exactly
 *  that.
 *
 * Validity rules
 *  A sample is only collected if the scorer reports a finite
 *  number AND its internal status is "ready". "loading",
 *  "no-face" and "error" frames are silently dropped. That keeps
 *  the final average from being dragged down by a 0 from the
 *  moment the user lifts their phone off-camera.
 *
 * Usage
 *  const { start, stop, average, sampleCount, peak } = useStableScoreSampler();
 *  useEffect(() => { if (phase === "playing") start(); else stop(); }, [phase]);
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface StableSamplerOptions {
  /** Sample interval in ms. Default 100. */
  intervalMs?: number;
  /** Callback fired with each new sample. */
  onSample?: (score: number, sampleCount: number, average: number) => void;
}

export interface StableSamplerState {
  /** Number of valid samples collected so far this run. */
  sampleCount: number;
  /** Mean of the valid samples so far this run. 0 until at least one sample. */
  average: number;
  /** Highest single sample observed this run. */
  peak: number;
}

export interface StableSamplerControls extends StableSamplerState {
  /** Start collecting. Resets any prior run. Safe to call repeatedly. */
  start: () => void;
  /** Stop the interval. Averages stay at their last value. */
  stop: () => void;
  /** Discard all samples and stop. */
  reset: () => void;
  /** True while the interval is running. */
  isRunning: boolean;
  /**
   * Read the latest state synchronously from a ref. Use this
   * when you need the final number in the same tick the round
   * ends — React state updates from the last interval tick might
   * not have been applied yet.
   */
  getCurrent: () => StableSamplerState;
}

const EMPTY_STATE: StableSamplerState = { sampleCount: 0, average: 0, peak: 0 };

export function useStableScoreSampler(
  /** Function that returns the current score and a "is this a valid sample" flag. */
  getSample: () => { score: number | null; valid: boolean } | null,
  options: StableSamplerOptions = {},
): StableSamplerControls {
  const { intervalMs = 100, onSample } = options;
  const [state, setState] = useState<StableSamplerState>(EMPTY_STATE);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mirror the running state in a ref so the interval callback
  // can read the latest getSample without re-subscribing on every
  // render, and so the caller can read the final number
  // synchronously after `stop()`.
  const stateRef = useRef<StableSamplerState>(EMPTY_STATE);
  const getSampleRef = useRef(getSample);
  const onSampleRef = useRef(onSample);
  useEffect(() => {
    getSampleRef.current = getSample;
    onSampleRef.current = onSample;
  }, [getSample, onSample]);

  const stop = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    // Ref write is intentional — `reset` is a callback invoked
    // from event handlers / effects, never during render. The
    // ref-based read path is what lets `getCurrent()` return a
    // synchronous, in-tick value right after the round ends.
    // eslint-disable-next-line react-hooks/refs
    stateRef.current = EMPTY_STATE;
    setState(EMPTY_STATE);
  }, [stop]);

  const start = useCallback(() => {
    // Always start fresh so two back-to-back rounds don't mix.
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
    }
    stateRef.current = EMPTY_STATE;
    setState(EMPTY_STATE);
    setIsRunning(true);

    intervalRef.current = setInterval(() => {
      const sample = getSampleRef.current();
      if (!sample || !sample.valid || sample.score === null || !Number.isFinite(sample.score)) {
        return;
      }
      const prev = stateRef.current;
      const nextCount = prev.sampleCount + 1;
      // Running-mean update avoids re-iterating the sample array.
      const nextSum = prev.average * prev.sampleCount + sample.score;
      const nextAverage = nextSum / nextCount;
      const nextPeak = sample.score > prev.peak ? sample.score : prev.peak;
      const nextState: StableSamplerState = {
        sampleCount: nextCount,
        average: nextAverage,
        peak: nextPeak,
      };
      // Update the ref synchronously so the caller can read the
      // final number in the same tick the round ends.
      stateRef.current = nextState;
      setState(nextState);
      if (onSampleRef.current) {
        try {
          onSampleRef.current(sample.score, nextCount, nextAverage);
        } catch {
          /* ignore */
        }
      }
    }, intervalMs);
  }, [intervalMs]);

  const getCurrent = useCallback(() => stateRef.current, []);

  return { ...state, start, stop, reset, isRunning, getCurrent };
}

/**
 * Convenience helper: given a scorer state, decide whether a
 * sample is valid. Exported so callers don't have to repeat the
 * rules.
 */
export function isValidScoreSample(
  score: number | null | undefined,
  status: "idle" | "loading" | "ready" | "no-face" | "error" | string | undefined,
): boolean {
  if (score === null || score === undefined) return false;
  if (!Number.isFinite(score)) return false;
  if (status !== "ready") return false;
  return true;
}
