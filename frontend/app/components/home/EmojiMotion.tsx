"use client";

/* =====================================================================
   Homepage motion primitives.

   Two small components that bring the marketing/landing page to
   life without ever tipping into busy or distracting territory.
   Every component here short-circuits to a fully static render
   when prefers-reduced-motion is set, so users with that
   preference see a flat page and nothing animates.

   Scope: marketing/landing homepage only. The live duel screen,
   solo mode, camera views, and chat already have their own motion
   rules and are not touched here.
   ===================================================================== */

import { useRef } from "react";
import type { ComponentType, JSX, PropsWithChildren } from "react";
import { motion, useReducedMotion } from "framer-motion";

/* =====================================================================
   FloatingEmoji

   Low-amplitude ambient drift for the decorative emojis around
   the hero. The path is deliberately asymmetric — a small orbit
   rather than a vertical bounce — and spends most of its time
   close to rest.

   Each instance gets a randomized phase offset (or one passed in
   by the caller) so the decorative emojis don't all bob in sync.
   so no two emojis on the page share the same motion pattern.
   ===================================================================== */

interface FloatingEmojiProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Vertical bob distance, in pixels. Default 4. */
  floatAmount?: number;
  /** Duration of one drift cycle, in seconds. Default 8.4. */
  floatDuration?: number;
  /** Optional phase offset, in seconds. Default: randomized on
   *  mount so siblings drift on their own clock. */
  floatPhase?: number;
}

export function FloatingEmoji({
  children,
  className,
  style,
  floatAmount = 3,
  floatDuration = 8.4,
  floatPhase,
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
        x: [0, floatAmount * 0.42, -floatAmount * 0.28, 0],
        y: [0, -floatAmount, floatAmount * 0.22, 0],
        rotate: [0, 0.8, -0.55, 0],
      }}
      transition={{
        duration: floatDuration,
        repeat: Infinity,
        ease: "easeInOut",
        delay: phaseRef.current,
        times: [0, 0.24, 0.52, 1],
        repeatDelay: 1.1,
      }}
    >
      {children}
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
