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
import { GooeyText } from "@/components/ui/gooey-text-morphing";
import { TextRotate } from "@/components/ui/text-rotate";
import { cn } from "@/app/ui/cn";

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
      {/* The typed-out copy starts empty on the server and fills in
          character by character on the client, so on its own it
          leaves the text out of the server-rendered HTML entirely
          (a crawler reading the hero <h1> sees only the first
          line), and a screen reader would announce it mid-word as
          it types. Keep one static copy of the full string for
          crawlers and assistive tech, and hide the animated copy
          from the accessibility tree. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden>
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
      </span>
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

/* =====================================================================
   GooeyBlock

   The gooey morph variant of the hero chip: instead of typing one
   phrase out character by character, it cycles through several
   phrases, each one blurring and bleeding into the next through an
   SVG alpha-threshold filter (see
   `components/ui/gooey-text-morphing.tsx`). The block still pops in
   on mount with the same spring as PopBlock, so the landing keeps
   the tactile character of the rest of the page.

   TypewriterBlock above is untouched and still exported — the hero
   picks between the two with a single constant in ModeSelect, so
   rolling back to the typewriter is a one-word change.

   Two things this wrapper adds on top of the raw GooeyText:

   - Layout. GooeyText stacks its two phrases absolutely, so it has
     no size of its own; dropped straight into the chip it would
     collapse the chip to nothing. The hidden sizer below holds the
     box open at the width of the longest phrase, and GooeyText
     overlays it, so the chip keeps a stable shape instead of
     resizing on every morph.

   - Text in the HTML. GooeyText writes its phrases in with
     `textContent` after mount, which would leave the second line of
     the hero <h1> empty in the server-rendered markup and announce
     mid-morph blur states to a screen reader. `label` is rendered
     once, statically, for crawlers and assistive tech; the animated
     copy is hidden from the accessibility tree.

   Respects prefers-reduced-motion twice over: this wrapper renders
   `label` as plain text with no pop, and GooeyText itself holds on
   a single phrase rather than morphing.
   ===================================================================== */

interface GooeyBlockProps {
  /** Phrases to cycle through. Pass a stable array (module-level
   *  constant or useMemo) — a fresh array each render restarts the
   *  morph loop. */
  texts: string[];
  /** The one canonical phrase, rendered statically for crawlers and
   *  screen readers. Usually `texts[0]`. */
  label: string;
  className?: string;
  /** Delay before the pop, in seconds. Default 0. */
  delay?: number;
  /** Seconds spent blurring between phrases. Default 1. */
  morphTime?: number;
  /** Seconds a phrase holds legible between morphs. Default 0.9 —
   *  slower than GooeyText's own default, so each phrase on the
   *  chip has time to read as a sentence before it dissolves. */
  cooldownTime?: number;
}

export function GooeyBlock({
  texts,
  label,
  className,
  delay = 0,
  morphTime = 1,
  cooldownTime = 0.9,
}: GooeyBlockProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <span className={className}>{label}</span>;
  }

  // Widest phrase wins the sizing. Character count is a good enough
  // proxy here: the phrases are the same weight and casing, and the
  // chip has enough horizontal padding to absorb the odd wide glyph.
  const sizer = texts.reduce((longest, text) => (text.length > longest.length ? text : longest), label);

  return (
    <motion.span
      className={cn("relative", className)}
      initial={{ opacity: 0, y: 20, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 14, delay }}
    >
      <span className="sr-only">{label}</span>
      {/* Holds the chip open. `invisible` rather than `sr-only` or
          `hidden` — it has to keep taking up space. */}
      <span aria-hidden className="block whitespace-nowrap invisible">
        {sizer}
      </span>
      <GooeyText
        texts={texts}
        morphTime={morphTime}
        cooldownTime={cooldownTime}
        className="absolute inset-0"
        /* The `!` is load-bearing: GooeyText ships display-sized
           defaults (text-6xl / md:text-[60pt]) and our `cn` is a
           plain joiner, not tailwind-merge, so both font sizes end
           up on the element and source order decides. Forcing it
           makes the chip's own font size win at every breakpoint. */
        textClassName="whitespace-nowrap leading-none text-[1em]!"
      />
    </motion.span>
  );
}

/* =====================================================================
   RotateBlock

   Splits the hero's second line in two: a word that holds still, and
   a purple chip next to it whose word rotates — each one sliding up
   and out character by character while the next slides in from below
   (see `components/ui/text-rotate.tsx`). "Make" stays put in headline
   charcoal; only "friends." / "faces." / "chaos." moves, and only that
   word wears the sticker.

   TypewriterBlock and GooeyBlock above are untouched and still
   exported — those two keep the whole phrase inside one chip. The hero
   picks between all three with a single constant in ModeSelect.

   Layout notes, because the chip is fussier than the demo's
   standalone box:

   - The chip is a plain span with a hidden sizer in it, and TextRotate
     is overlaid on top. It is tempting to skip the sizer and let the
     chip resize itself to each word — TextRotate carries
     framer-motion's `layout` prop, and that resize is what the effect
     does in isolation. Here it would wobble the whole headline. The
     second line is the widest thing in the <h1>, so the <h1>
     shrink-wraps to it, and below `lg` the hero column is
     `items-center`. A chip that changes width every rotation therefore
     re-centres the <h1> under it, and "Match faces." on the line above
     visibly slides left and right every couple of seconds. Pinning the
     chip to the longest word holds the whole headline still.

   - Worth knowing if the word list changes: the width is measured from
     `texts`, so adding a much longer word widens the chip for all of
     them.

   - The line is a flex row rather than plain inline text. An
     inline-block with `overflow: hidden` takes its baseline from its
     bottom margin edge rather than from its text, so as ordinary
     inline content the chip would sit low against "Make" instead of
     sharing its baseline. Centring the two boxes sidesteps that, and
     both halves are the same font size, so their text lines up.

   - `overflow-hidden` on the chip, and on the word inside it, is what
     turns the character animation into a slide rather than glyphs
     flying about outside the purple box. The sticker shadow is a
     box-shadow, which overflow does not clip, so the shadow survives.

   Respects prefers-reduced-motion: renders the static word and a chip
   holding the first word, no pop, no rotation.
   ===================================================================== */

interface RotateBlockProps {
  /** The words that rotate inside the chip. Pass a stable array
   *  (module-level constant or useMemo). */
  texts: string[];
  /** The word that holds still, outside the chip. */
  staticText: string;
  /** Sticker styling for the chip. */
  className?: string;
  /** Font size and spacing for the line as a whole — it has to sit on
   *  the wrapper rather than the chip so the static word and the
   *  rotating one are the same size. */
  lineClassName?: string;
  /** Delay before the pop, in seconds. Default 0. */
  delay?: number;
  /** Milliseconds each word holds before the next one. Default 2600 —
   *  longer than TextRotate's own 2000 so a reader landing on the page
   *  gets to finish "Make friends." before it moves. */
  rotationInterval?: number;
}

export function RotateBlock({
  texts,
  staticText,
  className,
  lineClassName,
  delay = 0,
  rotationInterval = 2600,
}: RotateBlockProps) {
  const reducedMotion = useReducedMotion();

  // Longest word wins the sizing, same approach as GooeyBlock.
  const sizer = texts.reduce(
    (longest, text) => (text.length > longest.length ? text : longest),
    texts[0] ?? ""
  );

  // A non-breaking space keeps the gap between the two halves equal to
  // a normal word space at any font size. Flex would collapse a plain
  // space between the items.
  const staticWord = `${staticText} `;

  if (reducedMotion) {
    return (
      <span className={cn("inline-flex items-center whitespace-nowrap", lineClassName)}>
        <span>{staticWord}</span>
        <span className={className}>{texts[0]}</span>
      </span>
    );
  }

  const spring = { type: "spring" as const, stiffness: 420, damping: 14 };

  return (
    <span className={cn("inline-flex items-center whitespace-nowrap", lineClassName)}>
      {/* The static half lands just before the chip, so the line reads
          as one gesture rather than two separate arrivals. */}
      <motion.span
        initial={{ opacity: 0, y: 20, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...spring, delay }}
      >
        {staticWord}
      </motion.span>

      <motion.span
        className={cn("relative overflow-hidden", className)}
        initial={{ opacity: 0, y: 20, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...spring, delay: delay + 0.08 }}
      >
        {/* Holds the chip open. `invisible` rather than `sr-only` or
            `hidden` — it has to keep taking up space. TextRotate
            renders its own sr-only copy of the live word, so this one
            is hidden from assistive tech to avoid announcing it
            twice. */}
        <span aria-hidden className="block whitespace-nowrap invisible">
          {sizer}
        </span>
        <TextRotate
          texts={texts}
          rotationInterval={rotationInterval}
          /* `inline-flex!` and `flex-nowrap!` are load-bearing: our
             `cn` is a plain joiner, not tailwind-merge, so TextRotate's
             own `flex flex-wrap` lands on the element too and only
             importance decides the winner. */
          mainClassName="absolute inset-0 inline-flex! flex-nowrap! items-center justify-center"
          splitLevelClassName="overflow-hidden pb-[0.12em]"
          staggerFrom="last"
          staggerDuration={0.025}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "-120%" }}
          /* Presence mode is TextRotate's default, "wait": the outgoing
             word finishes leaving before the incoming one starts, so
             the chip is briefly empty between the two. That is how the
             effect is designed and demoed. If that gap reads as too
             long, `animatePresenceMode="popLayout"` overlaps them
             instead, and is the one-line change to try first. */
          transition={{ type: "spring", damping: 30, stiffness: 400 }}
        />
      </motion.span>
    </span>
  );
}
