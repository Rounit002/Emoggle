"use client";

import { useTheme } from "../context/ThemeContext";
import { cn } from "./cn";

interface ThemeToggleProps {
  className?: string;
  /** Visually smaller variant for cramped headers. */
  size?: "sm" | "md";
}

/**
 * Sun/moon toggle for switching between light and dark themes.
 *
 * Inherits the chunky sticker language from the rest of the UI: a
 * 3px border, a 3px hard offset shadow, and a press-squash on
 * active. The icon swaps on the resolved mode (not the click
 * target) so it always reflects the current visual state.
 */
export function ThemeToggle({ className, size = "md" }: ThemeToggleProps) {
  const { isDark, toggle, source, resetToSystem } = useTheme();

  const isSm = size === "sm";
  const dim = isSm ? "h-9 w-9" : "h-10 w-10";
  const border = isSm ? "border-[2px]" : "border-[3px]";
  const iconSize = isSm ? 16 : 18;

  return (
    <button
      type="button"
      onClick={(e) => {
        // Shift-click resets to "follow the system". Cheap escape
        // hatch for users who don't realize they ever opted in.
        if (e.shiftKey) {
          resetToSystem();
          return;
        }
        toggle();
      }}
      aria-label={
        isDark ? "Switch to light theme" : "Switch to dark theme"
      }
      title={
        source === "manual"
          ? `${isDark ? "Light" : "Dark"} (shift-click to follow system)`
          : `${isDark ? "Light" : "Dark"} (auto from system)`
      }
      className={cn(
        "relative inline-flex items-center justify-center rounded-full",
        border,
        "border-[var(--ink)] bg-[var(--off-white-2)] text-[var(--ink)]",
        "shadow-[3px_3px_0_0_var(--ink-shadow)]",
        "transition-transform duration-100 ease-out",
        "active:translate-y-[3px] active:shadow-[0_0_0_0_var(--ink-shadow)]",
        "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--ink)]",
        dim,
        className,
      )}
    >
      {isDark ? <MoonIcon size={iconSize} /> : <SunIcon size={iconSize} />}
    </button>
  );
}

function SunIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.93 19.07l1.41-1.41" />
      <path d="M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
