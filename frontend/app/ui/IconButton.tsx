"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string; // accessible name
  size?: "sm" | "md" | "lg";
  variant?: "default" | "tinted-a" | "tinted-b" | "yellow" | "purple" | "pink";
  children: ReactNode;
}

const sizes = {
  sm: "h-11 w-11",
  md: "h-14 w-14",
  lg: "h-16 w-16",
} as const;

// `default` sits on the page surface and follows the theme ink.
// The solid fills (yellow / purple / pink) keep dark ink via the
// `on-accent` scopes, and hang their border + sticker shadow off
// --ink-shadow so both still read against the dark page.
// The two "tinted" variants use the soft accent wash, which does
// flip with the theme, so their ink is the *-deep token.
const variants = {
  default:
    "bg-[var(--off-white)] text-[var(--charcoal)] border-[3px] border-[var(--charcoal)] shadow-[3px_3px_0_0_var(--ink-shadow)] active:shadow-[0_0_0_0_var(--ink-shadow)] active:translate-y-[3px]",
  "tinted-a":
    "bg-[var(--purple-container)] text-[var(--purple-deep)] border-[3px] border-[var(--purple-deep)] shadow-[3px_3px_0_0_var(--purple-deep)] active:shadow-[0_0_0_0_var(--purple-deep)] active:translate-y-[3px]",
  "tinted-b":
    "bg-[var(--pink-container)] text-[var(--pink-deep)] border-[3px] border-[var(--pink-deep)] shadow-[3px_3px_0_0_var(--pink-deep)] active:shadow-[0_0_0_0_var(--pink-deep)] active:translate-y-[3px]",
  yellow:
    "on-accent bg-[var(--yellow)] text-[var(--ink)] border-[3px] border-[var(--ink-shadow)] shadow-[3px_3px_0_0_var(--ink-shadow)] active:shadow-[0_0_0_0_var(--ink-shadow)] active:translate-y-[3px]",
  purple:
    "on-accent-inverse bg-[var(--purple)] text-[var(--ink)] border-[3px] border-[var(--ink-shadow)] shadow-[3px_3px_0_0_var(--ink-shadow)] active:shadow-[0_0_0_0_var(--ink-shadow)] active:translate-y-[3px]",
  pink:
    "on-accent bg-[var(--pink)] text-[var(--ink)] border-[3px] border-[var(--ink-shadow)] shadow-[3px_3px_0_0_var(--ink-shadow)] active:shadow-[0_0_0_0_var(--ink-shadow)] active:translate-y-[3px]",
} as const;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { label, size = "md", variant = "default", className, children, type = "button", ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={cn(
          "relative inline-flex touch-manipulation cursor-pointer items-center justify-center rounded-full transition-[transform,box-shadow,background-color,color,opacity] duration-150 motion-reduce:transition-none",
          "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--ink-shadow)]",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0",
          sizes[size],
          variants[variant],
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
