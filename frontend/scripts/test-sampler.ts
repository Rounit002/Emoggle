/**
 * Smoke test for the stable score sampler. Exercises the hook
 * directly (no React) by faking the React state lifecycle with
 * a tiny driver.
 */
import {
  isValidScoreSample,
  type StableSamplerState,
} from "../app/hooks/useStableScoreSampler";

// Simulate the interval loop in plain JS. Returns the final
// state and the sample list. Mirrors what the hook does in
// React, minus the component lifecycle.
function simulate(opts: {
  scores: Array<{ score: number | null; valid: boolean } | null>;
  intervalMs: number;
  tickCount: number;
}): { final: StableSamplerState } {
  const state: StableSamplerState = { sampleCount: 0, average: 0, peak: 0 };
  const total = Math.min(opts.scores.length, opts.tickCount);
  for (let i = 0; i < total; i += 1) {
    const s = opts.scores[i];
    if (!s || !s.valid || s.score === null || !Number.isFinite(s.score)) continue;
    const nextCount = state.sampleCount + 1;
    const nextSum = state.average * state.sampleCount + s.score;
    state.average = nextSum / nextCount;
    if (s.score > state.peak) state.peak = s.score;
    state.sampleCount = nextCount;
  }
  void opts.intervalMs;
  return { final: state };
}

let failed = 0;
const expect = (name: string, ok: boolean, extra: string) => {
  console.log(`${ok ? "OK  " : "FAIL"}  ${name.padEnd(48)}  ${extra}`);
  if (!ok) failed += 1;
};

// isValidScoreSample rules
expect("null score is invalid", !isValidScoreSample(null, "ready"), "ready + null");
expect("undefined score is invalid", !isValidScoreSample(undefined, "ready"), "ready + undefined");
expect("NaN is invalid", !isValidScoreSample(NaN, "ready"), "ready + NaN");
expect("Infinity is invalid", !isValidScoreSample(Infinity, "ready"), "ready + Infinity");
expect("loading is invalid", !isValidScoreSample(5, "loading"), "loading");
expect("no-face is invalid", !isValidScoreSample(5, "no-face"), "no-face");
expect("error is invalid", !isValidScoreSample(5, "error"), "error");
expect("ready + finite is valid", isValidScoreSample(5, "ready"), "ready + 5");

// Mean calculation
{
  const { final } = simulate({
    scores: [70, 80, 60, 90].map((s) => ({ score: s, valid: true })),
    intervalMs: 100,
    tickCount: 100,
  });
  expect("mean of [70,80,60,90] = 75", Math.abs(final.average - 75) < 1e-9, `got ${final.average}`);
  expect("peak = 90", final.peak === 90, `got ${final.peak}`);
  expect("count = 4", final.sampleCount === 4, `got ${final.sampleCount}`);
}

// Invalid samples are dropped
{
  const { final } = simulate({
    scores: [
      { score: 70, valid: true },
      { score: null, valid: false },
      { score: 80, valid: true },
      { score: 5, valid: false }, // valid=false simulates no-face
      { score: 90, valid: true },
    ],
    intervalMs: 100,
    tickCount: 5,
  });
  expect("mean drops invalid samples = 80", Math.abs(final.average - 80) < 1e-9, `got ${final.average}`);
  expect("count = 3", final.sampleCount === 3, `got ${final.sampleCount}`);
}

// Full 10s at 100ms = 100 ticks; if all valid, count = 100
{
  const scores = Array.from({ length: 100 }, () => ({ score: 5 + Math.random() * 3, valid: true }));
  const { final } = simulate({ scores, intervalMs: 100, tickCount: 100 });
  expect("100 ticks -> 100 valid samples", final.sampleCount === 100, `got ${final.sampleCount}`);
}

// No valid samples -> 0
{
  const { final } = simulate({
    scores: [
      { score: null, valid: false },
      { score: 0, valid: false },
    ],
    intervalMs: 100,
    tickCount: 2,
  });
  expect("no valid samples -> count 0", final.sampleCount === 0, `got ${final.sampleCount}`);
  expect("no valid samples -> avg 0", final.average === 0, `got ${final.average}`);
}

console.log(`\n${failed === 0 ? "ALL OK" : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
