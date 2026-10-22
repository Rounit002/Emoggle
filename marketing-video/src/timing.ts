// 120 BPM at 30 fps: one beat is exactly 15 frames, one bar 60.
// scripts/make_audio.py is written against the same grid, so every
// cut below lands on the music.
export const FPS = 30;
export const BEAT = 15;
export const BAR = BEAT * 4;
export const DURATION = BAR * 16; // 32 s

export const SCENES = {
  night: { from: 0, dur: BAR * 4 }, // 0-8s   2 AM, bored, a stranger exists
  match: { from: BAR * 4, dur: BAR * 2 }, // DROP  same face, different time zone
  rounds: { from: BAR * 6, dur: BAR * 2 }, // 3-2-1 + emoji barrage
  laugh: { from: BAR * 8, dur: BAR * 2 }, // rule #1: don't laugh
  rematch: { from: BAR * 10, dur: BAR * 2 }, // win, rematch x9, it's 3:41
  tagline: { from: BAR * 12, dur: BAR * 2 }, // two strangers. one emoji. zero chill.
  end: { from: BAR * 14, dur: BAR * 2 }, // wordmark
} as const;

// Typing cadence for the intro, shared with the soundtrack so each
// key tick sounds on the frame its character appears.
export const CLOCK_TEXT = "2:07 AM";
export const CLOCK_START = 8;
export const CLOCK_STEP = 4;
export const SLEEP_TEXT = "can't sleep.";
export const SLEEP_START = 52;
export const SLEEP_STEP = 3;

export const typedFrames = (text: string, start: number, step: number) =>
  [...text]
    .map((ch, i) => (ch === " " ? -1 : start + i * step))
    .filter((f) => f >= 0);

// The emoji barrage in bar 7: one emoji every eighth note.
export const BARRAGE = [
  { code: "1F631", say: "SCREAM", bg: "#ffd93d" },
  { code: "1F92A", say: "GO FERAL", bg: "#6f5fea" },
  { code: "1F60F", say: "SMUG", bg: "#ffb3b0" },
  { code: "1F97A", say: "PLEAD", bg: "#f9f9f9" },
  { code: "1F92F", say: "MIND = BLOWN", bg: "#ffd93d" },
  { code: "1F624", say: "FUME", bg: "#6f5fea" },
  { code: "1F913", say: "NERD MODE", bg: "#ffb3b0" },
  { code: "1F921", say: "CLOWN", bg: "#f9f9f9" },
];
export const BARRAGE_START = BAR; // local to the rounds scene
export const barrageFrame = (i: number) => Math.round(BARRAGE_START + i * (BEAT / 2));

export const REMATCH_START = 60; // local to the rematch scene
export const REMATCH_STEP = 6;
export const REMATCH_COUNT = 9;
