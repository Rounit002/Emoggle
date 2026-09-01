"use client";

/**
 * useShareScorecard
 * -----------------
 * The end-to-end "Share Scorecard" flow:
 *  1. The off-screen `<ShareScoreCard>` lives in a React portal
 *     directly under `document.body` (see `ShareScoreCardPortal`).
 *     That keeps it outside any `transform` containing block so
 *     the 1080x1350 fixed-positioned box is positioned relative
 *     to the viewport, not the result modal.
 *  2. On Share click we:
 *     - wait for `document.fonts.ready` so Quicksand / Plus Jakarta
 *       Sans are fully available before capture,
 *     - yield one rAF so the next paint has happened,
 *     - render the off-screen card to a PNG `Blob` using
 *       `html-to-image` with explicit `width` / `height` /
 *       `style` overrides,
 *     - sanity-check the resulting blob (size + non-trivial pixel
 *       content) before opening the share sheet.
 *  3. Convert the `Blob` to a `File` and ask the browser whether
 *     `navigator.canShare({ files })` is supported. If yes, hand
 *     off to the native share sheet (WhatsApp, Instagram, etc.).
 *  4. If not, download the PNG locally and show a confirmation.
 *  5. Cancellation by the user is silent. Only real failures
 *     (image generation throws, share throws not-abort) surface
 *     to the caller.
 */

import { useCallback, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import {
  SCORECARD_EXPORT_HEIGHT,
  SCORECARD_EXPORT_WIDTH,
  type ScorecardData,
} from "./ShareScoreCard";
import { trackResultEvent, type ResultAnalyticsPayload } from "./analytics";

export type SharePhase = "idle" | "generating" | "opening" | "shared" | "downloaded" | "error";

interface UseShareScorecardReturn {
  phase: SharePhase;
  isBusy: boolean;
  error: string | null;
  /** Triggers the full share flow. */
  share: () => Promise<void>;
  /** Manual reset for the parent. */
  reset: () => void;
}

const SHARE_TITLE = "Emoggle — I just played";
const SHARE_TEXT_BASE = (data: ScorecardData) =>
  `I scored ${data.accuracyPct}% on Emoggle ${outcomeEmoji(data.outcome)} Can you beat me?`;

/**
 * Outcome → share-text emoji. Mirrors the same emoji used on the
 * scorecard so the text matches the picture.
 */
function outcomeEmoji(outcome: ScorecardData["outcome"]): string {
  if (outcome === "win") return "😎";
  if (outcome === "loss") return "💀";
  return "🤝";
}

function buildFileName(data: ScorecardData): string {
  const safe = (data.accuracyPct ?? 0).toString().padStart(2, "0");
  return `emoggle-score-${safe}.png`;
}

/**
 * Wait for the next animation frame so any pending layout /
 * paint work has a chance to flush before we capture. Without
 * this, the very first capture after the card mounts sometimes
 * hits an unlaid-out subtree.
 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      resolve();
      return;
    }
    window.requestAnimationFrame(() => resolve());
  });
}

/**
 * Wait for any number of animation frames. Two frames is a
 * pragmatic minimum — the first to flush the layout, the second
 * to flush the paint of the freshly laid-out subtree.
 */
function nextFrames(count: number): Promise<void> {
  let chain = Promise.resolve();
  for (let i = 0; i < count; i += 1) {
    chain = chain.then(nextFrame);
  }
  return chain;
}

/**
 * Force the page fonts to settle. `document.fonts.ready` resolves
 * once every face used by a stylesheet has either finished
 * loading or failed. We treat failure as a non-fatal soft-wait
 * so the share still works offline.
 */
async function waitForFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    // `ready` is a Promise that resolves on the next font-status
    // change; in a worst case the browser already has all fonts
    // resolved, in which case it resolves immediately.
    await document.fonts.ready;
  } catch {
    /* ignore — best effort */
  }
  // Belt-and-braces: explicitly request the display and body
  // families we use so the renderer doesn't fall back to a
  // system face mid-capture.
  try {
    await Promise.all([
      document.fonts.load("800 1em 'Quicksand'"),
      document.fonts.load("700 1em 'Plus Jakarta Sans'"),
      document.fonts.load("700 1em 'JetBrains Mono'"),
    ]);
  } catch {
    /* ignore */
  }
}

/**
 * Sanity check the captured blob. html-to-image occasionally
 * returns a 0-byte or near-empty PNG when fonts/images aren't
 * ready or the target node is empty; we want to fail loudly
 * instead of opening a share sheet with a blank image.
 */
function blobLooksBlank(blob: Blob): boolean {
  // A valid PNG header is at least ~70 bytes; the cards we ship
  // compress to 200KB+. Anything under 4KB is almost certainly
  // an empty canvas.
  return blob.size < 4096;
}

export function useShareScorecard(nodeRef: React.RefObject<HTMLElement | null>): UseShareScorecardReturn {
  const [phase, setPhase] = useState<SharePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  // Guard against double-tap while generation is in flight. The
  // network of taps and renders means we cannot rely on the React
  // `phase` state alone.
  const inFlightRef = useRef(false);
  const startedAtRef = useRef<number>(0);

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
  }, []);

  const share = useCallback(async () => {
    if (inFlightRef.current) return;
    if (typeof window === "undefined") return;

    inFlightRef.current = true;
    startedAtRef.current = performance.now();
    setError(null);
    setPhase("generating");

    const node = nodeRef.current;
    if (!node) {
      inFlightRef.current = false;
      setPhase("error");
      setError("Scorecard not ready — try again.");
      trackResultEvent("share_failed", { reason: "no-node" });
      return;
    }

    // Make sure fonts are settled and the latest paint has been
    // committed before we ask html-to-image to walk the DOM.
    // Without this the first capture after a portal mount can
    // miss fonts/images that are still in-flight.
    await waitForFonts();
    await nextFrames(2);

    const fileName = buildFileName(parseDataFromNode(node));

    let blob: Blob | null = null;
    try {
      blob = await toBlob(node, {
        // Lock the output to 1x. The card is already at its final
        // pixel size; 1x produces the sharpest possible PNG
        // without ballooning file size.
        width: SCORECARD_EXPORT_WIDTH,
        height: SCORECARD_EXPORT_HEIGHT,
        pixelRatio: 1,
        backgroundColor: "#fff8d6",
        cacheBust: true,
        // Force the captured node to the exact target dimensions.
        // Without this, the off-screen `transform: translateX` can
        // produce a 0-width subtree on some browsers.
        style: {
          transform: "none",
          left: "0",
          top: "0",
          width: `${SCORECARD_EXPORT_WIDTH}px`,
          height: `${SCORECARD_EXPORT_HEIGHT}px`,
          position: "fixed",
          visibility: "visible",
          pointerEvents: "none",
        },
        // Don't embed the page fonts in the PNG — we already
        // waited for them above, so the captured raster contains
        // the right glyphs without paying the data-URI cost.
        skipFonts: true,
      });
    } catch (err) {
      inFlightRef.current = false;
      setPhase("error");
      setError(err instanceof Error ? err.message : "Could not generate image");
      trackResultEvent("share_failed", { reason: "render" });
      return;
    }

    if (!blob || blobLooksBlank(blob)) {
      inFlightRef.current = false;
      setPhase("error");
      setError("Scorecard image came back blank — try again.");
      trackResultEvent("share_failed", { reason: "empty-blob" });
      return;
    }

    const data = parseDataFromNode(node);
    const shareText = SHARE_TEXT_BASE(data);
    const durationMs = performance.now() - startedAtRef.current;
    trackResultEvent("scorecard_generated", {
      matchId: data.matchId ?? undefined,
      result: data.outcome,
      score: data.myScore,
      accuracy: data.accuracyPct,
      expression: data.emoji,
      durationMs,
    });

    const file = new File([blob], fileName, { type: "image/png" });

    // Native share path — supported on iOS Safari, most Android
    // Chrome, and PWA installs. The `canShare` check is the
    // authoritative one: feature-detect via the Web Share API
    // because the property can be missing on desktops entirely.
    if (typeof navigator !== "undefined" && typeof navigator.canShare === "function") {
      try {
        const shareable = navigator.canShare({ files: [file] });
        if (shareable) {
          setPhase("opening");
          trackResultEvent("native_share_opened", {
            matchId: data.matchId ?? undefined,
            shareMethod: "native",
            result: data.outcome,
          });
          try {
            await navigator.share({
              files: [file],
              title: SHARE_TITLE,
              text: shareText,
            });
            inFlightRef.current = false;
            setPhase("shared");
            trackResultEvent("scorecard_shared", {
              matchId: data.matchId ?? undefined,
              shareMethod: "native",
              result: data.outcome,
              accuracy: data.accuracyPct,
            });
            return;
          } catch (err) {
            // AbortError = the user cancelled the share sheet.
            // Treat that as a normal no-op.
            if (err instanceof DOMException && err.name === "AbortError") {
              inFlightRef.current = false;
              setPhase("idle");
              trackResultEvent("share_cancelled", {
                matchId: data.matchId ?? undefined,
                shareMethod: "native",
              });
              return;
            }
            // Any other error falls through to the download path
            // so the user always has a way to share the card.
            console.warn("[Emoggle] navigator.share failed", err);
            trackResultEvent("share_failed", {
              reason: "native-throw",
            });
          }
        }
      } catch (err) {
        // canShare itself can throw on some weird browsers. Fall through.
        console.warn("[Emoggle] canShare threw", err);
      }
    }

    // Fallback: download the image locally.
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke the URL after a tick so the browser has time to
      // start the download.
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      inFlightRef.current = false;
      setPhase("downloaded");
      trackResultEvent("scorecard_downloaded", {
        matchId: data.matchId ?? undefined,
        shareMethod: "download",
        result: data.outcome,
        accuracy: data.accuracyPct,
      });
    } catch (err) {
      inFlightRef.current = false;
      setPhase("error");
      setError(err instanceof Error ? err.message : "Could not save image");
      trackResultEvent("share_failed", { reason: "download" });
    }
  }, [nodeRef]);

  return {
    phase,
    isBusy: phase === "generating" || phase === "opening",
    error,
    share,
    reset,
  };
}

/**
 * The off-screen card carries its data in `data-*` attributes
 * (set in `<ShareScoreCard>`). Parsing them back avoids forcing
 * the parent to pass a separate `current` value through and keeps
 * the capture-time data identical to what the user sees on the
 * actual ResultScreen.
 */
function parseDataFromNode(node: HTMLElement): ScorecardData & { matchId?: string | null } {
  const ds = node.dataset ?? {};
  const accuracyPct = Number.parseInt(ds.accuracy ?? "0", 10);
  const myScore = Number.parseFloat(ds.myScore ?? "0");
  const opponentScore = Number.parseFloat(ds.opponentScore ?? "0");
  const outcome = ((): ScorecardData["outcome"] => {
    if (ds.outcome === "win" || ds.outcome === "loss" || ds.outcome === "draw") {
      return ds.outcome;
    }
    return "loss";
  })();
  return {
    outcome,
    accuracyPct: Number.isFinite(accuracyPct) ? accuracyPct : 0,
    myScore: Number.isFinite(myScore) ? myScore : 0,
    opponentScore: Number.isFinite(opponentScore) ? opponentScore : 0,
    emoji: ds.emoji ?? "😀",
    reactionMessage: ds.reaction ?? "",
    playerName: ds.playerName ?? null,
    opponentName: ds.opponentName ?? null,
    matchId: ds.matchId ?? null,
  };
}

/** Re-exported for type consumers. */
export type { ResultAnalyticsPayload };
