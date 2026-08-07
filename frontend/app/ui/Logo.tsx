import { cn } from "./cn";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  /**
   * Default "light" — the playful party vibe on the off-white surface.
   * The wordmark is charcoal on yellow with a thick black border, so it
   * reads at a glance on any background.
   */
  tone?: "light" | "invert";
}

/**
 * The Emoggle wordmark.
 * The two dots are tinted purple and pink — the two player hues for
 * the new "Vibrant Party Play" system.
 */
export function Logo({ className, size = "md", tone = "light" }: LogoProps) {
  const sizes = {
    sm: { wrap: "text-base gap-[0.35em]", dot: "h-1.5 w-1.5", mark: "h-7 w-7" },
    md: { wrap: "text-lg gap-[0.35em]", dot: "h-1.5 w-1.5", mark: "h-8 w-8" },
    lg: { wrap: "text-2xl gap-[0.35em]", dot: "h-2 w-2", mark: "h-10 w-10" },
  } as const;
  const s = sizes[size];

  const isInvert = tone === "invert";
  const wordColor = isInvert ? "text-[var(--off-white)]" : "text-[var(--charcoal)]";
  const markFill = isInvert
    ? "bg-[var(--charcoal)] border-[var(--off-white)]"
    : "bg-[var(--yellow)] border-[var(--charcoal)]";

  return (
    <span
      className={cn(
        "font-display inline-flex items-center font-bold tracking-tight",
        s.wrap,
        wordColor,
        className,
      )}
      aria-label="Emoggle"
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex items-center justify-center rounded-md border-[3px] sticker-sm",
          s.mark,
          markFill,
        )}
      >
        <span className="flex gap-[2px]">
          <span className={cn("rounded-full bg-[var(--purple)]", s.dot)} />
          <span className={cn("rounded-full bg-[var(--pink-deep)]", s.dot)} />
        </span>
      </span>
      <span>emoggle</span>
    </span>
  );
}
