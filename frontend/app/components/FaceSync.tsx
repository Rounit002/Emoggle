"use client";

/**
 * FaceSync
 * --------
 * The card that sits between the two video tiles while the
 * resemblance is being measured, and then reveals the number.
 *
 * Design notes:
 *  - It lives in the seam, not over the faces. The whole joke is
 *    "do these two look alike", which does not work if a modal is
 *    covering both of them.
 *  - It borrows the arena's sticker language directly: thick
 *    charcoal border, hard offset shadow, hyper-rounded, one
 *    spring per moment. No gradients, no glow.
 *  - The percentage is the focal point and everything else is
 *    sized down from it. On mobile the card becomes a short
 *    horizontal strip so it costs almost no vertical space.
 *  - The disclaimer is always present and always quiet. It is
 *    there so nobody mistakes a bit for a claim, not to be read
 *    aloud.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  FACE_SYNC_DISCLAIMER,
  MISSING_FACE_HINT,
  MISSING_FACE_TITLE,
  bandLabel,
  bandLine,
  scanningLine,
} from "../lib/faceSync/messages";
import type { FaceSyncResult } from "../lib/faceSync/types";
import { cn } from "../ui";

interface FaceSyncProps {
  phase: "waiting_for_faces" | "scanning" | "calculating" | "showing_result";
  result: FaceSyncResult | null;
  /** Neither face is usable yet — nudge them into frame. */
  faceMissing: boolean;
  /** Samples banked so far, for the scan progress bar. */
  sampleCount: number;
  /** Samples needed before the bar reads full. */
  sampleTarget: number;
  /** Seeds which scanning line is shown. Stable per match. */
  variantSeed: number;
}

/** How long the number spends counting up to its final value. */
const COUNT_UP_MS = 1_000;

/**
 * Animates 0 -> value on a rAF, easing out so it decelerates into
 * the final number rather than snapping. Returns the current
 * display value and whether it has landed, so the card can fire its
 * bounce exactly once at the end.
 */
function useCountUp(value: number | null, reduceMotion: boolean) {
  const [display, setDisplay] = useState(0);
  const [landed, setLanded] = useState(false);
  const frameRef = useRef<number | null>(null);

  // All state updates happen inside the frame callback rather than
  // in the effect body: the "no face yet" case needs no state at
  // all (it is derived on the way out), and the reduced-motion case
  // simply lands on the first frame.
  useEffect(() => {
    if (value === null) return;

    const startedAt = performance.now();

    const tick = (now: number) => {
      if (reduceMotion) {
        frameRef.current = null;
        setDisplay(value);
        setLanded(true);
        return;
      }
      const progress = Math.min(1, (now - startedAt) / COUNT_UP_MS);
      // easeOutCubic — decelerates into the number instead of
      // stopping dead on it.
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) {
        setLanded(false);
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      frameRef.current = null;
      setDisplay(value);
      setLanded(true);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [value, reduceMotion]);

  return value === null ? { display: 0, landed: false } : { display, landed };
}

export default function FaceSync({
  phase,
  result,
  faceMissing,
  sampleCount,
  sampleTarget,
  variantSeed,
}: FaceSyncProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const revealing = phase === "showing_result" && result !== null;
  const { display, landed } = useCountUp(revealing ? result.score : null, reduceMotion);

  const progress = Math.max(0, Math.min(1, sampleCount / Math.max(1, sampleTarget)));

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className={cn(
        "pointer-events-none z-30 flex w-full max-w-[320px] flex-col items-center gap-1.5",
        "rounded-2xl border-[3px] border-[var(--charcoal)] bg-[var(--off-white-2)]",
        "px-3 py-2 text-center shadow-[4px_4px_0_0_var(--charcoal)]",
        "sm:max-w-[200px] sm:gap-2 sm:rounded-3xl sm:border-[4px] sm:px-4 sm:py-4",
        "sm:shadow-[6px_6px_0_0_var(--charcoal)]",
      )}
      role="status"
      aria-live="polite"
      aria-label={
        revealing
          ? `Face match ${result.score} percent. ${bandLabel(result.category)}.`
          : "Measuring how much you two look alike"
      }
    >
      {/* Eyebrow — constant across every phase so the card has a
          stable identity while its contents change. */}
      <span className="font-display text-[9px] font-black uppercase tracking-[0.2em] text-[var(--purple-deep)] sm:text-[10px]">
        <span aria-hidden>⚡ </span>
        FaceSync
      </span>

      <AnimatePresence mode="wait" initial={false}>
        {revealing ? (
          <motion.div
            key="result"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex w-full flex-col items-center gap-0.5 sm:gap-1"
          >
            {/* The number is the whole point: everything else on
                this card is sized relative to it. */}
            <motion.span
              // One snap when the count-up lands, not a loop.
              animate={
                landed && !reduceMotion
                  ? { scale: [1, 1.14, 1] }
                  : { scale: 1 }
              }
              transition={{ duration: 0.34, ease: "easeOut" }}
              className="font-display text-[2.6rem] font-black leading-none tracking-tight tabular text-[var(--charcoal)] sm:text-[3.4rem]"
            >
              {display}
              <span className="text-[1.4rem] sm:text-[1.8rem]">%</span>
            </motion.span>

            <span className="font-display text-[9px] font-black uppercase tracking-[0.16em] text-[var(--pink-deep)] sm:text-[11px]">
              {bandLabel(result.category)}
            </span>

            <motion.p
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduceMotion ? 0 : 0.45 }}
              className="text-[11px] font-bold leading-snug text-[var(--charcoal)] sm:text-[13px]"
            >
              {bandLine(result.category, result.variant)}
            </motion.p>
          </motion.div>
        ) : faceMissing ? (
          <motion.div
            key="missing"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex w-full flex-col items-center gap-0.5"
          >
            <span className="text-[13px] font-bold leading-snug text-[var(--charcoal)] sm:text-sm">
              {MISSING_FACE_TITLE}
            </span>
            <span className="text-[10px] font-semibold text-[var(--on-surface-variant)] sm:text-[11px]">
              {MISSING_FACE_HINT}
            </span>
          </motion.div>
        ) : (
          <motion.div
            key="scanning"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex w-full flex-col items-center gap-2"
          >
            <span className="text-[12px] font-bold leading-snug text-[var(--charcoal)] sm:text-[13px]">
              {scanningLine(variantSeed)}
            </span>

            {/* A scanner that reads as "looking", not as security
                software. The bar fills with real sample progress;
                the sweep on top is what makes it feel alive. */}
            <div className="relative h-2 w-full overflow-hidden rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--off-white)]">
              <div
                className="h-full rounded-full bg-[var(--purple)]"
                style={{
                  width: `${progress * 100}%`,
                  transition: "width 0.25s ease-out",
                }}
              />
              {!reduceMotion && (
                <motion.div
                  aria-hidden
                  className="absolute inset-y-0 w-1/3 bg-white/45"
                  initial={{ x: "-120%" }}
                  animate={{ x: "320%" }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Always present, never loud. */}
      <p className="text-[8px] font-semibold leading-tight text-[var(--on-surface-variant)] opacity-70 sm:text-[9px]">
        {FACE_SYNC_DISCLAIMER}
      </p>
    </motion.div>
  );
}
