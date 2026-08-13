"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { cn } from "./cn";

/**
 * The Seam — the space between the two camera feeds in a duel.
 *
 * In the new system, the two player hues are purple (Player A) and
 * pink (Player B). The seam holds the target emoji during play and
 * the score reveal at the end.
 */

export type SeamState = "idle" | "playing" | "revealing";

interface SeamProps {
  state: SeamState;
  /** Both players' final scores, for the reveal blend. */
  scoreA?: number | null;
  scoreB?: number | null;
  /** The shared emoji target during a round. */
  emoji?: string | null;
  /** Optional center label (e.g. "Target", "1 vs 1"). */
  label?: string;
  /** Optional time left, displayed as a tabular number. */
  secondsLeft?: number | null;
  className?: string;
}

export function Seam({
  state,
  scoreA,
  scoreB,
  emoji,
  label,
  secondsLeft,
  className,
}: SeamProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center",
        "min-w-[64px] w-[72px] sm:min-w-[80px] sm:w-[120px] lg:w-[150px]",
        className,
      )}
      aria-hidden={state === "idle"}
    >
      {/* The line itself — chunky charcoal with a small offset shadow */}
      <div
        className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 bg-[var(--charcoal)]"
        aria-hidden
      />

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-2 px-2 py-4">
        {state === "playing" && (
          <PlayingContent emoji={emoji} secondsLeft={secondsLeft} label={label} />
        )}

        {state === "revealing" && (
          <RevealContent scoreA={scoreA} scoreB={scoreB} />
        )}

        {state === "idle" && label && (
          <span className="font-display text-[11px] uppercase tracking-[0.18em] text-[var(--on-surface-variant)]">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

function PlayingContent({
  emoji,
  secondsLeft,
  label,
}: {
  emoji?: string | null;
  secondsLeft?: number | null;
  label?: string;
}) {
  return (
    <>
      {label && <span className="eyebrow text-[10px]">{label}</span>}
      {emoji && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={emoji}
            initial={{ scale: 0.85, opacity: 0, y: 6, rotate: -3 }}
            animate={{ scale: 1, opacity: 1, y: 0, rotate: -3 }}
            exit={{ scale: 0.85, opacity: 0, y: -6, rotate: -3 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
            className={cn(
              "flex aspect-square w-full max-w-[180px] items-center justify-center",
              "rounded-2xl border-[3px] border-[var(--charcoal)] bg-[var(--yellow)]",
              "shadow-[5px_5px_0_0_var(--charcoal)]",
              "lg:max-w-[220px]",
            )}
            role="img"
            aria-label="Target emoji"
          >
            <span className="-rotate-3 text-5xl leading-none sm:text-6xl lg:text-7xl">
              {emoji}
            </span>
          </motion.div>
        </AnimatePresence>
      )}
      {typeof secondsLeft === "number" && (
        <span
          className={cn(
            "font-mono tabular text-sm font-bold",
            "text-[var(--on-surface-variant)]",
            secondsLeft <= 3 && "text-[var(--pink-deep)]",
          )}
        >
          {secondsLeft.toString().padStart(2, "0")}s
        </span>
      )}
    </>
  );
}

function RevealContent({
  scoreA,
  scoreB,
}: {
  scoreA?: number | null;
  scoreB?: number | null;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="eyebrow text-[10px]">Score</span>
      <div className="flex flex-col items-center leading-none">
        <AnimatePresence mode="wait">
          <motion.span
            key={`a-${scoreA ?? "—"}`}
            initial={{ y: 6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="font-mono tabular text-2xl font-bold text-[var(--purple-deep)]"
          >
            {scoreA == null ? "—" : scoreA.toFixed(1)}
          </motion.span>
        </AnimatePresence>
        <span className="my-1 h-px w-6 bg-[var(--ink-soft)]" />
        <AnimatePresence mode="wait">
          <motion.span
            key={`b-${scoreB ?? "—"}`}
            initial={{ y: 6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.25, ease: "easeOut", delay: 0.05 }}
            className="font-mono tabular text-2xl font-bold text-[var(--pink-deep)]"
          >
            {scoreB == null ? "—" : scoreB.toFixed(1)}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}

export function useCountdown(endsAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [endsAt]);
  if (endsAt === null) return null;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}
