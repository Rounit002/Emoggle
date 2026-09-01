import { cn } from "./cn";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  /**
   * Default "light" — the wordmark is bold purple on the off-white
   * surface, with a white sticker outline and a soft yellow halo.
   * "invert" swaps the text and face ink to off-white for use on
   * dark or colored surfaces where purple would lose contrast.
   */
  tone?: "light" | "invert";
}

/**
 * The Emoggle wordmark.
 *
 * "Em" + a smiling yellow face (replacing the "o") + "ggle", all
 * in bold purple, wrapped in a thick white sticker outline with
 * a soft yellow glow behind it. The face is an inline SVG so it
 * scales crisply at any size and inherits the brand palette via
 * CSS custom properties.
 */
export function Logo({ className, size = "md", tone = "light" }: LogoProps) {
  const sizes = {
    // Face height is calibrated to be slightly taller than the
    // cap-height of the surrounding text so the wordmark reads
    // as one continuous shape, not "text + sticker".
    sm: { wrap: "text-base", face: "h-5 w-5" },
    md: { wrap: "text-lg", face: "h-6 w-6" },
    lg: { wrap: "text-2xl", face: "h-8 w-8" },
  } as const;
  const s = sizes[size];

  const isInvert = tone === "invert";
  // The wordmark ink. Purple on the off-white surface, off-white
  // on dark/colored surfaces.
  const wordColor = isInvert ? "text-[var(--off-white)]" : "text-[var(--purple-deep)]";
  // The face features (eyes + smile) share the same ink so the
  // face reads as part of the wordmark, not a separate element.
  const inkColor = isInvert ? "var(--off-white)" : "var(--purple-deep)";

  return (
    <span
      className={cn(
        "font-display inline-flex items-center font-extrabold tracking-tight",
        // Sticker-style wrapper: the white outline is rendered as
        // a 3px box-shadow spread (so it follows the wrapper's
        // rounded corners cleanly), and a soft yellow halo sits
        // behind the wordmark. The wrapper has no border of its
        // own — the shadow does the sticker work.
        "rounded-2xl px-1.5 py-0.5",
        "shadow-[0_0_0_3px_var(--off-white),0_0_12px_rgba(255,217,61,0.55)]",
        s.wrap,
        className,
      )}
      aria-label="Emoggle"
    >
      <span className={cn(wordColor)}>Em</span>
      {/* Smiling face replacing the "o". Inline SVG so it scales
          with the size prop and the strokes stay crisp on
          retina. viewBox is 32x32; the circle, two closed eyes
          (upward curves like ‿), and the smile all use round
          line caps so nothing looks sharp. */}
      <svg
        viewBox="0 0 32 32"
        className={cn("mx-[1px] inline-block", s.face)}
        aria-hidden
      >
        {/* Face — yellow disc */}
        <circle cx="16" cy="16" r="14" fill="var(--yellow)" />
        {/* Left eye (closed, smiling) */}
        <path
          d="M9 14 Q11 11 13 14"
          stroke={inkColor}
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
        {/* Right eye (closed, smiling) */}
        <path
          d="M19 14 Q21 11 23 14"
          stroke={inkColor}
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
        {/* Big open smile */}
        <path
          d="M9 19 Q16 25 23 19"
          stroke={inkColor}
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
      <span className={cn(wordColor)}>ggle</span>
    </span>
  );
}
