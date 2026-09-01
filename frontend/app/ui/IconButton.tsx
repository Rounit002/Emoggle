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

const variants = {
  default:
    "bg-[var(--off-white)] text-[var(--charcoal)] border-[3px] border-[var(--charcoal)] shadow-[3px_3px_0_0_var(--charcoal)] active:shadow-[0_0_0_0_var(--charcoal)] active:translate-y-[3px]",
  "tinted-a":
    "bg-[var(--purple-container)] text-[var(--purple)] border-[3px] border-[var(--purple-deep)] shadow-[3px_3px_0_0_var(--purple-deep)] active:shadow-[0_0_0_0_var(--purple-deep)] active:translate-y-[3px]",
  "tinted-b":
    "bg-[var(--tertiary-container)] text-[var(--pink-deep)] border-[3px] border-[var(--pink-deep)] shadow-[3px_3px_0_0_var(--pink-deep)] active:shadow-[0_0_0_0_var(--pink-deep)] active:translate-y-[3px]",
  yellow:
    "bg-[var(--yellow)] text-[var(--charcoal)] border-[3px] border-[var(--charcoal)] shadow-[3px_3px_0_0_var(--charcoal)] active:shadow-[0_0_0_0_var(--charcoal)] active:translate-y-[3px]",
  purple:
    "bg-[var(--purple)] text-[var(--off-white)] border-[3px] border-[var(--purple-deep)] shadow-[3px_3px_0_0_var(--purple-deep)] active:shadow-[0_0_0_0_var(--purple-deep)] active:translate-y-[3px]",
  pink:
    "bg-[var(--pink)] text-[var(--charcoal)] border-[3px] border-[var(--pink-deep)] shadow-[3px_3px_0_0_var(--pink-deep)] active:shadow-[0_0_0_0_var(--pink-deep)] active:translate-y-[3px]",
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
          "relative inline-flex items-center justify-center rounded-full transition-transform duration-100",
          "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--charcoal)]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
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
