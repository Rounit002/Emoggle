"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "./cn";

interface ScoreProps {
  value: number | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  label?: string;
  /** Tint the score with one player's color. */
  tone?: "neutral" | "purple" | "pink" | "yellow";
  /** When true, animates number changes with a soft flip. */
  animated?: boolean;
}

const sizes = {
  sm: { num: "text-2xl", den: "text-xs", wrap: "gap-0.5" },
  md: { num: "text-4xl", den: "text-sm",  wrap: "gap-1" },
  lg: { num: "text-6xl", den: "text-base", wrap: "gap-1" },
  xl: { num: "text-[clamp(4rem,9vw,7rem)]", den: "text-2xl", wrap: "gap-2" },
} as const;

export function Score({
  value,
  size = "md",
  className,
  label,
  tone = "neutral",
  animated = false,
}: ScoreProps) {
  const s = sizes[size];
  const formatted = value === null ? "--" : value.toFixed(1);
  const toneClass =
    tone === "purple"
      ? "text-[var(--purple-deep)]"
      : tone === "pink"
        ? "text-[var(--pink-deep)]"
        : tone === "yellow"
          ? "text-[var(--yellow-deep)]"
          : "text-[var(--charcoal)]";

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && <span className="eyebrow">{label}</span>}
      <div className={cn("flex items-end", s.wrap)}>
        {animated ? (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={formatted}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className={cn(
                "font-display font-bold tabular leading-none tracking-tight",
                s.num,
                toneClass,
              )}
            >
              {formatted}
            </motion.span>
          </AnimatePresence>
        ) : (
          <span
            className={cn(
              "font-display font-bold tabular leading-none tracking-tight",
              s.num,
              toneClass,
            )}
          >
            {formatted}
          </span>
        )}
        <span className={cn("font-semibold text-[var(--on-surface-variant)] mb-1", s.den)}>/10</span>
      </div>
    </div>
  );
}
