/**
 * faceSync/machine
 * ----------------
 * The FaceSync lifecycle as a pure reducer.
 *
 * Kept free of React, timers and sockets so the transitions can be
 * exercised directly (see `scripts/test-facesync-machine.ts`). The
 * hook owns the side effects; this file owns the rules.
 *
 * Two invariants the reducer enforces, because both have obvious
 * ways to go wrong once real timing is involved:
 *
 *  1. A result for a different match is never adopted. Skipping to
 *     a new stranger while the old server reply is in flight must
 *     not paint the previous stranger's number on the new one.
 *  2. Once a run reaches `complete` or `failed` it is inert. Late
 *     samples, duplicate results and a second timeout all no-op,
 *     so the arena can't be dragged back into a scanning state it
 *     has already moved on from.
 */

import {
  INITIAL_FACE_SYNC_STATE,
  MAX_SAMPLES,
  MIN_SAMPLES,
  type FaceSyncFailure,
  type FaceSyncResult,
  type FaceSyncState,
} from "./types";

export type FaceSyncEvent =
  /** A stranger connected. Carries the match this run belongs to. */
  | { type: "MATCH_STARTED" }
  /** The local camera has a usable face; start banking samples. */
  | { type: "LOCAL_FACE_FOUND" }
  /** The local face went away mid-scan. We keep collecting rather
   *  than failing — heads move, and the timeout is the real limit. */
  | { type: "LOCAL_FACE_LOST" }
  /** One usable geometry sample landed. */
  | { type: "SAMPLE" }
  /** Our vector is on the wire. */
  | { type: "SUBMITTED" }
  /** The server published the authoritative result. */
  | { type: "RESULT"; result: FaceSyncResult; matchId: string | null }
  /** The reveal has been on screen long enough. */
  | { type: "RESULT_HELD" }
  /** Give up and bypass into the emoji round. */
  | { type: "FAIL"; failure: FaceSyncFailure }
  /** New stranger, or leaving the arena. Wipes everything. */
  | { type: "RESET" };

/** True once the run can no longer change anything on screen. */
export function isTerminal(phase: FaceSyncState["phase"]): boolean {
  return phase === "complete" || phase === "failed";
}

/** True while the sampler should be running its detection loop. */
export function isSampling(phase: FaceSyncState["phase"]): boolean {
  return phase === "scanning";
}

/** Enough samples banked to submit a trustworthy vector. */
export function hasEnoughSamples(state: FaceSyncState): boolean {
  return state.sampleCount >= MIN_SAMPLES;
}

export function faceSyncReducer(
  state: FaceSyncState,
  event: FaceSyncEvent,
  /** The match the arena is currently in. Guards stale results. */
  activeMatchId: string | null = null,
): FaceSyncState {
  switch (event.type) {
    case "RESET":
      return INITIAL_FACE_SYNC_STATE;

    case "MATCH_STARTED":
      // Always a clean slate, even mid-run: `skip_user` into an
      // instant re-pair arrives as a second MATCH_STARTED with no
      // RESET in between.
      return { ...INITIAL_FACE_SYNC_STATE, phase: "waiting_for_faces" };

    case "LOCAL_FACE_FOUND":
      if (state.phase !== "waiting_for_faces") return state;
      return { ...state, phase: "scanning" };

    case "LOCAL_FACE_LOST":
      // Deliberately inert. Losing the face for a few frames is
      // normal; only the timeout ends a run early.
      return state;

    case "SAMPLE": {
      if (state.phase !== "scanning") return state;
      if (state.sampleCount >= MAX_SAMPLES) return state;
      return { ...state, sampleCount: state.sampleCount + 1 };
    }

    case "SUBMITTED": {
      if (isTerminal(state.phase)) return state;
      if (state.submitted) return state;
      return { ...state, phase: "calculating", submitted: true };
    }

    case "RESULT": {
      if (isTerminal(state.phase)) return state;
      // Stale-match guard. `matchId` is the match the result was
      // received for; `activeMatchId` is the one we're in now.
      if (event.matchId !== null && event.result.matchId !== event.matchId) return state;
      if (activeMatchId !== null && event.result.matchId !== activeMatchId) return state;
      if (state.result) return state;
      return { ...state, phase: "showing_result", result: event.result };
    }

    case "RESULT_HELD": {
      if (state.phase !== "showing_result") return state;
      return { ...state, phase: "complete" };
    }

    case "FAIL": {
      if (isTerminal(state.phase)) return state;
      return { ...state, phase: "failed", failure: event.failure };
    }

    default:
      return state;
  }
}
