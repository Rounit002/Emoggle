import React from "react";
import { Html5Audio, Sequence, staticFile } from "remotion";
import {
  BARRAGE,
  BEAT,
  CLOCK_START,
  CLOCK_STEP,
  CLOCK_TEXT,
  REMATCH_COUNT,
  REMATCH_START,
  REMATCH_STEP,
  SCENES,
  SLEEP_START,
  SLEEP_STEP,
  SLEEP_TEXT,
  barrageFrame,
  typedFrames,
} from "./timing";

type Cue = { at: number; sfx: string; vol?: number };

const S = SCENES;

// Every sound effect, in absolute frames. Music (public/music.wav)
// plays underneath the whole spot; these ride on top of it.
const CUES: Cue[] = [
  // 2 AM — room tone + keyboard ticks as the clock types itself
  { at: 0, sfx: "hum", vol: 0.5 },
  ...typedFrames(CLOCK_TEXT, CLOCK_START, CLOCK_STEP).map((at) => ({ at, sfx: "tick", vol: 0.55 })),
  ...typedFrames(SLEEP_TEXT, SLEEP_START, SLEEP_STEP).map((at) => ({ at, sfx: "tick", vol: 0.35 })),
  { at: 112, sfx: "whoosh", vol: 0.6 },
  { at: 130, sfx: "ping", vol: 0.35 }, // you appear on the globe
  { at: 184, sfx: "ping", vol: 0.6 }, // ...and so does someone else
  { at: 222, sfx: "swoosh", vol: 0.7 }, // 👀

  // DROP — match found
  { at: S.match.from, sfx: "impact", vol: 0.9 },
  { at: S.match.from + 15, sfx: "pop0", vol: 0.8 }, // 😜 stamp
  { at: S.match.from + 45, sfx: "pop3", vol: 0.6 },
  { at: S.match.from + 75, sfx: "pop5", vol: 0.6 },

  // 3 · 2 · 1 · GO
  { at: S.rounds.from, sfx: "beep", vol: 0.55 },
  { at: S.rounds.from + BEAT, sfx: "beep", vol: 0.55 },
  { at: S.rounds.from + BEAT * 2, sfx: "beep", vol: 0.55 },
  { at: S.rounds.from + BEAT * 3, sfx: "beep-go", vol: 0.6 },
  ...BARRAGE.map((_, i) => ({ at: S.rounds.from + barrageFrame(i), sfx: `pop${i}`, vol: 0.7 })),

  // rule #1 — scratch the record, tick... tick... then chaos
  { at: S.laugh.from, sfx: "scratch", vol: 0.85 },
  { at: S.laugh.from + 14, sfx: "pop0", vol: 0.5 },
  { at: S.laugh.from + BEAT, sfx: "clock", vol: 0.7 },
  { at: S.laugh.from + BEAT * 2, sfx: "clock", vol: 0.7 },
  { at: S.laugh.from + BEAT * 3, sfx: "clock", vol: 0.7 },
  { at: S.laugh.from + 60, sfx: "impact", vol: 0.7 },
  { at: S.laugh.from + 60, sfx: "boing", vol: 0.7 },
  { at: S.laugh.from + 66, sfx: "pop6", vol: 0.55 },
  { at: S.laugh.from + 82, sfx: "boing", vol: 0.45 },

  // win, rematch, rematch, rematch...
  { at: S.rematch.from + 2, sfx: "swoosh", vol: 0.5 },
  { at: S.rematch.from + 10, sfx: "ding", vol: 0.7 },
  { at: S.rematch.from + 20, sfx: "pop2", vol: 0.5 },
  { at: S.rematch.from + 36, sfx: "pop4", vol: 0.6 },
  { at: S.rematch.from + 52, sfx: "click", vol: 0.9 },
  ...Array.from({ length: REMATCH_COUNT }).map((_, i) => ({
    at: S.rematch.from + REMATCH_START + i * REMATCH_STEP,
    sfx: i % 2 ? "click" : "swoosh",
    vol: 0.45,
  })),
  { at: S.rematch.from + 106, sfx: "clock", vol: 0.8 },
  { at: S.rematch.from + 108, sfx: "pop1", vol: 0.55 },

  // two strangers. one emoji. zero chill.
  { at: S.tagline.from, sfx: "swoosh", vol: 0.55 },
  { at: S.tagline.from + 30, sfx: "swoosh", vol: 0.55 },
  { at: S.tagline.from + 60, sfx: "swoosh", vol: 0.55 },
  { at: S.tagline.from + 2, sfx: "pop2", vol: 0.5 },
  { at: S.tagline.from + 32, sfx: "pop4", vol: 0.5 },
  { at: S.tagline.from + 62, sfx: "pop7", vol: 0.55 },
  { at: S.tagline.from + 96, sfx: "whoosh", vol: 0.7 },

  // end card
  { at: S.end.from, sfx: "impact", vol: 0.55 },
  { at: S.end.from + 24, sfx: "sparkle", vol: 0.6 },
  { at: S.end.from + 40, sfx: "pop5", vol: 0.55 },
];

export const Soundtrack: React.FC = () => (
  <>
    <Html5Audio src={staticFile("music.wav")} volume={0.85} />
    {CUES.map((c, i) => (
      <Sequence key={i} from={c.at} layout="none" name={`sfx ${c.sfx}`}>
        <Html5Audio src={staticFile(`sfx/${c.sfx}.wav`)} volume={c.vol ?? 0.7} />
      </Sequence>
    ))}
  </>
);
