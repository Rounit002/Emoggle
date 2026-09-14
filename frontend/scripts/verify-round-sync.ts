/**
 * Verifies how the 10-second scan window behaves on two very
 * different devices playing the same match.
 *
 * The model: the server counts 3-2-1 against a deadline both
 * clients share, then broadcasts a "go" packet. Each device starts
 * its own 10-second window the moment that packet lands, so nobody
 * plays a short round because their link is slow. The window is
 * measured against the wall clock from that anchor — NOT by
 * decrementing a 1-second interval, which is what used to let a
 * throttled phone stretch ten ticks into twelve real seconds and
 * finish long after its opponent had already seen the final score.
 *
 * Run: npx tsx scripts/verify-round-sync.ts
 */
import {
  ServerClock,
  buildRoundSchedule,
  scheduleChanged,
  type RoundSchedulePayload,
} from "../app/lib/serverClock";

const COUNTDOWN_SEC = 3;
const ROUND_SEC = 10;

/** Absolute "real" time the server starts the match, in ms. */
const T0 = 1_700_000_000_000;
/** Real time the server broadcasts the "go" packet. */
const GO_SENT = T0 + COUNTDOWN_SEC * 1000;

interface Device {
  name: string;
  /** deviceClock - realTime. A phone's clock is routinely wrong. */
  clockSkewMs: number;
  /** One-way network delay from the server to this device. */
  latencyMs: number;
  /** Whether the time_sync handshake completed before the match. */
  synced: boolean;
  /** Extra ms each clock tick actually takes (throttling). */
  tickStretchMs: number;
}

const serverPayload = (realNow: number): RoundSchedulePayload => ({
  serverTime: realNow,
  countdownEndsAt: GO_SENT,
  scanStartsAt: GO_SENT,
  scanEndsAt: GO_SENT + ROUND_SEC * 1000,
  countdownSec: COUNTDOWN_SEC,
  duration: ROUND_SEC,
});

interface Run {
  /** Real instant this device opened its scan window. */
  startedAt: number;
  /** Real instant it submitted its score. */
  endedAt: number;
  /** Real milliseconds of play the device actually got. */
  playedMs: number;
}

/** Drive one device through a match, in real-world time. */
function runDevice(device: Device, options: { goDelayMs?: number } = {}): Run {
  const toDeviceClock = (realTime: number) => realTime + device.clockSkewMs;
  const clock = new ServerClock();

  if (device.synced) {
    // Reproduce what the handshake settles on: a symmetric
    // round-trip observed on the device's own (skewed) clock.
    const rtt = device.latencyMs * 2;
    const clientReceived = toDeviceClock(T0 - 1_000 + rtt);
    const serverTime = T0 - 1_000 + device.latencyMs;
    // @ts-expect-error - exercising the settled state the handshake produces
    clock.offsetMs = serverTime + rtt / 2 - clientReceived;
    // @ts-expect-error - same
    clock.synced = true;
  }

  // match_started lands one network hop after the server sent it.
  const matchStartedReal = T0 + device.latencyMs;
  buildRoundSchedule(serverPayload(T0), clock, "match-1", toDeviceClock(matchStartedReal));

  // The "go" packet (`emoji_locked`) lands a hop after the server
  // broadcasts it, plus any extra delay the caller wants to model.
  const goReceivedReal = GO_SENT + device.latencyMs + (options.goDelayMs ?? 0);
  const schedule = buildRoundSchedule(
    serverPayload(GO_SENT),
    clock,
    "match-1",
    toDeviceClock(goReceivedReal),
    toDeviceClock(goReceivedReal),
  );

  // The clock recomputes the time left from the deadline on every
  // tick, so a stretched tick costs resolution, never drift.
  let deviceNow = toDeviceClock(goReceivedReal);
  const tickMs = 100 + device.tickStretchMs;
  while (deviceNow < schedule.scanEndsAt) deviceNow += tickMs;

  const endedAt = deviceNow - device.clockSkewMs;
  return { startedAt: goReceivedReal, endedAt, playedMs: endedAt - goReceivedReal };
}

const desktop: Device = {
  name: "desktop (fast link, correct clock)",
  clockSkewMs: 0,
  latencyMs: 15,
  synced: true,
  tickStretchMs: 0,
};

const phone: Device = {
  name: "phone (slow link, clock 45s fast, throttled timers)",
  clockSkewMs: 45_000,
  latencyMs: 380,
  synced: true,
  tickStretchMs: 120,
};

const phoneNoHandshake: Device = {
  ...phone,
  name: "phone without a completed time_sync",
  synced: false,
};

let failed = 0;
const expect = (name: string, ok: boolean, extra: string) => {
  console.log(`${ok ? "OK  " : "FAIL"}  ${name.padEnd(50)}  ${extra}`);
  if (!ok) failed += 1;
};

const desktopRun = runDevice(desktop);
const phoneRun = runDevice(phone);
const phoneNoHandshakeRun = runDevice(phoneNoHandshake);

// 1. Every device gets the whole round, counted from its own "go".
for (const [label, run] of [
  ["desktop", desktopRun],
  ["throttled phone", phoneRun],
  ["unsynced phone", phoneNoHandshakeRun],
] as const) {
  expect(
    `${label} plays a full ${ROUND_SEC}s`,
    Math.abs(run.playedMs - ROUND_SEC * 1000) <= 250,
    `${(run.playedMs / 1000).toFixed(2)}s on the wall clock`,
  );
}

// 2. The two screens stay together: they can only be as far apart
//    as their "go" packets were, never a compounding drift.
const endGap = Math.abs(phoneRun.endedAt - desktopRun.endedAt);
const goGap = Math.abs(phoneRun.startedAt - desktopRun.startedAt);
expect(
  "both screens end within one network hop",
  endGap <= goGap + 250,
  `${Math.round(endGap)}ms apart (go packets ${Math.round(goGap)}ms apart)`,
);
expect(
  "a 45s-wrong device clock never leaks into the round",
  Math.abs(phoneRun.playedMs - ROUND_SEC * 1000) < 1_000,
  `${Math.round(phoneRun.playedMs - ROUND_SEC * 1000)}ms off`,
);

// 3. The submission still has to land inside the server's window:
//    it publishes scanEndsAt and accepts for a further
//    SCORE_SUBMISSION_GRACE_MS (4s) before scoring the round itself.
const publishedDeadline = GO_SENT + ROUND_SEC * 1000;
expect(
  "the phone submits inside the server grace",
  phoneRun.endedAt - publishedDeadline < 4_000,
  `${Math.round(phoneRun.endedAt - publishedDeadline)}ms after the published deadline`,
);

// 4. The regression this replaces: counting 1-second interval ticks.
const legacyPhoneEnd = phoneRun.startedAt + ROUND_SEC * (1000 + phone.tickStretchMs * 10);
const legacyDesktopEnd = desktopRun.startedAt + ROUND_SEC * 1000;
expect(
  "counting interval ticks would have drifted",
  legacyPhoneEnd - legacyDesktopEnd > 1_000,
  `${Math.round(legacyPhoneEnd - legacyDesktopEnd)}ms apart before the fix`,
);

// 5. A badly delayed "go" packet delays the start rather than
//    shortening the round.
const stalledPhone = runDevice(phone, { goDelayMs: 900 });
expect(
  "a stalled go packet still buys a full round",
  Math.abs(stalledPhone.playedMs - ROUND_SEC * 1000) <= 250,
  `${(stalledPhone.playedMs / 1000).toFixed(2)}s of play`,
);

// 6. Schedule plumbing.
const clock = new ServerClock();
const predicted = buildRoundSchedule(serverPayload(T0), clock, "m", T0);
const jittered = buildRoundSchedule(serverPayload(T0 + 40), clock, "m", T0 + 40);
const anchored = buildRoundSchedule(serverPayload(GO_SENT), clock, "m", GO_SENT, GO_SENT);
expect(
  "the window is predicted until the go packet lands",
  !predicted.anchored && predicted.scanStartsAt > GO_SENT,
  "prediction carries slack",
);
expect("sub-tolerance refinements are ignored", !scheduleChanged(predicted, jittered), "no re-render");
expect("the real go always replaces the prediction", scheduleChanged(predicted, anchored), "re-render");
expect(
  "an anchored window is exactly the round length",
  anchored.scanEndsAt - anchored.scanStartsAt === ROUND_SEC * 1000,
  `${anchored.scanEndsAt - anchored.scanStartsAt}ms`,
);
expect(
  "a missing server schedule falls back to the defaults",
  (() => {
    const fallback = buildRoundSchedule({}, clock, "m", T0, T0 + COUNTDOWN_SEC * 1000);
    return fallback.scanEndsAt - fallback.scanStartsAt === ROUND_SEC * 1000;
  })(),
  "legacy server stays playable",
);

console.log(failed === 0 ? "\nAll round-sync checks passed." : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
