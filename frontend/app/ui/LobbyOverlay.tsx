"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button, WebEmoji } from "./";
import type { LocalCameraStatus } from "../hooks/useLocalCamera";

interface LobbyOverlayProps {
  status: "idle" | "connecting" | "waiting" | "matched" | "stopped" | "error";
  /** Leave the arena. */
  onCancel: () => void;
  /** Stop searching while staying in the arena. */
  onStop: () => void;
  /** Start again after stopping or a connection failure. */
  onRetry?: () => void;
  cameraStatus?: LocalCameraStatus;
  cameraError?: string | null;
  onRetryCamera?: () => void;
}

const SEARCH_EMOJIS = ["😜", "🤪", "😎", "🥳", "🤩", "😆"];
const ORBIT_RADIUS = 64;

/** A lightweight matchmaking state with no card, spinner, or timer. */
export function LobbyOverlay({
  status,
  onCancel,
  onStop,
  onRetry,
  cameraStatus,
  cameraError,
  onRetryCamera,
}: LobbyOverlayProps) {
  const [isTakingLonger, setIsTakingLonger] = useState(false);
  useEffect(() => {
    if (status !== "waiting") return;
    const timer = window.setTimeout(() => setIsTakingLonger(true), 8000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const handleRetry = () => {
    setIsTakingLonger(false);
    onRetry?.();
  };

  const isConnecting = status === "connecting" || status === "idle";
  const cameraFailed = cameraStatus === "error";
  const cameraPending = cameraStatus === "requesting";
  const hasError = status === "error";
  const isStopped = status === "stopped";
  const title = cameraFailed
    ? "Camera access needed"
    : cameraPending
      ? "Allow camera access"
      : isStopped
      ? "Search stopped"
      : hasError
    ? "Couldn’t connect"
    : isConnecting
      ? "Getting ready…"
      : isTakingLonger
        ? "Still looking…"
        : "Finding your match…";
  const body = cameraFailed
    ? cameraError ?? "Allow camera access in your browser, then try again."
    : cameraPending
      ? "Use the browser prompt to allow your camera. We’re already finding your match."
    : isStopped
    ? "You can start looking again whenever you're ready."
    : hasError
    ? "Check that the game server is running, then try again."
    : isConnecting
      ? "Connecting to the game server and preparing your camera."
      : isTakingLonger
        ? "No player has joined yet. We'll keep searching until you stop."
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
          <div
            data-search-orbit
            className="search-orbit absolute inset-0"
          >
            {SEARCH_EMOJIS.map((emoji, index) => {
              const angle = (index / SEARCH_EMOJIS.length) * Math.PI * 2 - Math.PI / 2;
              const x = Math.cos(angle) * ORBIT_RADIUS;
              const y = Math.sin(angle) * ORBIT_RADIUS;

              return (
                <span
                  key={emoji}
                  className="search-orbit-item absolute flex h-11 w-11 items-center justify-center rounded-full border-[2px] border-[var(--ink-shadow)] on-accent bg-[var(--yellow)] text-2xl shadow-[3px_3px_0_0_var(--ink-shadow)]"
                  style={{
                    left: `calc(50% + ${x}px)`,
                    top: `calc(50% + ${y}px)`,
                  }}
                >
                  <WebEmoji emoji={emoji} />
                </span>
              );
            })}
          </div>
          <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-[var(--ink-shadow)] on-accent-inverse bg-[var(--purple)] text-2xl shadow-[3px_3px_0_0_var(--ink-shadow)]">
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
          {cameraFailed && onRetryCamera ? (
            <Button onClick={onRetryCamera} className="min-h-11 flex-1">
              Try camera again
            </Button>
          ) : (hasError || isStopped) && onRetry && (
            <Button onClick={handleRetry} className="min-h-11 flex-1">
              {isStopped ? "Start searching" : "Try again"}
            </Button>
          )}
          {status === "waiting" || isConnecting ? (
            <Button variant="secondary" onClick={onStop} className="min-h-11 flex-1">
              Stop searching
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onCancel} className="min-h-11 flex-1">Back</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
