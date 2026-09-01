"use client";

import type { CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "./cn";
import { WebEmoji } from "./WebEmoji";

type BurstTone = "yellow" | "purple" | "pink";

interface EmojiPromptMotionProps {
  emoji: string;
  /** Applied to the Unicode glyph itself (usually responsive text sizing). */
  className?: string;
  /** Applied to the stable wrapper around the choreography. */
  wrapperClassName?: string;
  /** Adds a screen-reader name. Omit when an already-labelled parent owns it. */
  ariaLabel?: string;
  /** Slow, asymmetric drift after the entrance settles. */
  idle?: boolean;
  /** Brief accent burst whenever the emoji value changes. */
  burst?: boolean;
  burstTone?: BurstTone;
}

const PARTICLES = [
  { x: 0, y: -42, size: 6, delay: 0, rotate: 18 },
  { x: 32, y: -27, size: 5, delay: 0.025, rotate: 54 },
  { x: 42, y: 5, size: 7, delay: 0.05, rotate: 92 },
  { x: 23, y: 35, size: 5, delay: 0.075, rotate: 138 },
  { x: -20, y: 37, size: 6, delay: 0.1, rotate: 204 },
  { x: -41, y: 9, size: 5, delay: 0.125, rotate: 250 },
  { x: -31, y: -28, size: 7, delay: 0.15, rotate: 310 },
] as const;

const TONE_COLORS: Record<BurstTone, string[]> = {
  yellow: ["var(--yellow-deep)", "var(--pink-deep)", "var(--purple-deep)"],
  purple: ["var(--purple-deep)", "var(--yellow-deep)", "var(--pink-deep)"],
  pink: ["var(--pink-deep)", "var(--purple-deep)", "var(--yellow-deep)"],
};

/**
 * Original motion treatment for a single game prompt.
 *
 * The glyph never deforms: a staged card-like arrival gives way to a very
 * small, asymmetric spatial drift. A deterministic accent burst marks a new
 * prompt without adding images, canvas work, or another dependency.
 */
export function EmojiPromptMotion({
  emoji,
  className,
  wrapperClassName,
  ariaLabel,
  idle = true,
  burst = true,
  burstTone = "yellow",
}: EmojiPromptMotionProps) {
  const reduceMotion = useReducedMotion();
  const colors = TONE_COLORS[burstTone];

  if (reduceMotion) {
    return (
      <span
        className={cn("relative inline-grid place-items-center leading-none", wrapperClassName)}
        role={ariaLabel ? "img" : undefined}
        aria-label={ariaLabel}
        aria-hidden={ariaLabel ? undefined : true}
      >
        <WebEmoji emoji={emoji} className={cn("inline-block leading-none", className)} />
      </span>
    );
  }

  return (
    <span
      className={cn("relative inline-grid place-items-center leading-none", wrapperClassName)}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      style={{ isolation: "isolate" }}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={emoji}
          className="relative inline-grid place-items-center leading-none"
          initial={{ opacity: 0, y: 13, scale: 0.76, rotate: -11 }}
          animate={{
            opacity: 1,
            y: [13, -3, 0],
            scale: [0.76, 1.045, 1],
            rotate: [-11, 2, -3],
          }}
          exit={{ opacity: 0, y: -8, scale: 0.9, rotate: 7 }}
          transition={{
            duration: 0.46,
            times: [0, 0.68, 1],
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          {idle && (
            <motion.span
              className="pointer-events-none absolute inset-[16%] z-0 rounded-full blur-md"
              aria-hidden
              style={{ backgroundColor: colors[0] }}
              animate={{ opacity: [0.06, 0.14, 0.08], scale: [0.88, 1.08, 0.94] }}
              transition={{
                duration: 8.6,
                delay: 0.7,
                times: [0, 0.46, 1],
                ease: "easeInOut",
                repeat: Infinity,
                repeatType: "mirror",
              }}
            />
          )}
          {burst && (
            <span className="pointer-events-none absolute inset-0 z-20" aria-hidden>
              <motion.span
                className="absolute inset-0 m-auto rounded-full border-2 border-[var(--charcoal)]"
                initial={{ opacity: 0, scale: 0.55 }}
                animate={{ opacity: [0, 0.28, 0], scale: [0.55, 1.45, 1.72] }}
                transition={{ duration: 0.54, times: [0, 0.2, 1], ease: "easeOut" }}
              />
              {PARTICLES.map((particle, index) => (
                <motion.i
                  key={`${emoji}-${index}`}
                  className={cn(
                    "absolute left-1/2 top-1/2 block",
                    index % 2 === 0 ? "rounded-full" : "rounded-[1px]",
                  )}
                  style={
                    {
                      width: particle.size,
                      height: particle.size,
                      marginLeft: -particle.size / 2,
                      marginTop: -particle.size / 2,
                      backgroundColor: colors[index % colors.length],
                    } satisfies CSSProperties
                  }
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.2, rotate: particle.rotate }}
                  animate={{
                    x: [0, particle.x * 0.55, particle.x],
                    y: [0, particle.y * 0.55, particle.y],
                    opacity: [0, 1, 0],
                    scale: [0.2, 1, 0.55],
                    rotate: particle.rotate + 125,
                  }}
                  transition={{
                    duration: 0.55,
                    delay: 0.08 + particle.delay,
                    times: [0, 0.36, 1],
                    ease: "easeOut",
                  }}
                />
              ))}
            </span>
          )}

          <motion.span
            className={cn("relative z-10 inline-block leading-none", className)}
            animate={
              idle
                ? {
                    x: [0, 0.7, -0.45, 0],
                    y: [0, -1.6, 0.45, 0],
                    rotate: [-3, -1.4, -3.6, -3],
                  }
                : { x: 0, y: 0, rotate: -3 }
            }
            transition={
              idle
                ? {
                    duration: 7.2,
                    delay: 0.8,
                    times: [0, 0.22, 0.48, 1],
                    ease: "easeInOut",
                    repeat: Infinity,
                    repeatDelay: 1.4,
                  }
                : { duration: 0.2 }
            }
          >
            <WebEmoji emoji={emoji} />
          </motion.span>
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
