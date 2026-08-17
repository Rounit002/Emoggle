"use client";

/**
 * ShareButton
 * -----------
 * The user-facing "Share Scorecard" control. The actual image
 * generation + Web Share API + download flow lives in
 * `useShareScorecard`; this component is just the button surface
 * and the post-share confirmation toast.
 *
 * States
 *  - idle       — "Share Scorecard"
 *  - generating — "Generating Scorecard..." (image render in flight)
 *  - opening    — "Opening Share..." (native share sheet opening)
 *  - shared     — momentary "Scorecard sent" confirmation, then
 *                 back to idle.
 *  - downloaded — "Scorecard saved! Share it anywhere 🔥" — shown
 *                 when the Web Share API was not available and the
 *                 file was saved locally.
 *  - error      — "Couldn't share. Tap to retry."
 *
 * The button is disabled while `isBusy` so the user can't queue
 * multiple captures.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../../ui/cn";
import type { SharePhase } from "./useShareScorecard";

interface ShareButtonProps {
  phase: SharePhase;
  isBusy: boolean;
  error: string | null;
  onClick: () => void;
  className?: string;
}

interface ButtonContent {
  label: string;
  emoji: string;
  tone: "primary" | "secondary" | "success" | "danger";
}

const STATE_CONTENT: Record<SharePhase | "default", ButtonContent> = {
  idle: { label: "Share Scorecard", emoji: "📤", tone: "primary" },
  default: { label: "Share Scorecard", emoji: "📤", tone: "primary" },
  generating: { label: "Generating Scorecard...", emoji: "⏳", tone: "primary" },
  opening: { label: "Opening Share...", emoji: "📲", tone: "primary" },
  shared: { label: "Scorecard sent", emoji: "✅", tone: "success" },
  downloaded: { label: "Scorecard saved! Share it anywhere 🔥", emoji: "🔥", tone: "success" },
  error: { label: "Couldn't share. Tap to retry.", emoji: "⚠️", tone: "danger" },
};

const TONE_STYLES: Record<ButtonContent["tone"], string> = {
  primary: "bg-[var(--purple)] text-[var(--off-white)] hover:bg-[var(--purple-deep)]",
  secondary: "bg-[var(--off-white-2)] text-[var(--charcoal)] hover:bg-[var(--surface-container-high)]",
  success: "bg-[var(--yellow)] text-[var(--charcoal)] hover:bg-[var(--primary-fixed)]",
  danger: "bg-[var(--pink)] text-[var(--charcoal)] hover:bg-[var(--tertiary-container)]",
};

export function ShareButton({
  phase,
  isBusy,
  error,
  onClick,
  className,
}: ShareButtonProps) {
  // After a successful share or download, briefly hold the success
  // state so the user sees the confirmation, then return to idle.
  // The pattern is the standard "sync React state to a derived
  // value with a timer" — the effect is the right place because
  // the phase lives in a parent and we only need to bridge the
  // brief "hold success" gap. The setState calls happen in
  // synchronous timeouts and on every phase change, not in a way
  // that creates a render loop.
  const [displayedPhase, setDisplayedPhase] = useState<SharePhase>(phase);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayedPhase(phase);
    if (phase === "shared" || phase === "downloaded") {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        setDisplayedPhase("idle");
        timerRef.current = null;
      }, 2400);
    }
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [phase]);

  const content = STATE_CONTENT[displayedPhase] ?? STATE_CONTENT.default;

  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      <button
        type="button"
        onClick={onClick}
        disabled={isBusy}
        aria-label={content.label}
        className={cn(
          "relative inline-flex h-14 w-full items-center justify-center gap-2 rounded-full border-[3px] border-[var(--charcoal)] px-6 text-[15px] font-bold tracking-tight",
          "shadow-[4px_4px_0_0_var(--charcoal)] active:translate-y-1 active:shadow-[0_0_0_0_var(--charcoal)]",
          "transition-transform duration-100 ease-out",
          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--charcoal)]",
          "disabled:cursor-not-allowed disabled:opacity-60",
          TONE_STYLES[content.tone],
        )}
      >
        {/* Sheen overlay (matches the rest of the design system) */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
          style={{
            background:
              "linear-gradient(to bottom, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0) 50%)",
          }}
        />
        <span aria-hidden className="relative text-lg leading-none">
          {content.emoji}
        </span>
        <span className="relative whitespace-nowrap">{content.label}</span>
        {isBusy && <Spinner />}
      </button>

      <AnimatePresence>
        {error && phase === "error" && (
          <motion.span
            key="error"
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            role="status"
            className="px-1 text-center text-xs text-[var(--pink-deep)]"
          >
            {error}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="relative ml-1 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}
