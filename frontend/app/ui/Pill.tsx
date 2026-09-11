"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";

type Tone = "yellow" | "purple" | "pink" | "neutral";

interface PillProps {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  /**
   * Compact variant for chip-stacks (slightly smaller text and
   * tighter padding). Used by the celebrity hero card and the
   * existing seat pills. Optional — defaults to the full size
   * so older call sites don't shift.
   */
  small?: boolean;
}

// The three filled tones pin their ink with an `on-accent` scope —
// the fills stay light in dark mode, so the label must stay dark.
// Border and sticker shadow stay on --ink-shadow so the pill still
// has an edge against the dark page.
const toneStyles: Record<Tone, string> = {
  neutral:
    "bg-[var(--off-white-2)] text-[var(--charcoal)] border-[var(--charcoal)]",
  yellow:
    "on-accent bg-[var(--yellow)] text-[var(--ink)] border-[var(--ink-shadow)]",
  purple:
    "on-accent-inverse bg-[var(--purple)] text-[var(--ink)] border-[var(--ink-shadow)]",
  pink:
    "on-accent bg-[var(--pink)] text-[var(--ink)] border-[var(--ink-shadow)]",
};

export function Pill({ children, tone = "neutral", className, small = false }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-[2px] px-3 py-0.5",
        "font-bold tracking-wide uppercase",
        small ? "text-[9px] px-2 py-0.5" : "text-[11px]",
        "shadow-[2px_2px_0_0_var(--ink-shadow)]",
        toneStyles[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
