"use client";

/**
 * ChooseGameMode
 * --------------
 * A full-screen mode picker. The "Play now" CTA on the home
 * page opens this instead of dropping the user straight into
 * stranger matchmaking. Three options, all with the same
 * sticker-card visual language as the rest of Emoggle:
 *
 *  - Solo          – play the emoji-expression challenge alone
 *                    and beat your own score.
 *  - Stranger      – the existing random-matchmaking flow.
 *  - Celebrity     – the VIP celebrity-expression game.
 *
 * The celebrity option still goes through the existing paywall
 * logic; the parent passes the same `onSelect` callback it
 * already uses for the inline mode cards.
 *
 * Back / cancel
 *  The modal has a real back chevron (top-left) and a visible
 *  "Back" link in the footer. Both call `onClose`. Escape
 *  closes the modal too — the home page is one tap away
 *  whenever the user changes their mind.
 */

import { useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

export type GameMode = "camera" | "solo" | "celebrity";

export interface ChooseGameModeProps {
  open: boolean;
  onClose: () => void;
  onSelect: (mode: GameMode) => void;
  /** True when the celebrity option should show a VIP badge + crown. */
  isVIP?: boolean;
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
  fill: "yellow" | "purple" | "pink";
  /** CTA label on the card button. */
  cta: string;
  /** Small icon next to the CTA. */
  ctaIcon: React.ReactNode;
  /** Optional badge in the corner (e.g. "VIP"). */
  badge?: string;
  /** Slight tilt for the scattered-on-a-table look. */
  tilt: "tilt-l-1" | "tilt-l-2" | "tilt-r-1" | "tilt-r-2" | "tilt-0";
}

const FILL_CLASSES: Record<ModeOption["fill"], string> = {
  yellow: "bg-[var(--yellow)] text-[var(--charcoal)]",
  purple: "bg-[var(--purple)] text-[var(--off-white)]",
  pink: "bg-[var(--pink)] text-[var(--charcoal)]",
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
  isVIP = false,
}: ChooseGameModeProps) {
  // Escape closes the modal — matches the user's mental model
  // for a "page" rather than a tooltip.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

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
      onSelect(mode);
    },
    [onSelect],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="choose-mode"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          // Opaque off-white so the home page underneath is
          // completely hidden. Safe-area padding so notches
          // and home indicators don't crowd the cards.
          className="fixed inset-0 z-[90] flex flex-col bg-[var(--off-white)]"
          style={{
            paddingTop: "max(1rem, env(safe-area-inset-top))",
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
            paddingLeft: "max(1rem, env(safe-area-inset-left))",
            paddingRight: "max(1rem, env(safe-area-inset-right))",
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Choose a game mode"
        >
          {/* Top bar — back chevron + title + close X */}
          <div className="flex flex-none items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to home"
              className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-full border-[3px] border-[var(--charcoal)] bg-[var(--off-white-2)] text-[var(--charcoal)] shadow-[3px_3px_0_0_var(--charcoal)] active:translate-y-1 active:shadow-[0_0_0_0_var(--charcoal)]"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex flex-col items-center text-center">
              <span className="eyebrow">Choose a mode</span>
              <span className="font-display text-lg font-bold text-[var(--charcoal)]">
                How do you want to play?
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-full border-[3px] border-[var(--charcoal)] bg-[var(--off-white-2)] text-[var(--charcoal)] shadow-[3px_3px_0_0_var(--charcoal)] active:translate-y-1 active:shadow-[0_0_0_0_var(--charcoal)]"
            >
              <X size={18} />
            </button>
          </div>

          {/* Cards — scroll if they overflow on small phones */}
          <div className="mt-6 flex-1 overflow-y-auto">
            <ul className="mx-auto flex w-full max-w-2xl flex-col gap-5 pb-6 sm:gap-6">
              {MODE_OPTIONS.map((option, index) => {
                const isCelebrity = option.id === "celebrity";
                const badgeText = option.badge;
                return (
                  <motion.li
                    key={option.id}
                    initial={{ y: 18, opacity: 0, scale: 0.96 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 280,
                      damping: 22,
                      delay: 0.05 + index * 0.05,
                    }}
                    className={cn(
                      "flex w-full flex-col gap-4 rounded-3xl border-[4px] border-[var(--charcoal)] p-5 shadow-[8px_8px_0_0_var(--charcoal)] sm:flex-row sm:items-center sm:gap-5 sm:p-6 sm:shadow-[10px_10px_0_0_var(--charcoal)]",
                      FILL_CLASSES[option.fill],
                      option.tilt,
                    )}
                  >
                    {/* Glyph circle */}
                    <div className="flex h-20 w-20 flex-none items-center justify-center rounded-2xl border-[3px] border-[var(--charcoal)] bg-[var(--off-white)] text-5xl shadow-[3px_3px_0_0_var(--charcoal)] sm:h-24 sm:w-24 sm:text-6xl">
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
                                ? "bg-[var(--yellow)] text-[var(--charcoal)]"
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
                      type="button"
                      onClick={() => handleSelect(option.id)}
                      className={cn(
                        "relative inline-flex h-14 w-full items-center justify-center gap-2 rounded-full border-[3px] border-[var(--charcoal)] px-6 text-[15px] font-bold tracking-tight",
                        "shadow-[4px_4px_0_0_var(--charcoal)] active:translate-y-1 active:shadow-[0_0_0_0_var(--charcoal)]",
                        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--charcoal)]",
                        "transition-transform duration-100 ease-out",
                        isCelebrity
                          ? "bg-[var(--pink)] text-[var(--charcoal)] hover:bg-[#ffd1d0] sm:w-auto"
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
                      <span className="relative whitespace-nowrap">{option.cta}</span>
                    </button>
                  </motion.li>
                );
              })}
            </ul>
          </div>

          {/* Footer — explicit "back home" link + tiny sparkline of
              reassurance. Both rows are below the cards so the
              user can always find a way out. */}
          <div className="flex flex-none flex-col items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--on-surface-variant)] underline-offset-4 hover:underline"
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
