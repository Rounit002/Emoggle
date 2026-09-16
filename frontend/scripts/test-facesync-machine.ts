/**
 * FaceSync state machine + copy test.
 *
 * Drives the pure reducer through every transition, including the
 * ones that only show up with real timing: a stale result arriving
 * after a skip, a duplicate result, a run that fails and then gets
 * told to continue anyway.
 */
import {
  faceSyncReducer,
  hasEnoughSamples,
  isSampling,
  isTerminal,
  type FaceSyncEvent,
} from "../app/lib/faceSync/machine";
import {
  INITIAL_FACE_SYNC_STATE,
  MAX_SAMPLES,
  MIN_SAMPLES,
  type FaceSyncCategory,
  type FaceSyncResult,
  type FaceSyncState,
} from "../app/lib/faceSync/types";
import {
  FACE_SYNC_DISCLAIMER,
  bandLabel,
  bandLine,
  scanningLine,
  __BANDS,
} from "../app/lib/faceSync/messages";

let failed = 0;
const expect = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "OK  " : "FAIL"}  ${name.padEnd(56)}  ${extra}`);
  if (!ok) failed += 1;
};

const MATCH = "match-1";
const OTHER = "match-2";

function result(matchId = MATCH, score = 87): FaceSyncResult {
  return { matchId, score, category: "twin_energy", variant: 2 };
}

/** Fold a list of events, with a fixed active match. */
function drive(events: FaceSyncEvent[], activeMatchId: string | null = MATCH): FaceSyncState {
  return events.reduce(
    (state, event) => faceSyncReducer(state, event, activeMatchId),
    INITIAL_FACE_SYNC_STATE,
  );
}

const samples = (n: number): FaceSyncEvent[] =>
  Array.from({ length: n }, () => ({ type: "SAMPLE" }) as FaceSyncEvent);

/* --- Happy path ------------------------------------------------- */

{
  const s = drive([{ type: "MATCH_STARTED" }]);
  expect("match start -> waiting_for_faces", s.phase === "waiting_for_faces", s.phase);
  expect("match start clears result", s.result === null);
  expect("match start clears samples", s.sampleCount === 0);
}

{
  const s = drive([{ type: "MATCH_STARTED" }, { type: "LOCAL_FACE_FOUND" }]);
  expect("face found -> scanning", s.phase === "scanning", s.phase);
  expect("scanning is a sampling phase", isSampling(s.phase));
}

{
  const s = drive([
    { type: "MATCH_STARTED" },
    { type: "LOCAL_FACE_FOUND" },
    ...samples(MIN_SAMPLES),
  ]);
  expect("samples accumulate", s.sampleCount === MIN_SAMPLES, String(s.sampleCount));
  expect("MIN_SAMPLES is enough to submit", hasEnoughSamples(s));
}

{
  const s = drive([
    { type: "MATCH_STARTED" },
    { type: "LOCAL_FACE_FOUND" },
    ...samples(MIN_SAMPLES),
    { type: "SUBMITTED" },
  ]);
  expect("submit -> calculating", s.phase === "calculating", s.phase);
  expect("submit sets the flag", s.submitted);
}

{
  const s = drive([
    { type: "MATCH_STARTED" },
    { type: "LOCAL_FACE_FOUND" },
    ...samples(MIN_SAMPLES),
    { type: "SUBMITTED" },
    { type: "RESULT", result: result(), matchId: MATCH },
  ]);
  expect("result -> showing_result", s.phase === "showing_result", s.phase);
  expect("result is adopted", s.result?.score === 87, String(s.result?.score));
}

{
  const s = drive([
    { type: "MATCH_STARTED" },
    { type: "LOCAL_FACE_FOUND" },
    ...samples(MIN_SAMPLES),
    { type: "SUBMITTED" },
    { type: "RESULT", result: result(), matchId: MATCH },
    { type: "RESULT_HELD" },
  ]);
  expect("hold done -> complete", s.phase === "complete", s.phase);
  expect("complete is terminal", isTerminal(s.phase));
  expect("complete keeps the result on screen", s.result?.score === 87);
}

/* --- Sample bounds ---------------------------------------------- */

{
  const s = drive([
    { type: "MATCH_STARTED" },
    { type: "LOCAL_FACE_FOUND" },
    ...samples(MAX_SAMPLES + 25),
  ]);
  expect("sample count is capped", s.sampleCount === MAX_SAMPLES, String(s.sampleCount));
}

{
  // Samples before a face is found must not count.
  const s = drive([{ type: "MATCH_STARTED" }, ...samples(10)]);
  expect("samples ignored before scanning", s.sampleCount === 0, String(s.sampleCount));
}

{
  // Losing the face mid-scan is survivable, not fatal.
  const s = drive([
    { type: "MATCH_STARTED" },
    { type: "LOCAL_FACE_FOUND" },
    ...samples(5),
    { type: "LOCAL_FACE_LOST" },
    ...samples(5),
  ]);
  expect("face loss does not end the scan", s.phase === "scanning", s.phase);
  expect("sampling resumes after face loss", s.sampleCount === 10, String(s.sampleCount));
}

/* --- Stale / duplicate results ---------------------------------- */

{
  const s = drive([
    { type: "MATCH_STARTED" },
    { type: "LOCAL_FACE_FOUND" },
    { type: "SUBMITTED" },
    // A result for the stranger we already skipped.
    { type: "RESULT", result: result(OTHER, 99), matchId: MATCH },
  ]);
  expect("stale result rejected (payload mismatch)", s.result === null, String(s.result?.score));
  expect("stale result leaves phase alone", s.phase === "calculating", s.phase);
}

{
  // Same thing via the arena's current match rather than the event's.
  const s = [
    { type: "MATCH_STARTED" } as FaceSyncEvent,
    { type: "SUBMITTED" } as FaceSyncEvent,
    { type: "RESULT", result: result(OTHER, 99), matchId: null } as FaceSyncEvent,
  ].reduce((st, ev) => faceSyncReducer(st, ev, MATCH), INITIAL_FACE_SYNC_STATE);
  expect("stale result rejected (active match guard)", s.result === null, String(s.result?.score));
}

{
  const s = drive([
    { type: "MATCH_STARTED" },
    { type: "SUBMITTED" },
    { type: "RESULT", result: result(MATCH, 87), matchId: MATCH },
    { type: "RESULT", result: result(MATCH, 12), matchId: MATCH },
  ]);
  expect("duplicate result ignored", s.result?.score === 87, String(s.result?.score));
}

{
  const s = drive([
    { type: "MATCH_STARTED" },
    { type: "SUBMITTED" },
    { type: "RESULT", result: result(), matchId: MATCH },
    { type: "RESULT_HELD" },
    // Late server retry after we already moved on.
    { type: "RESULT", result: result(MATCH, 3), matchId: MATCH },
  ]);
  expect("result after complete ignored", s.result?.score === 87, String(s.result?.score));
  expect("phase stays complete", s.phase === "complete", s.phase);
}

/* --- Failure and reset ------------------------------------------ */

{
  const s = drive([{ type: "MATCH_STARTED" }, { type: "FAIL", failure: "timeout" }]);
  expect("fail -> failed", s.phase === "failed", s.phase);
  expect("failure reason kept", s.failure === "timeout", String(s.failure));
  expect("failed is terminal", isTerminal(s.phase));
}

{
  const s = drive([
    { type: "MATCH_STARTED" },
    { type: "FAIL", failure: "no_local_face" },
    // Everything after a bypass must be inert.
    { type: "LOCAL_FACE_FOUND" },
    ...samples(10),
    { type: "SUBMITTED" },
    { type: "RESULT", result: result(), matchId: MATCH },
  ]);
  expect("failed run stays failed", s.phase === "failed", s.phase);
  expect("failed run collects nothing", s.sampleCount === 0, String(s.sampleCount));
  expect("failed run shows no result", s.result === null);
}

{
  const s = drive([
    { type: "MATCH_STARTED" },
    { type: "LOCAL_FACE_FOUND" },
    ...samples(20),
    { type: "SUBMITTED" },
    { type: "RESULT", result: result(), matchId: MATCH },
    { type: "RESET" },
  ]);
  expect("reset wipes phase", s.phase === "idle", s.phase);
  expect("reset wipes result", s.result === null);
  expect("reset wipes samples", s.sampleCount === 0, String(s.sampleCount));
  expect("reset wipes submitted", s.submitted === false);
  expect("reset wipes failure", s.failure === null);
}

{
  // Next Stranger with no explicit RESET: a fresh MATCH_STARTED
  // has to be just as clean, because that is what skip_user does.
  const s = drive([
    { type: "MATCH_STARTED" },
    { type: "LOCAL_FACE_FOUND" },
    ...samples(20),
    { type: "SUBMITTED" },
    { type: "RESULT", result: result(), matchId: MATCH },
    { type: "RESULT_HELD" },
    { type: "MATCH_STARTED" },
  ]);
  expect("re-match wipes previous result", s.result === null, String(s.result?.score));
  expect("re-match wipes samples", s.sampleCount === 0, String(s.sampleCount));
  expect("re-match wipes submitted", s.submitted === false);
  expect("re-match reopens the run", s.phase === "waiting_for_faces", s.phase);
}

/* --- Copy -------------------------------------------------------- */

const CATEGORIES: FaceSyncCategory[] = [
  "different_universes", "not_related", "distant_cousin", "kinda_see_it",
  "cousin_energy", "same_bloodline", "twin_energy", "copy_paste",
];

{
  const allHaveLines = CATEGORIES.every((c) => __BANDS[c].lines.length >= 4);
  expect("every band has >= 4 lines", allHaveLines);

  const allLabelled = CATEGORIES.every((c) => bandLabel(c).length > 0);
  expect("every band has a label", allLabelled);

  // The variant index must never fall off the end of a list.
  const wraps = CATEGORIES.every((c) =>
    [0, 1, 7, 99, 1000, -3].every(
      (v) => typeof bandLine(c, v) === "string" && bandLine(c, v).length > 0,
    ),
  );
  expect("variant index always resolves", wraps);

  const deterministic = CATEGORIES.every((c) => bandLine(c, 3) === bandLine(c, 3));
  expect("same variant -> same line", deterministic);

  const scanWraps = [0, 1, 50, -2].every((v) => scanningLine(v).length > 0);
  expect("scanning line always resolves", scanWraps);

  expect(
    "disclaimer mentions it is not a DNA test",
    /not a DNA test/i.test(FACE_SYNC_DISCLAIMER),
    FACE_SYNC_DISCLAIMER,
  );

  // No copy may assert an actual biological relationship.
  const CLAIMS =
    /\b(you are|is your|are your|confirmed|proven|dna match|blood test|actually related|genetically)\b/i;
  const offenders = CATEGORIES.flatMap((c) =>
    __BANDS[c].lines.filter((line) => CLAIMS.test(line)).map((line) => c + ": " + line),
  );
  expect("no line claims a real relationship", offenders.length === 0, offenders.join(" | "));
}

console.log("\n" + (failed === 0 ? "ALL OK" : failed + " FAILED"));
process.exit(failed === 0 ? 0 : 1);
