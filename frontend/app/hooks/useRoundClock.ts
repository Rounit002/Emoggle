"use client";

/**
 * useRoundClock
 * -------------
 * Turns the round schedule into the values the arena renders, and
 * fires the end-of-round callback.
 *
 * The scan window starts when this device receives the server's
 * "go" packet and runs a full `durationSec` from there, so nobody
 * is handed a short round because their link is slow.
 *
 * Every tick then recomputes the time left from `Date.now()`
 * against `scanEndsAt` instead of decrementing a counter. That is
 * what keeps the two devices together: background throttling, a
 * stalled radio, or a busy face detector can stretch a 1s interval
 * well past a second, and a decrementing timer turns every one of
 * those stretches into permanent drift — ten ticks taking twelve
 * real seconds. Recomputing means a device that falls behind skips
 * ahead and still stops ten real seconds after its own start.
 */

import { useEffect, useRef, useState } from "react";
import type { RoundSchedule } from "../lib/serverClock";

export type RoundClockPhase = "idle" | "countdown" | "playing" | "ended";

export interface RoundClockState {
  phase: RoundClockPhase;
  /** Countdown digit to display: 3..1, then 0 for the "SNAP!" beat. */
  countdownValue: number | null;
  /** Whole seconds left in the scan window, or null outside it. */
  secondsLeft: number | null;
}

/** Fast enough that the visible digit never lags its true value. */
const TICK_MS = 100;
/** How long the "SNAP!" frame (count 0) stays up once the scan opens. */
const SNAP_HOLD_MS = 350;

const IDLE_STATE: RoundClockState = { phase: "idle", countdownValue: null, secondsLeft: null };
/** A round exists but has not been evaluated yet — always starts in the countdown. */
const PENDING_STATE: RoundClockState = { phase: "countdown", countdownValue: null, secondsLeft: null };

function evaluate(schedule: RoundSchedule | null, now: number): RoundClockState {
  if (!schedule) return IDLE_STATE;

  if (now < schedule.countdownEndsAt) {
    const countdownValue = Math.max(1, Math.ceil((schedule.countdownEndsAt - now) / 1000));
    return { phase: "countdown", countdownValue, secondsLeft: null };
  }

  // Counted down to zero, waiting on the "go" packet. Normally a
  // single network hop — the "SNAP!" frame covers it.
  if (now < schedule.scanStartsAt) {
    return { phase: "countdown", countdownValue: 0, secondsLeft: null };
  }

  if (now < schedule.scanEndsAt) {
    return {
      phase: "playing",
      // Hold the zero a beat longer so the "SNAP!" transition still
      // plays once the window opens.
      countdownValue: now < schedule.scanStartsAt + SNAP_HOLD_MS ? 0 : null,
      secondsLeft: Math.max(0, Math.ceil((schedule.scanEndsAt - now) / 1000)),
    };
  }

  return { phase: "ended", countdownValue: null, secondsLeft: 0 };
}

export function useRoundClock({
  schedule,
  active,
  onScanEnd,
}: {
  schedule: RoundSchedule | null;
  /** False while there is no live match (lobby, results, disconnected). */
  active: boolean;
  /** Fired once per schedule, the moment the scan window closes. */
  onScanEnd?: () => void;
}): RoundClockState {
  // The snapshot is tagged with the schedule it was computed from,
  // so a round that has just been swapped in never renders one frame
  // of the previous round's numbers while waiting for the first tick.
  const [snapshot, setSnapshot] = useState<{
    schedule: RoundSchedule | null;
    state: RoundClockState;
  }>({ schedule: null, state: IDLE_STATE });
  const onScanEndRef = useRef(onScanEnd);
  const firedForRef = useRef<RoundSchedule | null>(null);

  useEffect(() => {
    onScanEndRef.current = onScanEnd;
  }, [onScanEnd]);

  useEffect(() => {
    if (!active || !schedule) return;

    let cancelled = false;
    let interval = 0;
    let finished = false;

    // The round is over and the state can no longer change — stop
    // ticking rather than running a 10Hz timer behind the result
    // screen. `finished` also covers the case where the very first
    // evaluation is already past the deadline, so no interval is
    // started at all (clearing one by id would be too early there).
    const stopTicking = () => {
      finished = true;
      window.clearInterval(interval);
    };

    const tick = () => {
      if (cancelled) return;
      const next = evaluate(schedule, Date.now());
      setSnapshot((previous) =>
        previous.schedule === schedule &&
        previous.state.phase === next.phase &&
        previous.state.countdownValue === next.countdownValue &&
        previous.state.secondsLeft === next.secondsLeft
          ? previous
          : { schedule, state: next },
      );
      if (next.phase !== "ended") return;
      stopTicking();
      if (firedForRef.current !== schedule) {
        firedForRef.current = schedule;
        onScanEndRef.current?.();
      }
    };

    tick();
    if (!finished) interval = window.setInterval(tick, TICK_MS);
    // A backgrounded tab may not run the interval at all. Recompute
    // the instant it comes back so the round is never resumed from a
    // stale value.
    const onVisibility = () => tick();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, schedule]);

  if (!active || !schedule) return IDLE_STATE;
  // Between a schedule swap and that schedule's first tick, report
  // the neutral pre-round state rather than the previous round's
  // numbers. The tick lands in the same commit's effect, so this is
  // at most one frame with no digit on screen.
  if (snapshot.schedule !== schedule) return PENDING_STATE;
  return snapshot.state;
}
