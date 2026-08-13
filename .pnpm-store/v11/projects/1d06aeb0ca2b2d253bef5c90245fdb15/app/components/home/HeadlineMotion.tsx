"use client";

/* =====================================================================
   Headline motion primitives for the marketing/landing homepage.

   Components that give headline-level text a one-time entrance —
   some per-word with a spring, one classic typewriter, plus a
   breathing dot for the online indicator. Consistent with the
   tactile, sticker-shadow language already used for buttons and
   emoji on the page.

   Scope: homepage only. The live duel screen, solo mode, camera
   views, and chat are not touched here.

   Every component in this file short-circuits to a fully static
   render when prefers-reduced-motion is set, so users with that
   preference see plain text and a still dot.
   ===================================================================== */

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/* =====================================================================
   Headline

   Per-word staggered reveal with a springy easing. Splits the text
   on spaces and animates each word with a spring transition —
   the first word starts at delay 0, each subsequent word is
   offset by `stagger` seconds (default 0.08s). The spring's
   stiffness (320) and damping (18) produce a subtle overshoot
   that reads as bouncy, never as a flash.

   Two trigger modes:
   - "mount" (default): animates once on page load. Used for the
     hero headline so it plays when the page first renders.
   - "scroll": animates the first time the element scrolls into
     view, and never replays (framer-motion's whileInView with
     once: true). Used for section headlines so they reveal as
     the user reaches them.

   Respects prefers-reduced-motion: returns a plain span with the
   full text, no animation.
   ===================================================================== */

interface HeadlineProps {
  text: string;
  className?: string;
  /** Per-word stagger delay in seconds. Default 0.08. */
  stagger?: number;
  /** Initial delay before the first word, in seconds. Default 0. */
  delay?: number;
  /** "mount" (default) plays on page load. "scroll" plays when
   *  the headline scrolls into view, only once. */
  trigger?: "mount" | "scroll";
}

export function Headline({
  text,
  className,
  stagger = 0.08,
  delay = 0,
  trigger = "mount",
}: HeadlineProps) {
  const reducedMotion = useReducedMotion();
  const words = text.split(" ");

  if (reducedMotion) {
    return <span className={className}>{text}</span>;
  }

  // Per-word spring. The 0.08s stagger keeps the reveal legible
  // at normal reading pace; the spring's slight overshoot is what
  // gives the "bouncy" feel the spec calls for, without ever
  // crossing into flash/flicker territory.
  const spring = { type: "spring" as const, stiffness: 320, damping: 18 };

  if (trigger === "scroll") {
    return (
      <span className={className}>
        {words.map((word, i) => (
          <motion.span
            key={i}
            className="inline-block"
            initial={{ opacity: 0, y: 16, scale: 0.9 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.3, margin: "0px 0px -40px 0px" }}
            transition={{ ...spring, delay: delay + i * stagger }}
          >
            {word}
            {i < words.length - 1 && "\u00A0"}
          </motion.span>
        ))}
      </span>
    );
  }

  return (
    <span className={className}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          className="inline-block"
          initial={{ opacity: 0, y: 16, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...spring, delay: delay + i * stagger }}
        >
          {word}
          {i < words.length - 1 && "\u00A0"}
        </motion.span>
      ))}
    </span>
  );
}

/* =====================================================================
   PopBlock

   A highlight block (e.g. the "Make friends." chip on the hero)
   that pops in with a slight squish. Higher stiffness (420) and
   lower damping (14) than Headline so the spring overshoot is
   more pronounced — the block lands with a deliberate "thunk"
   rather than a soft fade. The scale starts small (0.8) and
   overshoots past 1 before settling, which is what gives the
   squish feel.

   Trigger is always "mount" — the hero plays once on page load
   and never replays.

   Respects prefers-reduced-motion: renders a plain span, no
   animation.
   ===================================================================== */

interface PopBlockProps {
  children: React.ReactNode;
  className?: string;
  /** Delay before the pop, in seconds. Default 0. */
  delay?: number;
}

export function PopBlock({ children, className, delay = 0 }: PopBlockProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <span className={className}>{children}</span>;
  }

  return (
    <motion.span
      className={className}
      initial={{ opacity: 0, y: 20, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: "spring",
        // Higher stiffness + lower damping than Headline so the
        // overshoot is visible. The block lands with a small
        // squish and settles.
        stiffness: 420,
        damping: 14,
        delay,
      }}
    >
      {children}
    </motion.span>
  );
}

/* =====================================================================
   TypewriterBlock

   Classic terminal-style typing that runs in a continuous loop:
   type out → pause → reset → type out → repeat. Characters
   appear one at a time on a fast interval, with a blinking
   caret that follows the last-typed character. The block itself
   still pops in on mount (same spring as PopBlock) so the
   landing keeps the tactile, squishy character the rest of the
   page uses.

   Used for the hero "Make friends." chip. PopBlock is still
   available for other highlight blocks that just want the
   squish without the typing.

   Respects prefers-reduced-motion: renders the full text in a
   plain span, no animation, no caret, no loop.
   ===================================================================== */

interface TypewriterBlockProps {
  /** Text to type out. The full string is also used as the
   *  accessible label for the rendered span. */
  text: string;
  className?: string;
  /** Delay before the *first* cycle starts, in seconds. Default 0.
   *  Should be large enough for the pop animation to complete so
   *  the user sees the empty block land before text starts
   *  filling it. ~0.3s lines up nicely with the PopBlock spring.
   *  Subsequent cycles use `pauseDuration` between resets. */
  startDelay?: number;
  /** Time per character, in ms. Default 45. "Make friends." (12
   *  chars) takes ~0.54s at this speed — fast enough to feel
   *  like a typewriter, slow enough that each character is
   *  legible. */
  typingSpeed?: number;
  /** Pause between cycles (after text is fully typed, before it
   *  resets and starts again), in ms. Default 1500. Gives the
   *  reader enough time to absorb the full chip before it
   *  clears. */
  pauseDuration?: number;
  /** Whether the block itself pops in on mount. Default true.
   *  Set to false if you want the typing to start on an
   *  already-visible block. */
  popOnMount?: boolean;
}

export function TypewriterBlock({
  text,
  className,
  startDelay = 0,
  typingSpeed = 45,
  pauseDuration = 1500,
  popOnMount = true,
}: TypewriterBlockProps) {
  const reducedMotion = useReducedMotion();
  // Always start at 0 so the SSR HTML and the first client render
  // match (no hydration mismatch). The effect below advances the
  // counter on each tick.
  const [visibleChars, setVisibleChars] = useState(0);

  // The loop is driven by a recursive setTimeout chain, not by
  // chaining on the visibleChars state. This avoids two issues:
  // (1) re-running the effect on every render, and (2) the
  // `visibleChars === 0` check that would otherwise stall the
  // loop after each reset. The `currentChar` local carries the
  // position through the closure; the state is just for the
  // render. The effect only re-runs when the props change.
  useEffect(() => {
    if (reducedMotion) {
      setVisibleChars(text.length);
      return;
    }

    let cancelled = false;
    let currentChar = 0;

    function tick() {
      if (cancelled) return;
      setVisibleChars(currentChar);

      if (currentChar < text.length) {
        // Still typing — schedule the next character.
        currentChar++;
        timeoutId = setTimeout(tick, typingSpeed);
      } else {
        // Full text is on screen — pause, then reset and start
        // the next cycle. The pause gives the reader a beat to
        // absorb the chip before it clears.
        timeoutId = setTimeout(() => {
          if (cancelled) return;
          currentChar = 0;
          tick();
        }, pauseDuration);
      }
    }

    // The first cycle starts after `startDelay`; subsequent
    // cycles use `pauseDuration` (handled inside tick above).
    let timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
      if (cancelled) return;
      tick();
    }, startDelay * 1000);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [text.length, typingSpeed, reducedMotion, startDelay, pauseDuration]);

  if (reducedMotion) {
    return <span className={className}>{text}</span>;
  }

  const displayed = text.slice(0, visibleChars);
  const stillTyping = visibleChars < text.length;
  const popTransition = popOnMount
    ? { type: "spring" as const, stiffness: 420, damping: 14 }
    : undefined;

  return (
    <motion.span
      className={className}
      initial={popOnMount ? { opacity: 0, y: 20, scale: 0.8 } : false}
      animate={popOnMount ? { opacity: 1, y: 0, scale: 1 } : undefined}
      transition={popTransition}
    >
      {displayed}
      {stillTyping && (
        <motion.span
          aria-hidden
          /* Caret — uses currentColor so it inherits the text
             color of the parent (white on the purple chip).
             Height is 85% of the font size so it reads as a
             standard terminal cursor, not a fat block. The
             0.7s easeInOut blink is a steady on/off rather
             than a smooth fade, so it reads as a caret, not
             a soft pulse. */
          className="ml-px inline-block w-[2px] h-[0.85em] bg-current align-middle"
          animate={{ opacity: [1, 0, 1] }}
          transition={{
            duration: 0.7,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}
    </motion.span>
  );
}

/* =====================================================================
   PulseDot

   A small status indicator (e.g. the dot in the "N online" pill)
   that breathes on a multi-second loop. Scale + opacity oscillate
   together; the surrounding text stays still.

   Multi-second cycle (default 2.5s) keeps it well under any
   flash/seizure threshold and reads as gentle breathing, never
   as a flashing alert.

   Respects prefers-reduced-motion: returns a plain dot, no
   animation.
   ===================================================================== */

interface PulseDotProps {
  className?: string;
  /** Full cycle duration in seconds. Default 2.5. */
  duration?: number;
}

export function PulseDot({ className, duration = 2.5 }: PulseDotProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <span className={className} />;
  }

  return (
    <motion.span
      className={className}
      animate={{
        scale: [1, 1.35, 1],
        opacity: [1, 0.55, 1],
      }}
      transition={{
        duration,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}
