"use client";

/**
 * useFaceSync
 * -----------
 * Runs one FaceSync scan per stranger: watch the local camera,
 * bank a run of geometry samples, publish the median, and hold the
 * server's verdict on screen for a beat.
 *
 * Division of labour, because three files share this feature:
 *   - `lib/faceSync/geometry` turns a frame into numbers
 *   - `lib/faceSync/machine` owns the legal transitions
 *   - this hook owns the side effects: the detection loop, the
 *     timers, the socket call, and the teardown
 *
 * Two things it deliberately does NOT do.
 *
 * It never analyses the partner's video. Their feed arrives
 * WebRTC-compressed and at a lower resolution than their own
 * camera sees, so measuring it would produce a different answer
 * than they measure for themselves — and the two players would
 * disagree about a number that is supposed to be shared. Each
 * device measures the face in front of it; the server combines.
 *
 * It never allocates its own MediaPipe instance. The landmarker in
 * `MediaPipeFaceContext` is shared with the expression scorer, and
 * during the lead-in that scorer is inactive (it only runs in the
 * `playing` phase), so the model is sitting idle and free. A second
 * instance would double the GPU cost of a pipeline that is already
 * running a camera, a peer video and a live game.
 *
 * Privacy: samples live in a ref for the couple of seconds a scan
 * lasts and are dropped the moment it ends. Nothing is written to
 * storage, no frame is ever captured, and the landmark mesh never
 * leaves the function that reduces it to ratios.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { useMediaPipeFace } from "../context/MediaPipeFaceContext";
import {
  MAX_DISPERSION,
  extractGeometry,
  reduceSamples,
  sampleDispersion,
} from "../lib/faceSync/geometry";
import {
  faceSyncReducer,
  isTerminal,
  type FaceSyncEvent,
} from "../lib/faceSync/machine";
import {
  FACE_SYNC_TIMEOUT_MS,
  INITIAL_FACE_SYNC_STATE,
  MAX_SAMPLES,
  MIN_SAMPLES,
  RESULT_HOLD_MS,
  type FaceSyncResult,
  type FaceSyncState,
  type FaceVector,
} from "../lib/faceSync/types";

/**
 * Minimum gap between detections, in ms. MediaPipe on a mid-range
 * phone costs tens of milliseconds a frame; at ~15Hz the sample
 * budget fills in about a second while leaving the main thread
 * room for the video elements and the arena's own animation.
 */
const DETECT_INTERVAL_MS = 66;

interface UseFaceSyncArgs {
  /** The local camera element. Never the partner's. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** The match this run belongs to; null outside a match. */
  matchId: string | null;
  /** True once the partner's video is actually flowing. */
  partnerPresent: boolean;
  /** Server verdict for the current match, or null while pending. */
  result: FaceSyncResult | null;
  /** Match id the server bypassed FaceSync for. */
  skippedFor: string | null;
  /** Publishes geometry, or null for "nothing to offer". */
  onSubmit: (vector: FaceVector | null) => void;
}

export interface FaceSyncView extends FaceSyncState {
  /** True while the scan should be visible on screen. */
  visible: boolean;
  /** True when the local camera currently has no usable face. */
  localFaceMissing: boolean;
}

export function useFaceSync({
  videoRef,
  matchId,
  partnerPresent,
  result,
  skippedFor,
  onSubmit,
}: UseFaceSyncArgs): FaceSyncView {
  const { landmarker, status: landmarkerStatus } = useMediaPipeFace();

  /*
   * The reducer is used with its default `activeMatchId` of null,
   * because the stale-match guard is already carried by the RESULT
   * event itself: the dispatch site compares the result's match to
   * the one this run belongs to. Closing over a ref here instead
   * would mean reading a ref during render.
   */
  const [state, rawDispatch] = useReducer(
    (current: FaceSyncState, event: FaceSyncEvent) => faceSyncReducer(current, event),
    INITIAL_FACE_SYNC_STATE,
  );

  // Refs the loop and timers read, so none of them need to be torn
  // down and rebuilt when React re-renders.
  const phaseRef = useRef(state.phase);
  const samplesRef = useRef<FaceVector[]>([]);
  const submittedRef = useRef(false);
  const localFaceMissingRef = useRef(true);
  const onSubmitRef = useRef(onSubmit);
  const rafRef = useRef<number | null>(null);
  const lastDetectRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detectErrorRef = useRef(false);

  const dispatch = useCallback((event: FaceSyncEvent) => rawDispatch(event), []);

  useEffect(() => {
    phaseRef.current = state.phase;
  }, [state.phase]);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  /** Drop everything a run owns. Safe to call repeatedly. */
  const teardown = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (holdRef.current) {
      clearTimeout(holdRef.current);
      holdRef.current = null;
    }
    // Facial geometry does not outlive the scan that produced it.
    samplesRef.current = [];
    lastVideoTimeRef.current = -1;
    detectErrorRef.current = false;
  }, []);

  /**
   * Publish what we have. `null` means we have nothing usable —
   * saying so promptly is what lets the server end the lead-in
   * instead of holding the partner until its window expires.
   */
  const submit = useCallback((vector: FaceVector | null) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    onSubmitRef.current(vector);
    samplesRef.current = [];
    dispatch({ type: "SUBMITTED" });
  }, [dispatch]);

  /* ── Run lifecycle, keyed on the match ── */
  useEffect(() => {
    teardown();
    submittedRef.current = false;
    localFaceMissingRef.current = true;

    if (!matchId) {
      dispatch({ type: "RESET" });
      return;
    }

    dispatch({ type: "MATCH_STARTED" });

    // The whole run is bounded. Whatever goes wrong — no face, a
    // partner who never appears, a landmarker that never loads —
    // the arena gets its round back.
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      if (isTerminal(phaseRef.current)) return;
      if (!submittedRef.current) {
        // Enough samples to be worth sending? Send them. Otherwise
        // tell the server we have nothing.
        const median = reduceSamples(samplesRef.current);
        submit(median && samplesRef.current.length >= MIN_SAMPLES ? median : null);
        return;
      }
      // Already submitted and still waiting on the server.
      dispatch({ type: "FAIL", failure: "timeout" });
    }, FACE_SYNC_TIMEOUT_MS);

    return teardown;
  }, [matchId, dispatch, submit, teardown]);

  /* ── The landmarker never arrived ── */
  useEffect(() => {
    if (!matchId) return;
    if (landmarkerStatus !== "error") return;
    if (isTerminal(phaseRef.current)) return;
    // Nothing to measure with. Report immediately rather than
    // letting both players sit through the collection window.
    submit(null);
    dispatch({ type: "FAIL", failure: "landmarker_unavailable" });
  }, [landmarkerStatus, matchId, submit, dispatch]);

  /*
   * Detection loop.
   *
   * `state.submitted` is in the dependency list on purpose: once
   * this device has published its geometry there is nothing left to
   * measure, and re-running the effect tears the loop down for
   * real. Leaving a rAF spinning on an early return would be
   * cheap per frame but still wakes the compositor every frame of
   * a ten-second round, which is exactly the kind of thing that
   * drains a phone.
   */
  useEffect(() => {
    if (!matchId || !landmarker || landmarkerStatus !== "ready") return;
    if (submittedRef.current || state.submitted) return;

    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      rafRef.current = requestAnimationFrame(tick);

      if (submittedRef.current || isTerminal(phaseRef.current)) return;

      const now = performance.now();
      if (now - lastDetectRef.current < DETECT_INTERVAL_MS) return;

      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
      // A paused element yields the same frame forever; detecting
      // on it would fill the buffer with duplicates.
      if (video.currentTime === lastVideoTimeRef.current) return;

      lastDetectRef.current = now;
      lastVideoTimeRef.current = video.currentTime;

      let detection;
      try {
        detection = landmarker.detectForVideo(video, now);
        detectErrorRef.current = false;
      } catch (error) {
        // One noisy failure is normal while a stream settles. A
        // persistent one means we will never get a sample, so stop
        // holding the partner up.
        if (!detectErrorRef.current) {
          detectErrorRef.current = true;
          console.warn("[FaceSync] detection failed", error);
          return;
        }
        submit(null);
        return;
      }

      const landmarks = detection?.faceLandmarks?.[0];
      if (!landmarks || landmarks.length === 0) {
        if (!localFaceMissingRef.current) {
          localFaceMissingRef.current = true;
          dispatch({ type: "LOCAL_FACE_LOST" });
        }
        return;
      }

      const sample = extractGeometry(landmarks, video.videoWidth, video.videoHeight);
      if (!sample.ok) {
        // A rejected frame is not a missing face — the person is
        // there, just turned away or too close to the edge. Keep
        // the UI encouraging rather than flashing an error.
        if (sample.reason === "missing_landmarks" || sample.reason === "out_of_frame") {
          if (!localFaceMissingRef.current) {
            localFaceMissingRef.current = true;
            dispatch({ type: "LOCAL_FACE_LOST" });
          }
        }
        return;
      }

      if (localFaceMissingRef.current) {
        localFaceMissingRef.current = false;
        dispatch({ type: "LOCAL_FACE_FOUND" });
      }

      if (samplesRef.current.length < MAX_SAMPLES) {
        samplesRef.current.push(sample.vector);
        dispatch({ type: "SAMPLE" });
      }

      // Enough of a run banked. Reduce and publish.
      if (samplesRef.current.length >= MIN_SAMPLES) {
        const median = reduceSamples(samplesRef.current);
        if (!median) {
          submit(null);
          return;
        }
        // A run that never settled produces a median nobody should
        // be scored against. Keep collecting up to the cap, then
        // send what we have rather than nothing.
        const dispersion = sampleDispersion(samplesRef.current, median);
        if (dispersion > MAX_DISPERSION && samplesRef.current.length < MAX_SAMPLES) return;
        submit(median);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [matchId, landmarker, landmarkerStatus, videoRef, submit, dispatch, state.submitted]);

  /* ── Server verdict ── */
  useEffect(() => {
    if (!matchId || !result) return;
    dispatch({ type: "RESULT", result, matchId });
  }, [result, matchId, dispatch]);

  useEffect(() => {
    if (!matchId || !skippedFor || skippedFor !== matchId) return;
    dispatch({ type: "FAIL", failure: "no_partner" });
  }, [skippedFor, matchId, dispatch]);

  /* ── Hold the reveal, then let the round start ── */
  useEffect(() => {
    if (state.phase !== "showing_result") return;
    holdRef.current = setTimeout(() => {
      holdRef.current = null;
      dispatch({ type: "RESULT_HELD" });
    }, RESULT_HOLD_MS);
    return () => {
      if (holdRef.current) {
        clearTimeout(holdRef.current);
        holdRef.current = null;
      }
    };
  }, [state.phase, dispatch]);

  /*
   * A partner who never connects cannot be scored against. We do
   * not fail on this ourselves — the server owns that decision and
   * will bypass — but we do stop pretending to scan.
   */
  const waitingOnPartner = Boolean(matchId) && !partnerPresent;

  return useMemo<FaceSyncView>(
    () => ({
      ...state,
      visible:
        state.phase === "waiting_for_faces" ||
        state.phase === "scanning" ||
        state.phase === "calculating" ||
        state.phase === "showing_result",
      /*
       * Only the opening phase counts as "we cannot see you".
       * Once a run is under way, briefly losing the face is
       * ordinary -- people blink and move -- and flashing a
       * warning at every dropped frame would be worse than
       * saying nothing. The run-level timeout is what handles a
       * face that never comes back.
       */
      localFaceMissing: state.phase === "waiting_for_faces" || waitingOnPartner,
    }),
    [state, waitingOnPartner],
  );
}
