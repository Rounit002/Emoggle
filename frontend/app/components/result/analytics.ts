/**
 * resultAnalytics
 * ---------------
 * Lightweight, opt-in event tracking for the result scorecard flow.
 * The site already wires events through `console.info` in places (e.g.
 * partner reports); this helper centralizes those emissions and keeps
 * the event names + property keys in one place so they're easy to
 * swap for a real analytics sink later (PostHog, Plausible, etc.).
 *
 * Rules
 *  - Never include video frames, face boxes, or anything that could
 *    be derived from the camera feed.
 *  - Never include the partner's peer id or raw socket id — only
 *    the server-issued matchId (which is opaque).
 *  - Always swallow errors. Analytics must never break gameplay.
 */

export type ResultView = "result_viewed" | "scorecard_share_clicked" |
  "scorecard_generated" | "native_share_opened" | "scorecard_shared" |
  "scorecard_downloaded" | "play_again_clicked" | "share_cancelled" |
  "share_failed";

export interface ResultAnalyticsPayload {
  result?: "win" | "loss" | "draw";
  score?: number | null;
  accuracy?: number | null;
  expression?: string | null;
  matchId?: string | null;
  shareMethod?: "native" | "download" | "copy";
  durationMs?: number;
  reason?: string;
  /**
   * Free-form mode tag so the result screen can fire events for
   * both emoji and celebrity modes without breaking the existing
   * sink. Defaults to "emoji" when missing.
   */
  mode?: "emoji" | "celebrity" | string;
}

/**
 * Fire a single analytics event. Defaults to no-op when running
 * outside the browser. The actual transport can be swapped in
 * here without touching any call sites.
 */
export function trackResultEvent(event: ResultView, payload: ResultAnalyticsPayload = {}): void {
  if (typeof window === "undefined") return;
  try {
    const safePayload = sanitizePayload(payload);
    if (typeof console !== "undefined" && typeof console.info === "function") {
      console.info(`[Emoggle analytics] ${event}`, safePayload);
    }
  } catch {
    /* ignore — analytics is best-effort */
  }
}

function sanitizePayload(payload: ResultAnalyticsPayload): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (payload.result !== undefined) out.result = payload.result;
  if (payload.score !== undefined && payload.score !== null && Number.isFinite(payload.score)) {
    out.score = Math.round(payload.score * 10) / 10;
  }
  if (payload.accuracy !== undefined && payload.accuracy !== null && Number.isFinite(payload.accuracy)) {
    out.accuracy = Math.round(payload.accuracy);
  }
  if (typeof payload.expression === "string") {
    // Emoji are fine to log; they're already on the page. Truncate
    // just in case some future integration passes a longer string.
    out.expression = payload.expression.slice(0, 16);
  }
  if (typeof payload.matchId === "string" && payload.matchId.length > 0) {
    out.matchId = payload.matchId.slice(0, 64);
  }
  if (payload.shareMethod) out.shareMethod = payload.shareMethod;
  if (typeof payload.durationMs === "number" && Number.isFinite(payload.durationMs)) {
    out.durationMs = Math.round(payload.durationMs);
  }
  if (typeof payload.reason === "string") out.reason = payload.reason.slice(0, 80);
  if (typeof payload.mode === "string" && payload.mode.length > 0) {
    out.mode = payload.mode.slice(0, 32);
  }
  return out;
}
