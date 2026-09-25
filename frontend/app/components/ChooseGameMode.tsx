"use client";

/**
 * ChooseGameMode
 * --------------
 * A full-screen mode picker. The "Play now" CTA on the home
 * page opens this instead of dropping the user straight into
 * stranger matchmaking. Four options, all with the same
 * sticker-card visual language as the rest of Emoggle:
 *
 *  - Solo          – play the emoji-expression challenge alone
 *                    and beat your own score.
 *  - Stranger      – the existing random-matchmaking flow.
 *  - Celebrity     – the celebrity-expression game.
 *  - FaceSync      – pair with a stranger and see how much you
 *                    two look alike. Its own queue, so nobody who
 *                    picks it lands in an emoji duel instead.
 *
 * Every mode is free to play.
 *
 * Back / cancel
 *  The modal has a real back chevron (top-left) and a visible
 *  "Back" link in the footer. Both call `onClose`. Escape
 *  closes the modal too — the home page is one tap away
 *  whenever the user changes their mind.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  Camera,
  Crown,
  Sparkle,
  Target,
  WebEmoji,
  X,
  cn,
} from "../ui";
import DoodleBackdrop from "./home/DoodleBackdrop";
import { useCoveredView } from "./home/useCoveredView";

export type GameMode = "camera" | "solo" | "celebrity" | "facesync";

export interface ChooseGameModeProps {
  open: boolean;
  onClose: () => void;
  onSelect: (mode: GameMode) => void;
}

interface ModeOption {
  id: GameMode;
  /** Big emoji icon shown in the card header. */
  glyph: string;
  /** Short title for the card. */
  title: string;
  /** One-line description for the card. */
  description: string;
  /** Background fill colour for the card body. */
  fill: "yellow" | "purple" | "pink" | "violet";
  /** CTA label on the card button. */
  cta: string;
  /** Small icon next to the CTA. */
  ctaIcon: React.ReactNode;
  /** Optional badge in the corner (e.g. "VIP"). */
  badge?: string;
  /** Slight tilt for the scattered-on-a-table look. */
  tilt: "tilt-l-1" | "tilt-l-2" | "tilt-r-1" | "tilt-r-2" | "tilt-0";
}

// The `on-accent` scope pins the ink for the whole card subtree, so
// the title, body copy, badge and CTA inside keep printing dark on
// these fills in dark mode instead of flipping to off-white.
const FILL_CLASSES: Record<ModeOption["fill"], string> = {
  yellow: "on-accent bg-[var(--yellow)] text-[var(--ink)]",
  purple: "on-accent-inverse bg-[var(--purple)] text-[var(--ink)]",
  pink: "on-accent bg-[var(--pink)] text-[var(--ink)]",
  // FaceSync gets the soft purple wash rather than a fourth hue:
  // the palette only has three accents, and inventing one would
  // put a colour on screen that exists nowhere else.
  violet: "on-accent bg-[var(--purple-container)] text-[var(--ink)]",
};

const MODE_OPTIONS: ModeOption[] = [
  {
    id: "solo",
    glyph: "🤪",
    title: "Solo",
    description: "Match the emoji alone. Beat your own personal best.",
    fill: "yellow",
    cta: "Play Solo",
    ctaIcon: <Target size={18} />,
    badge: "Solo",
    tilt: "tilt-l-1",
  },
  {
    id: "camera",
    glyph: "😎",
    title: "Play With Stranger",
    description: "Match with a real player. Whoever mimics the emoji best wins.",
    fill: "purple",
    cta: "Find a Match",
    ctaIcon: <Camera size={18} />,
    badge: "Live",
    tilt: "tilt-r-1",
  },
  {
    id: "facesync",
    glyph: "⚡",
    title: "FaceSync",
    description: "Match with a stranger and find out how much you two actually look alike.",
    fill: "violet",
    cta: "Compare Faces",
    ctaIcon: <Sparkle size={18} />,
    badge: "New",
    tilt: "tilt-r-2",
  },
  {
    id: "celebrity",
    glyph: "🏆",
    title: "Celebrity Face",
    description: "Match with a stranger, then imitate the celebrity face on screen. Closest expression wins.",
    fill: "pink",
    cta: "Play Now",
    ctaIcon: <Camera size={18} />,
    badge: "New",
    tilt: "tilt-l-2",
  },
];

export function ChooseGameMode({
  open,
  onClose,
  onSelect,
}: ChooseGameModeProps) {
  const reduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstOptionRef = useRef<HTMLButtonElement | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // While the picker is up it covers the landing page completely and
  // carries its own copy of the wallpaper, so the page-level backdrop
  // can stand down.
  useCoveredView(open);

  const handleClose = useCallback(() => {
    if (isSelecting) return;
    onClose();
  }, [isSelecting, onClose]);

  // Escape closes the modal — matches the user's mental model
  // for a "page" rather than a tooltip.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose, open]);

  useEffect(() => {
    if (!open) return;
    const returnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusTimer = window.setTimeout(() => firstOptionRef.current?.focus(), 80);
    return () => {
      window.clearTimeout(focusTimer);
      window.setTimeout(() => returnFocus?.focus(), 0);
    };
  }, [open]);

  // Lock the body scroll while the modal is open so the page
  // underneath doesn't rubber-band on mobile.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const handleSelect = useCallback(
    (mode: GameMode) => {
      if (isSelecting) return;
      setIsSelecting(true);
      onSelect(mode);
    },
    [isSelecting, onSelect],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="choose-mode"
          ref={dialogRef}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
          // Opaque canvas so the home page underneath is completely
          // hidden — the doodle backdrop below then re-lays the same
          // drifting wallpaper on top of it, so opening the picker
          // reads as a stack push rather than a scene change.
          // Safe-area padding so notches and home indicators don't
          // crowd the cards.
          className="fixed inset-0 z-[90] flex flex-col bg-[var(--canvas)]"
          style={{
            paddingTop: "max(1rem, env(safe-area-inset-top))",
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
            paddingLeft: "max(1rem, env(safe-area-inset-left))",
            paddingRight: "max(1rem, env(safe-area-inset-right))",
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Choose a game mode"
          aria-busy={isSelecting}
        >
          <DoodleBackdrop inOverlay />

          {/* Top bar — back chevron + title + close X */}
          <div className="relative z-10 flex flex-none items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleClose}
              aria-label="Back to home"
              className="inline-flex h-11 w-11 touch-manipulation cursor-pointer flex-none items-center justify-center rounded-full border-[3px] border-[var(--charcoal)] bg-[var(--off-white-2)] text-[var(--charcoal)] shadow-[3px_3px_0_0_var(--charcoal)] transition-[transform,box-shadow,background-color] duration-150 active:translate-y-1 active:shadow-[0_0_0_0_var(--charcoal)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--charcoal)] motion-reduce:transition-none"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex flex-col items-center text-center">
              <span className="eyebrow">Choose a mode</span>
              <span className="font-display text-lg font-bold text-[var(--charcoal)]">
                How do you want to play?
              </span>
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--yellow)] px-2.5 py-1 text-[11px] font-bold text-[var(--on-accent)] shadow-[2px_2px_0_0_var(--charcoal)]">
                <Sparkle size={13} aria-hidden /> All modes are free
              </span>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              className="inline-flex h-11 w-11 touch-manipulation cursor-pointer flex-none items-center justify-center rounded-full border-[3px] border-[var(--charcoal)] bg-[var(--off-white-2)] text-[var(--charcoal)] shadow-[3px_3px_0_0_var(--charcoal)] transition-[transform,box-shadow,background-color] duration-150 active:translate-y-1 active:shadow-[0_0_0_0_var(--charcoal)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--charcoal)] motion-reduce:transition-none"
            >
              <X size={18} />
            </button>
          </div>

          {/* Cards — scroll when they overflow the viewport.
              Two things are load-bearing here:

              `min-h-0` because a flex child defaults to
              `min-height: auto` and so refuses to shrink below its
              content. Without it this box just grows past the
              bottom of the screen and `overflow-y-auto` never has
              anything to scroll.

              `data-lenis-prevent` because Lenis runs as the root
              smooth-scroll and swallows wheel events document-wide;
              a nested scroller has to opt out or the wheel does
              nothing over it. Same pattern as the chat log. */}
          <div
            data-lenis-prevent
            className="relative z-10 mt-6 min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            <ul className="mx-auto flex w-full max-w-2xl flex-col gap-5 pb-6 sm:gap-6">
              {MODE_OPTIONS.map((option, index) => {
                const isCelebrity = option.id === "celebrity";
                const badgeText = option.badge;
                return (
                  <motion.li
                    key={option.id}
                    initial={reduceMotion ? false : { y: 18, opacity: 0, scale: 0.96 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    transition={{
                      type: reduceMotion ? "tween" : "spring",
                      stiffness: 280,
                      damping: 22,
                      delay: 0.05 + index * 0.05,
                    }}
                    className={cn(
                      "flex w-full flex-col gap-4 rounded-3xl border-[4px] border-[var(--ink-shadow)] p-5 shadow-[8px_8px_0_0_var(--ink-shadow)] sm:flex-row sm:items-center sm:gap-5 sm:p-6 sm:shadow-[10px_10px_0_0_var(--ink-shadow)]",
                      FILL_CLASSES[option.fill],
                      option.tilt,
                    )}
                  >
                    {/* Glyph circle */}
                    <div className="flex h-20 w-20 flex-none items-center justify-center rounded-2xl border-[3px] border-[var(--charcoal)] bg-[var(--off-white)] text-5xl text-[var(--charcoal)] shadow-[3px_3px_0_0_var(--charcoal)] sm:h-24 sm:w-24 sm:text-6xl">
                      <span aria-hidden className="-rotate-3 leading-none">
                        <WebEmoji emoji={option.glyph} />
                      </span>
                    </div>

                    {/* Text block */}
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-2xl font-bold leading-none tracking-tight sm:text-3xl">
                          {option.title}
                        </h3>
                        {badgeText && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border-[2px] border-[var(--charcoal)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]",
                              isCelebrity
                                ? "bg-[var(--yellow)] text-[var(--on-accent)]"
                                : "bg-[var(--off-white)] text-[var(--charcoal)]",
                            )}
                          >
                            {isCelebrity && <Crown size={10} />}
                            {badgeText}
                          </span>
                        )}
                      </div>
                      <p className="text-sm leading-snug opacity-90 sm:text-base">
                        {option.description}
                      </p>
                    </div>

                    {/* CTA */}
                    <button
                      ref={index === 0 ? firstOptionRef : undefined}
                      type="button"
                      onClick={() => handleSelect(option.id)}
                      disabled={isSelecting}
                      className={cn(
                        "relative inline-flex h-14 w-full items-center justify-center gap-2 rounded-full border-[3px] border-[var(--on-accent)] px-6 text-[15px] font-bold tracking-tight",
                        "shadow-[4px_4px_0_0_var(--on-accent)] active:translate-y-1 active:shadow-[0_0_0_0_var(--on-accent)]",
                        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--on-accent)]",
                        "touch-manipulation cursor-pointer transition-[transform,box-shadow,background-color,opacity] duration-150 ease-out motion-reduce:transition-none disabled:cursor-wait disabled:opacity-60 disabled:active:translate-y-0",
                        isCelebrity
                          ? "bg-[var(--pink)] text-[var(--on-accent)] hover:bg-[var(--pink-hover)] sm:w-auto"
                          : "bg-[var(--off-white)] text-[var(--charcoal)] hover:bg-[var(--off-white-2)] sm:w-auto",
                      )}
                    >
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
                        style={{
                          background:
                            "linear-gradient(to bottom, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0) 50%)",
                        }}
                      />
                      <span className="relative">{option.ctaIcon}</span>
                      <span className="relative whitespace-nowrap">
                        {isSelecting ? "Opening…" : option.cta}
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </ul>
          </div>

          {/* Footer — explicit "back home" link + tiny sparkline of
              reassurance. Both rows are below the cards so the
              user can always find a way out. */}
          <div className="relative z-10 flex flex-none flex-col items-center gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSelecting}
              className="min-h-11 touch-manipulation cursor-pointer text-sm font-bold uppercase tracking-[0.18em] text-[var(--on-surface-variant)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--charcoal)] disabled:cursor-wait disabled:opacity-50"
            >
              ← Back to home
            </button>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--on-surface-variant)]">
              <Sparkle size={12} />
              Webcam + a straight face you won&apos;t keep
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
