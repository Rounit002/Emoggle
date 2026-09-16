"use client";

/**
 * serverClock
 * -----------
 * One shared timeline for a duel.
 *
 * Every round-timing event the signaling server sends carries
 * absolute server timestamps (`countdownEndsAt`, `scanStartsAt`,
 * `scanEndsAt`). Clients can't compare those to `Date.now()`
 * directly — a phone's system clock is routinely seconds (sometimes
 * minutes) away from the server's. This module estimates the offset
 * between the two clocks with a small ping/pong handshake and
 * converts server timestamps into local ones.
 *
 * How a round is timed
 * ---------------------
 * The 3-2-1 countdown runs off the server's shared `countdownEndsAt`
 * so both screens count together. The 10-second scan window is then
 * anchored per device: it starts the moment THAT device receives the
 * server's "go" packet (`emoji_locked`) and runs a full 10 seconds
 * from there, so a player on a slow link is never handed a short
 * round. The two rounds therefore end one network hop apart — the
 * difference in delivery time, typically well under half a second.
 *
 * What the anchor does NOT do is count interval ticks. The window
 * closes at `anchor + 10s` measured against the wall clock, checked
 * on every tick. That distinction is the whole bug: a phone running
 * face detection stretches a 1s `setInterval` well past a second, so
 * ten decrements used to take twelve or more real seconds and left
 * one screen mid-round while the other already showed the result.
 */

import type { Socket } from "socket.io-client";

/** Round boundaries, already translated into the local clock. */
export interface RoundSchedule {
  matchId: string | null;
  /**
   * Local-clock ms when the FaceSync lead-in ends and the round's
   * own timeline begins. Equal to `countdownEndsAt` minus the
   * countdown length once the lead-in has resolved.
   *
   * The value published at match start is a worst-case placeholder
   * — the server does not yet know how long the lead-in will take.
   * It is corrected the moment FaceSync resolves, through the same
   * refinement path the countdown ticks already use.
   */
  faceSyncEndsAt: number;
  /** Local-clock ms when the pre-round countdown ends. */
  countdownEndsAt: number;
  /**
   * Local-clock ms when this device's scan window opens. Once the
   * "go" packet has landed this is the moment it landed; until then
   * it is a prediction with a little slack, so a delayed packet
   * can't strand the round in the countdown.
   */
  scanStartsAt: number;
  /** Local-clock ms when the scan window closes and scores are submitted. */
  scanEndsAt: number;
  /** Scan length in seconds — the full window every device gets. */
  durationSec: number;
  /** True once `scanStartsAt` is a real "go" receipt, not a prediction. */
  anchored: boolean;
}

/** Shape of the timing fields every round event carries. */
export interface RoundSchedulePayload {
  matchId?: string | null;
  serverTime?: number;
  faceSyncEndsAt?: number;
  countdownEndsAt?: number;
  scanStartsAt?: number;
  scanEndsAt?: number;
  countdownSec?: number;
  duration?: number;
}

export const DEFAULT_COUNTDOWN_SEC = 3;
export const DEFAULT_ROUND_SEC = 10;

/**
 * How long after the predicted countdown end the round starts anyway
 * when the "go" packet has not shown up. Only a safety net: the
 * packet normally arrives within one network hop of the prediction.
 */
export const GO_PACKET_SLACK_MS = 1_500;

/** Samples slower than this are assumed to be too noisy to trust. */
const MAX_USABLE_RTT_MS = 1_500;
const RESYNC_INTERVAL_MS = 20_000;
const BURST_SAMPLES = 3;
const BURST_SPACING_MS = 250;

export class ServerClock {
  /** serverTime - clientTime, in ms. Zero until the first sample lands. */
  private offsetMs = 0;
  /** Round-trip of the sample the current offset came from. */
  private bestRtt: number | null = null;
  private synced = false;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private resyncTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  /**
   * Start syncing against `socket`. Fires a short burst immediately
   * (so the offset is usually settled before the first match) and
   * then one sample every 20s to track drift.
   *
   * Safe to call again: socket.io fires `connect` on every
   * reconnect, and each call replaces the previous timers rather
   * than stacking a second sampler on top of them.
   */
  attach(socket: Socket) {
    this.clearTimers();
    this.burst(socket);
    this.resyncTimer = setInterval(() => {
      // Let a fresh sample win over a stale "best" one: relax the
      // bar a little on every resync so the offset keeps tracking
      // the server even if the very first sample was unusually fast.
      if (this.bestRtt !== null) this.bestRtt = this.bestRtt * 1.3 + 40;
      this.sample(socket);
    }, RESYNC_INTERVAL_MS);
  }

  private burst(socket: Socket) {
    for (let i = 0; i < BURST_SAMPLES; i++) {
      const timer = setTimeout(() => this.sample(socket), i * BURST_SPACING_MS);
      this.timers.push(timer);
    }
  }

  private sample(socket: Socket) {
    if (this.disposed || !socket.connected) return;
    const clientSent = Date.now();
    socket.emit("time_sync", { clientSent }, (response: { serverTime?: number } | null) => {
      if (this.disposed) return;
      const serverTime = response?.serverTime;
      if (typeof serverTime !== "number" || !Number.isFinite(serverTime)) return;
      const clientReceived = Date.now();
      const rtt = clientReceived - clientSent;
      if (rtt < 0 || rtt > MAX_USABLE_RTT_MS) return;
      if (this.bestRtt !== null && rtt > this.bestRtt) return;
      // Assume a symmetric round trip: the server's timestamp was
      // taken roughly rtt/2 before we read the reply.
      this.bestRtt = rtt;
      this.offsetMs = serverTime + rtt / 2 - clientReceived;
      this.synced = true;
    });
  }

  /**
   * Convert an absolute server timestamp into the local clock.
   *
   * Prefers the handshake-derived offset. Without one (handshake
   * still in flight, or an older server), it falls back to the
   * one-way delta carried by the packet itself: how far in the
   * future the deadline was when the server stamped it, measured
   * from the moment we received it. That costs one-way latency of
   * accuracy but never trusts the device's own wall clock.
   */
  toLocal(serverTs: number, packetServerTime?: number, receivedAt = Date.now()): number {
    if (this.synced) return serverTs - this.offsetMs;
    if (typeof packetServerTime === "number" && Number.isFinite(packetServerTime)) {
      return receivedAt + (serverTs - packetServerTime);
    }
    return serverTs;
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.resyncTimer) clearInterval(this.resyncTimer);
    this.resyncTimer = null;
  }

  dispose() {
    this.disposed = true;
    this.clearTimers();
  }
}

/**
 * Build a local-clock schedule from a round event.
 *
 * `goAnchor` is the local timestamp at which this device received
 * the server's "go" packet. When it is supplied the scan window is
 * measured from it — a full `duration` seconds for this device,
 * however late the packet arrived. Without it the window start is
 * predicted from the server's countdown deadline plus a little
 * slack, which is what the countdown phase renders against until
 * the real packet lands.
 *
 * When the server omits the timing fields (a deployment older than
 * this change) the schedule is synthesized from the receipt time and
 * the standard round lengths, so the arena is never left without a
 * clock.
 */
export function buildRoundSchedule(
  payload: RoundSchedulePayload | null | undefined,
  clock: ServerClock,
  matchId: string | null,
  receivedAt = Date.now(),
  goAnchor: number | null = null,
): RoundSchedule {
  const countdownSec = positiveOr(payload?.countdownSec, DEFAULT_COUNTDOWN_SEC);
  const durationSec = positiveOr(payload?.duration, DEFAULT_ROUND_SEC);
  const packetServerTime = payload?.serverTime;

  const predictedCountdownEnd =
    typeof payload?.countdownEndsAt === "number" && Number.isFinite(payload.countdownEndsAt)
      ? clock.toLocal(payload.countdownEndsAt, packetServerTime, receivedAt)
      : receivedAt + countdownSec * 1000;

  // The scan opens on the "go" packet. Until it lands, predict the
  // opening from the countdown deadline and allow a little slack so
  // a late packet delays the start instead of shortening the round.
  const scanStartsAt = goAnchor ?? predictedCountdownEnd + GO_PACKET_SLACK_MS;

  // A "go" that beats this device's own countdown estimate (a skewed
  // clock, a slow handshake) must not sit behind the countdown and
  // eat into the round.
  const countdownEndsAt = Math.min(predictedCountdownEnd, scanStartsAt);

  // The lead-in ends a countdown's length before the countdown
  // does. Clamped so it can never sit past the countdown deadline:
  // an older server omits the field entirely, and a corrected
  // timeline may arrive after the lead-in has already passed.
  const rawFaceSyncEnd =
    typeof payload?.faceSyncEndsAt === "number" && Number.isFinite(payload.faceSyncEndsAt)
      ? clock.toLocal(payload.faceSyncEndsAt, packetServerTime, receivedAt)
      : countdownEndsAt - countdownSec * 1000;

  return {
    matchId,
    faceSyncEndsAt: Math.min(rawFaceSyncEnd, countdownEndsAt),
    countdownEndsAt,
    scanStartsAt,
    // Every device gets the same amount of time on the clock,
    // counted from its own start.
    scanEndsAt: scanStartsAt + durationSec * 1000,
    durationSec,
    anchored: goAnchor !== null,
  };
}

/**
 * True when `next` moves a boundary far enough to be worth a
 * re-render. Refinement events (every countdown tick carries the
 * schedule) otherwise churn React state for sub-frame corrections.
 */
export function scheduleChanged(
  current: RoundSchedule | null,
  next: RoundSchedule,
  toleranceMs = 150,
): boolean {
  if (!current) return true;
  if (current.matchId !== next.matchId) return true;
  // A prediction being replaced by the real "go" receipt is always
  // worth adopting, however small the correction.
  if (current.anchored !== next.anchored) return true;
  return (
    Math.abs(current.faceSyncEndsAt - next.faceSyncEndsAt) > toleranceMs ||
    Math.abs(current.countdownEndsAt - next.countdownEndsAt) > toleranceMs ||
    Math.abs(current.scanStartsAt - next.scanStartsAt) > toleranceMs ||
    Math.abs(current.scanEndsAt - next.scanEndsAt) > toleranceMs
  );
}

function positiveOr(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
