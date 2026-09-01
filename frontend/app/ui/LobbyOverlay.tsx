"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button, WebEmoji } from "./";

interface LobbyOverlayProps {
  status: "idle" | "connecting" | "waiting" | "matched" | "stopped" | "error";
  /** Stop matchmaking and leave the duel view. */
  onCancel: () => void;
  /** Retry after a connection failure without leaving the game. */
  onRetry?: () => void;
}

const SEARCH_EMOJIS = ["😜", "🤪", "😎", "🥳", "🤩", "😆"];
const ORBIT_RADIUS = 64;

/** A lightweight matchmaking state with no card, spinner, or timer. */
export function LobbyOverlay({ status, onCancel, onRetry }: LobbyOverlayProps) {
  const reduceMotion = useReducedMotion();
  const [isTakingLonger, setIsTakingLonger] = useState(false);
  const [retryCycle, setRetryCycle] = useState(0);
  useEffect(() => {
    if (status !== "waiting") return;
    const timer = window.setTimeout(() => setIsTakingLonger(true), 8000);
    return () => window.clearTimeout(timer);
  }, [status, retryCycle]);

  const handleRetry = () => {
    setIsTakingLonger(false);
    setRetryCycle((cycle) => cycle + 1);
    onRetry?.();
  };

  const isConnecting = status === "connecting" || status === "idle";
  const hasError = status === "error";
  const title = hasError
    ? "Couldn’t connect"
    : isConnecting
      ? "Getting ready…"
      : isTakingLonger
        ? "Still looking…"
        : "Finding your match…";
  const body = hasError
    ? "Check that the game server is running, then try again."
    : isConnecting
      ? "Connecting to the game server and preparing your camera."
      : isTakingLonger
        ? "No player has joined yet. You can keep waiting or try the search again."
        : "Looking for someone ready to make a ridiculous face.";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="absolute inset-0 z-[60] flex items-center justify-center bg-[var(--charcoal)] px-5 py-8"
    >
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 24 }}
        className="flex w-full max-w-sm flex-col items-center gap-5 text-center"
      >
        <div className="relative h-44 w-44" aria-hidden>
          <div className="absolute inset-5 rounded-full border-[2px] border-dashed border-[var(--off-white)] opacity-35" />
          <motion.div
            data-search-orbit
            className="absolute inset-0"
            animate={{ rotate: reduceMotion ? 0 : 360 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 1, repeat: Infinity, ease: "linear" }
            }
          >
            {SEARCH_EMOJIS.map((emoji, index) => {
              const angle = (index / SEARCH_EMOJIS.length) * Math.PI * 2 - Math.PI / 2;
              const x = Math.cos(angle) * ORBIT_RADIUS;
              const y = Math.sin(angle) * ORBIT_RADIUS;

              return (
                <motion.span
                  key={emoji}
                  className="absolute flex h-11 w-11 items-center justify-center rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--yellow)] text-2xl shadow-[3px_3px_0_0_var(--charcoal)]"
                  style={{
                    left: `calc(50% + ${x}px)`,
                    top: `calc(50% + ${y}px)`,
                    x: "-50%",
                    y: "-50%",
                  }}
                  animate={{ rotate: reduceMotion ? 0 : -360 }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { duration: 1, repeat: Infinity, ease: "linear" }
                  }
                >
                  <WebEmoji emoji={emoji} />
                </motion.span>
              );
            })}
          </motion.div>
          <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-[var(--charcoal)] bg-[var(--purple)] text-2xl shadow-[3px_3px_0_0_var(--charcoal)]">
            <WebEmoji emoji="👀" />
          </span>
        </div>

        <div role="status" aria-live="polite" className="flex flex-col items-center gap-2">
          <h2 className="font-display text-2xl font-bold leading-tight text-[var(--off-white)] sm:text-3xl">
            {title}
          </h2>
          <p className="max-w-xs text-sm leading-relaxed text-[var(--off-white)]/85 sm:text-base">
            {body}
          </p>
        </div>

        <div className="mt-1 flex w-full max-w-xs flex-col gap-2 sm:flex-row">
          {(hasError || isTakingLonger) && onRetry && (
            <Button onClick={handleRetry} className="min-h-11 flex-1">
              Try again
            </Button>
          )}
          <Button variant="secondary" onClick={onCancel} className="min-h-11 flex-1">
            {hasError ? "Back" : "Cancel search"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
