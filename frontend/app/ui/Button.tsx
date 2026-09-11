"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "tertiary";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
  /** Add the "sheen" gloss highlight on the top half. Default true. */
  sheen?: boolean;
}

/**
 * Buttons are the primary interaction point in this design system.
 *
 * Sticker shadow, thick border, "sheen" gloss highlight, and a real
 * press-squash (the whole button drops 4px on press, matching the
 * shadow offset, so it feels like pushing into a soft surface).
 */
// The border, sticker shadow and focus ring all sit *outside* the
// button, against the page — so they use --ink-shadow, which flips
// with the theme. --charcoal can't be used here: on the filled
// variants the `.on-accent` scope pins it to the dark ink that
// prints on the fill, which would make all three vanish on the
// dark page. In the light theme the two resolve to the same value.
const base =
  "relative inline-flex touch-manipulation cursor-pointer items-center justify-center gap-2 font-bold tracking-tight " +
  "rounded-full border-[3px] border-[var(--ink-shadow)] " +
  "transition-[transform,box-shadow,background-color,color,opacity] duration-150 ease-out motion-reduce:transition-none " +
  "active:translate-y-1 " +
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ink-shadow)] " +
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0 select-none will-change-transform " +
  "shadow-[4px_4px_0_0_var(--ink-shadow)] active:shadow-[0_0_0_0_var(--ink-shadow)]";

const sizes: Record<Size, string> = {
  sm: "h-11 px-5 text-sm",
  md: "h-14 px-6 text-[15px]",
  lg: "h-16 px-8 text-base",
};

// The three filled variants carry an `on-accent` scope class. The
// yellow / pink / purple fills stay light in dark mode, so their
// label has to stay dark (white, for purple) rather than following
// the theme — see the .on-accent rules in globals.css.
const variants: Record<Variant, string> = {
  // Primary: yellow. The energy of the game.
  primary: "on-accent bg-[var(--yellow)] text-[var(--ink)] hover:bg-[var(--yellow-hover)]",
  // Secondary: bright purple. For back/cancel.
  secondary: "on-accent-inverse bg-[var(--purple)] text-[var(--ink)] hover:bg-[var(--purple-hover)]",
  // Tertiary: coral pink. For special moments (win CTA, alerts).
  tertiary: "on-accent bg-[var(--pink)] text-[var(--ink)] hover:bg-[var(--pink-hover)]",
  // Ghost sits on the page surface, so it follows the theme ink.
  ghost: "bg-[var(--off-white)] text-[var(--charcoal)] hover:bg-[var(--surface-container)]",
  // `on-error` is a marker only — it carries the dark-theme disabled rule.
  danger: "on-error bg-[var(--error)] text-[var(--on-error)] hover:bg-[var(--error-hover)]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      className,
      children,
      iconLeft,
      iconRight,
      block,
      sheen = true,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          base,
          sizes[size],
          variants[variant],
          block && "w-full",
          sheen && "overflow-hidden",
          className,
        )}
        {...rest}
      >
        {sheen && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background:
                "linear-gradient(to bottom, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0) 50%)",
            }}
          />
        )}
        {iconLeft && <span className="relative">{iconLeft}</span>}
        <span className="relative">{children}</span>
        {iconRight && <span className="relative">{iconRight}</span>}
      </button>
    );
  },
);
