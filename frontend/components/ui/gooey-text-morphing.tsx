"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface GooeyTextProps {
  /**
   * The phrases to cycle through. Keep this array referentially stable
   * (a module-level constant, or `useMemo`) — a new array on every render
   * restarts the animation loop.
   */
  texts: string[];
  /** Seconds spent blurring from one phrase into the next. Default 1. */
  morphTime?: number;
  /** Seconds a phrase holds fully legible before the next morph. Default 0.25. */
  cooldownTime?: number;
  className?: string;
  textClassName?: string;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Reads `prefers-reduced-motion` without breaking hydration: the server
 * snapshot is always false, so the SSR markup and the first client render
 * agree, and React swaps in the real value immediately after.
 */
function usePrefersReducedMotion(): boolean {
  return React.useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false
  );
}

export function GooeyText({
  texts,
  morphTime = 1,
  cooldownTime = 0.25,
  className,
  textClassName
}: GooeyTextProps) {
  const text1Ref = React.useRef<HTMLSpanElement>(null);
  const text2Ref = React.useRef<HTMLSpanElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  // The SVG filter is referenced by id from CSS, so the id has to be unique
  // per instance — two <GooeyText> on one page with a hardcoded id would both
  // point at whichever filter rendered first.
  const filterId = `gooey-threshold-${React.useId().replace(/:/g, "")}`;

  React.useEffect(() => {
    if (texts.length === 0) return;

    // Reduced motion: show the first phrase, fully legible, and never morph.
    if (prefersReducedMotion) {
      if (text1Ref.current && text2Ref.current) {
        text1Ref.current.textContent = texts[0];
        text1Ref.current.style.filter = "";
        text1Ref.current.style.opacity = "100%";
        text2Ref.current.textContent = "";
        text2Ref.current.style.filter = "";
        text2Ref.current.style.opacity = "0%";
      }
      return;
    }

    let textIndex = texts.length - 1;
    let time = new Date();
    let morph = 0;
    let cooldown = cooldownTime;

    const setMorph = (fraction: number) => {
      if (text1Ref.current && text2Ref.current) {
        text2Ref.current.style.filter = `blur(${Math.min(8 / fraction - 8, 100)}px)`;
        text2Ref.current.style.opacity = `${Math.pow(fraction, 0.4) * 100}%`;

        fraction = 1 - fraction;
        text1Ref.current.style.filter = `blur(${Math.min(8 / fraction - 8, 100)}px)`;
        text1Ref.current.style.opacity = `${Math.pow(fraction, 0.4) * 100}%`;
      }
    };

    const doCooldown = () => {
      morph = 0;
      if (text1Ref.current && text2Ref.current) {
        text2Ref.current.style.filter = "";
        text2Ref.current.style.opacity = "100%";
        text1Ref.current.style.filter = "";
        text1Ref.current.style.opacity = "0%";
      }
    };

    const doMorph = () => {
      morph -= cooldown;
      cooldown = 0;
      let fraction = morph / morphTime;

      if (fraction > 1) {
        cooldown = cooldownTime;
        fraction = 1;
      }

      setMorph(fraction);
    };

    // The loop id has to be captured so cleanup can cancel it. Without this,
    // every unmount (and every Strict Mode double-invoke in development)
    // leaves a requestAnimationFrame loop running forever against detached
    // nodes, and two mounts means two loops fighting over the same refs.
    let frameId = 0;

    function animate() {
      frameId = requestAnimationFrame(animate);
      const newTime = new Date();
      const shouldIncrementIndex = cooldown > 0;
      const dt = (newTime.getTime() - time.getTime()) / 1000;
      time = newTime;

      cooldown -= dt;

      if (cooldown <= 0) {
        if (shouldIncrementIndex) {
          textIndex = (textIndex + 1) % texts.length;
          if (text1Ref.current && text2Ref.current) {
            text1Ref.current.textContent = texts[textIndex % texts.length];
            text2Ref.current.textContent = texts[(textIndex + 1) % texts.length];
          }
        }
        doMorph();
      } else {
        doCooldown();
      }
    }

    animate();

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [texts, morphTime, cooldownTime, prefersReducedMotion]);

  return (
    <div className={cn("relative", className)}>
      <svg className="absolute h-0 w-0" aria-hidden="true" focusable="false">
        <defs>
          <filter id={filterId}>
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 255 -140"
            />
          </filter>
        </defs>
      </svg>

      {/*
        `h-full` matters when this is dropped into a container that has a
        height of its own (an absolutely-positioned overlay, say). The two
        spans below are absolutely positioned, so this flex box has no content
        height to derive from; without `h-full` it collapses to zero and the
        text centres on the container's top edge instead of inside it. In an
        auto-height parent `h-full` resolves back to auto, so the original
        "centre on the collapsed line" behaviour is unchanged.

        The filter is what makes neighbouring blurred glyphs bleed together
        instead of cross-fading: it also makes this element the containing
        block for the absolutely-positioned spans.
      */}
      <div
        className="flex h-full items-center justify-center"
        style={{ filter: `url(#${filterId})` }}
      >
        <span
          ref={text1Ref}
          className={cn(
            "absolute inline-block select-none text-center text-6xl md:text-[60pt]",
            "text-foreground",
            textClassName
          )}
        />
        <span
          ref={text2Ref}
          className={cn(
            "absolute inline-block select-none text-center text-6xl md:text-[60pt]",
            "text-foreground",
            textClassName
          )}
        />
      </div>
    </div>
  );
}
