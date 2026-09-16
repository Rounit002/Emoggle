/**
 * faceSync/types
 * --------------
 * The shared vocabulary for FaceSync — the playful "how much do
 * you two look alike" beat that runs once per stranger, between
 * the match connecting and the emoji round starting.
 *
 * Everything here is deliberately free of React and of MediaPipe
 * so the geometry maths, the state machine, and the server can all
 * import the same definitions without dragging a runtime in.
 *
 * A note on what this feature is NOT (and the code should never
 * imply otherwise): it is a resemblance toy. It does not identify
 * anyone, does not infer relatedness, and never touches skin tone,
 * apparent age, gender or any other demographic signal. The vector
 * below is a short list of normalized bone-structure ratios and
 * nothing else.
 */

/** Length of the geometry vector on the wire. Client and server
 *  both hard-validate against this, so a version skew is a clean
 *  rejection rather than a silently wrong score. */
export const FACE_VECTOR_LENGTH = 20;

/**
 * Every ratio is normalized against the face's own dimensions, so
 * values cluster in a narrow band. The bound is loose enough to
 * pass any real face and tight enough that a hostile client can't
 * push the similarity maths somewhere strange.
 */
export const FACE_VECTOR_MIN = -4;
export const FACE_VECTOR_MAX = 4;

/** A face reduced to normalized structural ratios. */
export type FaceVector = number[];

/**
 * Score bands. The server derives the category from the score, so
 * both players are handed the same one — the client only ever maps
 * it to copy.
 */
export type FaceSyncCategory =
  | "different_universes"
  | "not_related"
  | "distant_cousin"
  | "kinda_see_it"
  | "cousin_energy"
  | "same_bloodline"
  | "twin_energy"
  | "copy_paste";

/** The authoritative result, exactly as it arrives from the server. */
export interface FaceSyncResult {
  /** Which match this belongs to. Anything else is stale and dropped. */
  matchId: string;
  /** 0-100, integer. */
  score: number;
  category: FaceSyncCategory;
  /**
   * Which line of copy to show. The server picks the index so both
   * players read the same joke; the copy itself stays on the client
   * where the rest of the voice lives.
   */
  variant: number;
}

/**
 * The lifecycle. Linear apart from the failure exit, which any
 * state can drop into.
 *
 *   idle
 *     └─ matched ──► waiting_for_faces
 *                      └─ local face found ──► scanning
 *                                                └─ samples in ──► calculating
 *                                                                    └─ server result ──► showing_result
 *                                                                                           └─ hold done ──► complete
 *   (any) ──► failed ──► complete
 *
 * `failed` is not an error screen. It is the graceful bypass: the
 * arena moves straight into the emoji round and the player never
 * learns FaceSync was going to happen.
 */
export type FaceSyncPhase =
  | "idle"
  | "waiting_for_faces"
  | "scanning"
  | "calculating"
  | "showing_result"
  | "complete"
  | "failed";

/** Why a run gave up. Kept for local diagnostics only — never sent. */
export type FaceSyncFailure =
  | "no_local_face"
  | "no_partner"
  | "timeout"
  | "landmarker_unavailable"
  | "aborted";

export interface FaceSyncState {
  phase: FaceSyncPhase;
  /** Populated only in `showing_result` / `complete`. */
  result: FaceSyncResult | null;
  /** How many usable samples the local scan has banked so far. */
  sampleCount: number;
  /** True once our vector is on the wire and we're waiting on the server. */
  submitted: boolean;
  failure: FaceSyncFailure | null;
}

export const INITIAL_FACE_SYNC_STATE: FaceSyncState = {
  phase: "idle",
  result: null,
  sampleCount: 0,
  submitted: false,
  failure: null,
};

/* ─── Tuning ─────────────────────────────────────────────────────── */

/** Samples needed before we'll submit a vector. At ~12 Hz this is
 *  a little over a second of face. */
export const MIN_SAMPLES = 14;
/** Stop sampling here — more frames stop improving the median. */
export const MAX_SAMPLES = 40;
/**
 * Hard ceiling on local collection, from `waiting_for_faces` to
 * publishing something.
 *
 * This MUST stay comfortably under the server's own collection
 * window (`FACE_SYNC_COLLECT_MS`, 7s). The fast bypass depends on
 * an honest client always reporting — even if only to say it has
 * nothing — before the server gives up waiting. If this timer were
 * the longer of the two, a player with no camera would hold their
 * partner in the lead-in for the full server window instead of
 * releasing it in milliseconds.
 */
export const FACE_SYNC_TIMEOUT_MS = 5_500;
/** How long the revealed number stays up before the round starts. */
export const RESULT_HOLD_MS = 2_600;
