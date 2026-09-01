"use client";

/* =====================================================================
   Homepage motion primitives.

   Three small components that bring the marketing/landing page to
   life without ever tipping into busy or distracting territory.
   Every component here short-circuits to a fully static render
   when prefers-reduced-motion is set, so users with that
   preference see a flat page and nothing animates.

   Scope: marketing/landing homepage only. The live duel screen,
   solo mode, camera views, and chat already have their own motion
   rules and are not touched here.
   ===================================================================== */

import { useEffect, useRef, useState } from "react";
import type { ComponentType, JSX, PropsWithChildren } from "react";
import { motion, useReducedMotion } from "framer-motion";

/* =====================================================================
   BlinkingEmoji

   Wraps a child emoji in a quick scaleY "blink" that fires at a
   randomized interval. The blink itself is a vertical scale that
   drops to ~0.08 over 150-250ms and springs back — short enough
   to read as a real blink, never as a flash or flicker.

   Intervals are randomized per instance (default 3-7s) so a page
   with six decorative emojis never has more than one or two
   mid-blink at the same time. The randomized range is captured
   on first render via a ref so re-renders don't reset the
   schedule.

   Two personalities:
   - "plain" (default): a quick symmetric scaleY blink.
   - "wink": a touch longer, with a slight scaleX (squish) and a
     small rotation, suggesting a playful head tilt. Used for the
     hero mascot only. Pair with a longer interval (10-15s) so the
     wink feels occasional, not constant.
   ===================================================================== */

interface BlinkingEmojiProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Min interval between blinks, in ms. Default 3000. */
  intervalMin?: number;
  /** Max interval between blinks, in ms. Default 7000. */
  intervalMax?: number;
  /** Duration of one blink (open → closed → open), in ms.
   *  Default 200. The spec asks for 150-250ms; 200 is the middle. */
  blinkDuration?: number;
  /** "plain" is a quick symmetric blink. "wink" adds a small
   *  squish + rotation for a more playful gesture. */
  personality?: "plain" | "wink";
}

export function BlinkingEmoji({
  children,
  className,
  style,
  intervalMin = 3000,
  intervalMax = 7000,
  blinkDuration = 200,
  personality = "plain",
}: BlinkingEmojiProps) {
  const [isBlinking, setIsBlinking] = useState(false);
  const reducedMotion = useReducedMotion();

  // Capture the random interval range once on first render. We
  // don't want a parent re-render to reset the blink cycle or
  // pick a new random range.
  const intervalRangeRef = useRef<{ min: number; max: number } | null>(null);
  if (intervalRangeRef.current === null) {
    // Slight randomization on the defaults so two BlinkingEmoji
    // siblings never share the exact same range. Caller-supplied
    // values are honored as-is.
    intervalRangeRef.current =
      intervalMin === 3000 && intervalMax === 7000
        ? {
            min: 2800 + Math.floor(Math.random() * 800), // 2800-3600
            max: 5500 + Math.floor(Math.random() * 2500), // 5500-8000
          }
        : { min: intervalMin, max: intervalMax };
  }

  useEffect(() => {
    if (reducedMotion) return;
    const { min, max } = intervalRangeRef.current!;

    let blinkTimeout: ReturnType<typeof setTimeout> | null = null;
    let resetTimeout: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function loop() {
      if (cancelled) return;
      const wait = min + Math.random() * (max - min);
      blinkTimeout = setTimeout(() => {
        if (cancelled) return;
        setIsBlinking(true);
        resetTimeout = setTimeout(() => {
          if (cancelled) return;
          setIsBlinking(false);
          loop();
        }, blinkDuration);
      }, wait);
    }

    loop();
    return () => {
      cancelled = true;
      if (blinkTimeout) clearTimeout(blinkTimeout);
      if (resetTimeout) clearTimeout(resetTimeout);
    };
  }, [blinkDuration, reducedMotion]);

  if (reducedMotion) {
    return (
      <span className={className} style={style}>
        {children}
      </span>
    );
  }

  const isWink = personality === "wink";
  // Each direction of the blink gets half the total duration so
  // the close and the reopen both feel symmetric. Winks run a
  // touch longer so the gesture reads as deliberate.
  const animDuration = (isWink ? blinkDuration * 1.5 : blinkDuration) / 1000 / 2;

  return (
    <motion.span
      className={className}
      style={{ display: "inline-block", transformOrigin: "center", ...style }}
      animate={
        isBlinking
          ? isWink
            ? { scaleY: 0.08, scaleX: 1.15, rotate: -6 }
            : { scaleY: 0.08 }
          : { scaleY: 1, scaleX: 1, rotate: 0 }
      }
      transition={{ duration: animDuration, ease: "easeInOut" }}
    >
      {children}
    </motion.span>
  );
}

/* =====================================================================
   FloatingEmoji

   Vertical bob layered on top of the blink. Used for the
   decorative emojis around the hero. The bob is small (a few
   pixels) and slow (multi-second loop) so it reads as gentle
   drift, never as a bounce.

   Each instance gets a randomized phase offset (or one passed in
   by the caller) so the decorative emojis don't all bob in sync.
   Combined with the randomized blink interval, no two emojis on
   the page share the same motion pattern.
   ===================================================================== */

interface FloatingEmojiProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Vertical bob distance, in pixels. Default 4. */
  floatAmount?: number;
  /** Duration of one bob cycle, in seconds. Default 5. */
  floatDuration?: number;
  /** Optional phase offset, in seconds. Default: randomized on
   *  mount so siblings drift on their own clock. */
  floatPhase?: number;
  // Pass-through options for the underlying BlinkingEmoji.
  intervalMin?: number;
  intervalMax?: number;
  blinkDuration?: number;
  personality?: "plain" | "wink";
}

export function FloatingEmoji({
  children,
  className,
  style,
  floatAmount = 4,
  floatDuration = 5,
  floatPhase,
  ...blinkProps
}: FloatingEmojiProps) {
  const reducedMotion = useReducedMotion();

  // Capture a random phase on first render so the bob doesn't
  // start in lockstep with siblings. Stored in a ref so the
  // phase doesn't drift on re-renders.
  const phaseRef = useRef<number | null>(null);
  if (phaseRef.current === null) {
    phaseRef.current = floatPhase ?? Math.random() * floatDuration;
  }

  if (reducedMotion) {
    return (
      <span className={className} style={style}>
        {children}
      </span>
    );
  }

  return (
    <motion.span
      className={className}
      style={style}
      animate={{
        // Three-keyframe loop: rest → up → rest. The middle keyframe
        // is the negative floatAmount so the emoji drifts upward
        // and back, never bouncing past its starting position.
        y: [0, -floatAmount, 0],
      }}
      transition={{
        duration: floatDuration,
        repeat: Infinity,
        ease: "easeInOut",
        delay: phaseRef.current,
      }}
    >
      <BlinkingEmoji {...blinkProps}>{children}</BlinkingEmoji>
    </motion.span>
  );
}

/* =====================================================================
   ScrollReveal

   One-time fade/slide entrance for elements that sit below the
   fold. The element starts at opacity 0 with a small Y offset
   and animates in the first time it scrolls into view. The
   observer disconnects after the first reveal — re-scrolling
   does not replay the animation.

   Polymorphic via the `as` prop so it can render as `li`,
   `article`, `section`, etc. without breaking the semantic HTML
   of the surrounding list/grid (a feature card should stay an
   <article>, a step should stay a <li>).

   Respects prefers-reduced-motion: the children render in a
   plain element with the requested tag, no animation.
   ===================================================================== */

type RevealTag = "div" | "li" | "article" | "section" | "span";

/** Extra HTML attributes the rendered element should accept —
 *  just `id` and `aria-*` for now, since those are the ones the
 *  homepage actually needs. Add more here if new use cases
 *  come up. */
type ExtraAttrs = {
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  role?: string;
};

interface ScrollRevealProps extends ExtraAttrs {
  children: React.ReactNode;
  className?: string;
  /** Stagger delay in seconds. Default 0. */
  delay?: number;
  /** Y offset to start from, in pixels. Default 20. */
  yOffset?: number;
  /** Element tag to render as. Default "div". */
  as?: RevealTag;
}

export function ScrollReveal({
  children,
  className,
  delay = 0,
  yOffset = 20,
  as = "div",
  id,
  ...ariaAttrs
}: ScrollRevealProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    // Render the children in a static element with the requested
    // tag. The tag is asserted because the union of RevealTag is
    // narrower than JSX.IntrinsicElements, but every value in the
    // union is a valid element.
    const Tag = as as keyof JSX.IntrinsicElements;
    return (
      <Tag id={id} className={className} {...ariaAttrs}>
        {children}
      </Tag>
    );
  }

  // framer-motion exposes a `motion[as]` for every HTML element.
  // The cast is unavoidable because the union of valid `as` values
  // is narrower than what `motion` provides.
  const MotionTag = motion[as] as ComponentType<
    PropsWithChildren<{
      className?: string;
      id?: string;
      initial?: object;
      whileInView?: object;
      viewport?: object;
      transition?: object;
    } & ExtraAttrs>
  >;

  return (
    <MotionTag
      id={id}
      className={className}
      {...ariaAttrs}
      initial={{ opacity: 0, y: yOffset }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15, margin: "0px 0px -40px 0px" }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      {children}
    </MotionTag>
  );
}
