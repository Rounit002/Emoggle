/**
 * faceSync/messages
 * -----------------
 * The voice. Score bands map to a set of lines, and the server
 * hands over the index so both players read the same joke.
 *
 * Rules the copy follows:
 *  - It is about resemblance, never about relatedness. "Sibling
 *    coded" is a bit; "you are siblings" is a claim, and we don't
 *    make claims.
 *  - Nothing here is a comment on how someone looks. The jokes are
 *    always about the pairing, never about a person.
 *
 * `bandLabel` is the big word under the number; `lines` are the
 * rotating punchline underneath it.
 */

import type { FaceSyncCategory } from "./types";

interface Band {
  /** Displayed under the percentage, e.g. "TWIN ENERGY". */
  label: string;
  lines: string[];
}

const BANDS: Record<FaceSyncCategory, Band> = {
  different_universes: {
    label: "Different Universes",
    lines: [
      "different universes \u{1F62D}",
      "yeah… absolutely not \u{1F62D}",
      "the algorithm said no",
      "same planet at least \u{1F480}",
      "zero overlap, respectfully",
    ],
  },
  not_related: {
    label: "No Overlap",
    lines: [
      "not even remotely related \u{1F480}",
      "different family trees",
      "nah, nothing's matching",
      "two completely separate plots",
      "the search found nothing \u{1F62D}",
    ],
  },
  distant_cousin: {
    label: "Distant Cousin Coded",
    lines: [
      "distant cousin coded",
      "related in another timeline",
      "maybe if I squint \u{1F440}",
      "third cousin at BEST",
      "same group chat, different families",
    ],
  },
  kinda_see_it: {
    label: "I Kinda See It",
    lines: [
      "okayyy I kinda see it \u{1F440}",
      "same cinematic universe",
      "there's SOMETHING there",
      "hold on… wait",
      "the resemblance is resemblancing",
    ],
  },
  cousin_energy: {
    label: "Cousin Energy",
    lines: [
      "cousin energy is strong",
      "family reunion vibes \u{1F440}",
      "y'all share a vibe fr",
      "cousin coded, no notes",
      "this is giving shared photo album",
    ],
  },
  same_bloodline: {
    label: "Same Bloodline Energy",
    lines: [
      "same bloodline energy \u{1F62D}",
      "sibling coded fr \u{1F480}",
      "ok this is actually crazy",
      "y'all look TOO familiar",
      "the resemblance is resemblancing HARD",
    ],
  },
  twin_energy: {
    label: "Twin Energy",
    lines: [
      "twin energy is CRAZY \u{1F480}",
      "who copied who \u{1F480}",
      "bro found his lost twin",
      "same character, different save file",
      "twin energy is insane \u{1F480}",
    ],
  },
  copy_paste: {
    label: "Ctrl+C Ctrl+V",
    lines: [
      "Ctrl+C Ctrl+V \u{1F62D}",
      "this has to be a mirror",
      "same face, different tab",
      "the render didn't even change",
      "one of you is a screenshot \u{1F480}",
    ],
  },
};

/** Shown while samples are being collected. */
export const SCANNING_LINES = [
  "hold up… y'all look familiar \u{1F440}",
  "scanning the resemblance… \u{1F440}",
  "running it back… \u{1F440}",
  "wait, let me look again \u{1F440}",
];

/** Shown when only one face is in frame. */
export const MISSING_FACE_TITLE = "Can't see both faces \u{1F440}";
export const MISSING_FACE_HINT = "Get both faces in frame";

/** The disclaimer. Always present, never loud. */
export const FACE_SYNC_DISCLAIMER =
  "just face resemblance — not a DNA test \u{1F62D}";

export function bandLabel(category: FaceSyncCategory): string {
  return BANDS[category]?.label ?? BANDS.kinda_see_it.label;
}

/**
 * Resolve the server's `variant` index to a line.
 *
 * The modulo is what makes this safe across a deploy: if the
 * server is picking from a longer or shorter list than this build
 * ships, the index still lands on a real line instead of
 * `undefined`. Both clients run the same build, so they still
 * agree with each other.
 */
export function bandLine(category: FaceSyncCategory, variant: number): string {
  const band = BANDS[category] ?? BANDS.kinda_see_it;
  const index = Number.isFinite(variant) ? Math.abs(Math.trunc(variant)) : 0;
  return band.lines[index % band.lines.length];
}

export function scanningLine(variant: number): string {
  const index = Number.isFinite(variant) ? Math.abs(Math.trunc(variant)) : 0;
  return SCANNING_LINES[index % SCANNING_LINES.length];
}

/** Exposed so the copy can be swept for tone in tests. */
export const __BANDS = BANDS;
