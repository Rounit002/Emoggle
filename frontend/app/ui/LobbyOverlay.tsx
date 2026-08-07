"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Button, ProgressBar, cn } from "./";

interface LobbyOverlayProps {
  status: "idle" | "connecting" | "waiting" | "matched" | "stopped" | "error";
  /** When did the user join the queue? Drives the progress bar. */
  queueStartedAt: number | null;
  /** Cancel the matchmaking. */
  onCancel: () => void;
  /** Optional emoji to put in the big circle. */
  emoji?: string;
  /** Optional headline override. */
  headline?: string;
  /** Optional sub-copy. */
  sub?: string;
  /** Optional pro-tip. */
  proTip?: string;
}

/**
 * The "Finding your match…" waiting state.
 *
 * Off-white card, yellow sticker-shadowed circle with an emoji,
 * Quicksand headline, a striped candy-cane progress bar that fills
 * as 0..20s elapses, a pink pro-tip callout, and a purple cancel
 * search button. No spinners. No loops other than the slow stripe
 * (1.4s cycle, well under the 3 Hz safety threshold).
 */
export function LobbyOverlay({
  status,
  queueStartedAt,
  onCancel,
  emoji = "😜",
  headline,
  sub,
  proTip = "Warm up those face muscles! It's going to be a squishy ride.",
}: LobbyOverlayProps) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!queueStartedAt) return;
    const id = window.setInterval(() => {
      setElapsed(Math.min(1, (Date.now() - queueStartedAt) / 20_000));
    }, 250);
    return () => window.clearInterval(id);
  }, [queueStartedAt]);

  const isConnecting = status === "connecting" || status === "idle";
  const value = isConnecting ? 0.05 : elapsed || 0.2;
  const label = "0s";
  const trailing = "20s";

  const title =
    headline ??
    (isConnecting ? "Setting up" : "Finding your match…");
  const body =
    sub ??
    "We're matching you with a stranger. Most duels start in under 20 seconds.";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="absolute inset-0 z-30 flex items-center justify-center bg-[var(--ink-overlay)] p-4"
    >
      <motion.div
        initial={{ y: 16, opacity: 0, scale: 0.96, rotate: -1 }}
        animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 24 }}
        className={cn(
          "flex w-full max-w-md flex-col items-center gap-5",
          "rounded-3xl border-[4px] border-[var(--charcoal)] bg-[var(--off-white-2)] p-6 text-center sm:p-8",
          "shadow-[8px_8px_0_0_var(--charcoal)]",
        )}
      >
        <motion.div
          initial={{ scale: 0.85, opacity: 0, rotate: -4 }}
          animate={{ scale: 1, opacity: 1, rotate: -4 }}
          transition={{ type: "spring", stiffness: 280, damping: 20 }}
          className="flex h-24 w-24 items-center justify-center rounded-2xl border-[4px] border-[var(--charcoal)] bg-[var(--yellow)] shadow-[6px_6px_0_0_var(--charcoal)] sm:h-28 sm:w-28"
          aria-hidden
        >
          <span className="-rotate-3 text-5xl">😜</span>
        </motion.div>

        <h2 className="font-display text-2xl font-bold leading-tight text-[var(--charcoal)] sm:text-3xl">
          {title}
        </h2>

        <p className="max-w-sm text-sm leading-relaxed text-[var(--on-surface-variant)]">
          {body}
        </p>

        <div className="w-full">
          <ProgressBar
            value={value}
            tone="yellow"
            candyStripe
            animated
            label={label}
            trailing={trailing}
          />
        </div>

        <div
          className="flex w-full flex-col items-start gap-1 rounded-2xl border-[3px] border-[var(--charcoal)] bg-[var(--pink)] p-4 text-left shadow-[4px_4px_0_0_var(--charcoal)]"
        >
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--pink-deep)]">
            <span className="mr-1.5 inline-block align-middle">💡</span>
            Pro tip
          </span>
          <p className="text-sm font-bold text-[var(--charcoal)]">{proTip}</p>
        </div>

        <Button variant="secondary" onClick={onCancel} block>
          Cancel search
        </Button>
      </motion.div>
    </motion.div>
  );
}
