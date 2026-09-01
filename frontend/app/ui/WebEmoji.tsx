import { cn } from "./cn";

interface WebEmojiProps {
  emoji: string;
  className?: string;
  /** Human-readable name. Omit for decorative emoji. */
  label?: string;
}

/** Render Unicode directly so the browser uses the device's native emoji font. */
export function WebEmoji({ emoji, className, label }: WebEmojiProps) {
  return (
    <span
      className={cn("inline-flex items-center justify-center leading-none", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {emoji}
    </span>
  );
}
