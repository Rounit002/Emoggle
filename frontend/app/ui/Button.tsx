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
const base =
  "relative inline-flex items-center justify-center gap-2 font-bold tracking-tight " +
  "rounded-full border-[3px] border-[var(--charcoal)] " +
  "transition-transform duration-100 ease-out " +
  "active:translate-y-1 " +
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--charcoal)] " +
  "disabled:opacity-50 disabled:cursor-not-allowed select-none will-change-transform " +
  "shadow-[4px_4px_0_0_var(--charcoal)] active:shadow-[0_0_0_0_var(--charcoal)]";

const sizes: Record<Size, string> = {
  sm: "h-11 px-5 text-sm",
  md: "h-14 px-6 text-[15px]",
  lg: "h-16 px-8 text-base",
};

const variants: Record<Variant, string> = {
  // Primary: yellow. The energy of the game.
  primary: "bg-[var(--yellow)] text-[var(--charcoal)] hover:bg-[#ffe173]",
  // Secondary: bright purple. For back/cancel.
  secondary: "bg-[var(--purple)] text-[var(--off-white)] hover:bg-[var(--purple-deep)]",
  // Tertiary: coral pink. For special moments (win CTA, alerts).
  tertiary: "bg-[var(--pink)] text-[var(--charcoal)] hover:bg-[var(--tertiary-container)]",
  ghost: "bg-[var(--off-white)] text-[var(--charcoal)] hover:bg-[var(--surface-container)]",
  danger: "bg-[var(--error)] text-[var(--on-error)] hover:bg-[#d32f2f]",
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
