"use client";

import { cn } from "./cn";

interface ProgressBarProps {
  /** 0..1 */
  value: number;
  tone?: "purple" | "pink" | "yellow" | "neutral";
  /** Use the striped "candy-cane" animation while active. */
  candyStripe?: boolean;
  className?: string;
  label?: string;
  trailing?: string;
  animated?: boolean;
}

const tones = {
  purple: "bg-[var(--purple)] text-[var(--off-white)]",
  pink: "bg-[var(--pink)] text-[var(--charcoal)]",
  yellow: "bg-[var(--yellow)] text-[var(--charcoal)]",
  neutral: "bg-[var(--charcoal)] text-[var(--off-white)]",
} as const;

/**
 * Thick, rounded progress bar. Track is charcoal; fill is one of the
 * brand colors. The fill can animate as a candy-cane stripe while
 * loading — slow, well under the 3 Hz safety threshold.
 */
export function ProgressBar({
  value,
  tone = "yellow",
  candyStripe = false,
  className,
  label,
  trailing,
  animated = false,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const pct = `${(clamped * 100).toFixed(0)}%`;

  return (
    <div className={cn("flex w-full items-center gap-3", className)}>
      {label && (
        <span className="font-mono tabular text-xs font-bold text-[var(--charcoal)] sm:text-sm">
          {label}
        </span>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(clamped * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative h-3 flex-1 overflow-hidden rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--off-white-2)]"
      >
        <div
          className={cn("h-full rounded-full", tones[tone], candyStripe && "candy-stripe")}
          style={{
            width: pct,
            transition: animated ? "width 0.4s ease-out" : undefined,
          }}
        />
      </div>
      {trailing && (
        <span className="font-mono tabular text-xs font-bold text-[var(--charcoal)] sm:text-sm">
          {trailing}
        </span>
      )}
    </div>
  );
}
