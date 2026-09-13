"use client";

/**
 * NameEntryModal
 * --------------
 * Single modal that powers both the first-time "what's your name?"
 * gate and the "edit name" flow used from the home header.
 *
 * Behavior
 *  - Pre-populates with the current stored name when present.
 *  - Validates: non-empty after trim, max 20 chars, no control
 *    characters. The button stays disabled until the input is
 *    valid AND differs from the current stored value (so editing
 *    a name to the same value doesn't trigger a no-op write).
 *  - On submit, calls `onSubmit(cleaned)` and lets the parent
 *    handle persistence. This keeps the storage decision in the
 *    PlayerNameContext rather than in the modal.
 *  - Optional `required` mode disables the cancel button. The
 *    first-time entry uses this so a brand-new user can't dismiss
 *    the modal without picking a name.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Button, User, X, cn } from "../ui";
import { NAME_MAX_LENGTH, validateName } from "../lib/storage";
import { isInappropriateName, NAME_MODERATION_ERROR } from "../lib/nameModeration";

interface NameEntryModalProps {
  open: boolean;
  /** Current stored name (if any). Used to pre-fill the input and
   *  to compute the "did the value change?" check. */
  currentName?: string | null;
  /** When true, the modal has no cancel button and the X / Esc
   *  handlers are no-ops. The first-time gate uses this. */
  required?: boolean;
  /** Submit handler. Receives the cleaned, validated name. */
  onSubmit: (name: string) => void;
  /** Cancel handler. Only used when `required` is false. */
  onCancel?: () => void;
}

export function NameEntryModal({
  open,
  currentName = null,
  required = false,
  onSubmit,
  onCancel,
}: NameEntryModalProps) {
  const [value, setValue] = useState(currentName ?? "");
  const [touched, setTouched] = useState(false);
  const [rejectedName, setRejectedName] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const reduceMotion = useReducedMotion();

  // Sync the input when the modal re-opens with a different
  // pre-filled value (e.g. the user clicked "Edit name" while
  // a different tab updated the name).
  useEffect(() => {
    if (open) {
      // Reset form state when a fresh dialog session opens.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(currentName ?? "");
      setRejectedName(false);
      setTouched(false);
      // Focus the input after the modal mount animation lands.
      const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [open, currentName]);

  // Keep keyboard focus inside the dialog. Escape closes only when optional.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !required) onCancel?.();
      if (e.key !== "Tab") return;
      const focusable = formRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, required, onCancel]);

  useEffect(() => {
    if (!open) return;
    const returnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    return () => {
      window.setTimeout(() => returnFocus?.focus(), 0);
    };
  }, [open]);

  // Lock body scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const cleaned = validateName(value);
  const isValid = cleaned !== null;
  const isDirty = cleaned !== (currentName ?? null);
  const canSubmit = isValid && isDirty && !rejectedName;

  const trimmedLength = value.trim().length;
  const inappropriate = rejectedName || isInappropriateName(value);
  const showError = inappropriate || (touched && !isValid && value.length > 0);
  const helperText = inappropriate ? NAME_MODERATION_ERROR : !isValid && value.length > 0
    ? trimmedLength === 0
      ? "Pick something — even one letter is fine."
      : value.length > NAME_MAX_LENGTH
        ? `Trim it down to ${NAME_MAX_LENGTH} characters or fewer.`
        : "Letters, numbers, and basic punctuation only."
    : `${trimmedLength}/${NAME_MAX_LENGTH} characters · only stored on this device`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!cleaned || rejectedName) return;
    onSubmit(cleaned);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="name-entry"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--ink-overlay)] p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={required ? "Choose a name" : "Edit your name"}
          onMouseDown={(e) => {
            // Backdrop click is a "cancel" only when not required.
            if (e.target === e.currentTarget && !required) onCancel?.();
          }}
        >
          <motion.form
            ref={formRef}
            initial={reduceMotion ? false : { y: 20, opacity: 0, scale: 0.96, rotate: -1.5 }}
            animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
            exit={{ y: 12, opacity: 0, scale: 0.97, rotate: 1 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 22 }}
            onSubmit={handleSubmit}
            className={cn(
              "relative flex w-full max-w-md flex-col gap-5 rounded-3xl border-[4px] border-[var(--charcoal)] bg-[var(--off-white-2)] p-6 shadow-[10px_10px_0_0_var(--charcoal)] sm:p-7",
            )}
          >
            {!required && (
              <button
                type="button"
                onClick={onCancel}
                aria-label="Cancel"
                className="absolute right-3 top-3 inline-flex h-11 w-11 touch-manipulation cursor-pointer items-center justify-center rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--off-white)] text-[var(--charcoal)] shadow-[2px_2px_0_0_var(--charcoal)] transition-[transform,box-shadow,background-color] duration-150 active:translate-y-0.5 active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--charcoal)] motion-reduce:transition-none"
              >
                <X size={16} />
              </button>
            )}

            <div className="flex flex-col items-center gap-2 text-center">
              <span
                className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border-[3px] border-[var(--ink-shadow)] on-accent bg-[var(--yellow)] shadow-[4px_4px_0_0_var(--ink-shadow)]"
                aria-hidden
              >
                <User size={26} />
              </span>
              <h2 className="font-display text-2xl font-bold leading-tight tracking-tight text-[var(--charcoal)] sm:text-3xl">
                {required ? "What's your name?" : "Edit your name"}
              </h2>
              <p className="max-w-sm text-sm leading-relaxed text-[var(--on-surface-variant)]">
                {required
                  ? "We\u2019ll show it next to your face during live duels so your partner knows who they\u2019re squishing."
                  : "Update the name that appears on your camera tile and in the chat."}{" "}
                <span className="font-bold text-[var(--charcoal)]">
                  Stays on this device.
                </span>
              </p>
            </div>

            <label className="flex flex-col gap-2">
              <span className="font-mono text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                Display name
              </span>
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => {
                  if (isInappropriateName(e.target.value)) {
                    setRejectedName(true);
                    return;
                  }
                  setRejectedName(false);
                  setValue(e.target.value);
                }}
                onBlur={() => setTouched(true)}
                maxLength={NAME_MAX_LENGTH + 8 /* allow typing over the cap, then validate */}
                placeholder="e.g. Sarah"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={showError || undefined}
                aria-describedby="name-entry-help"
                className={cn(
                  "h-14 w-full rounded-2xl border-[3px] border-[var(--charcoal)] bg-[var(--off-white)] px-4 text-base font-bold text-[var(--charcoal)] shadow-[3px_3px_0_0_var(--charcoal)]",
                  "placeholder:font-normal placeholder:text-[var(--ink-muted)]",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--charcoal)] focus-visible:ring-offset-2",
                  showError && "border-[var(--pink-deep)] shadow-[3px_3px_0_0_var(--pink-deep)]",
                )}
              />
              <span
                id="name-entry-help"
                aria-live="polite"
                className={cn(
                  "text-xs",
                  showError ? "text-[var(--pink-deep)]" : "text-[var(--on-surface-variant)]",
                )}
              >
                {helperText}
              </span>
            </label>

            <div className="flex flex-col-reverse items-center gap-2 sm:flex-row sm:justify-end sm:gap-3">
              {!required && onCancel && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onCancel}
                  block
                  className="sm:w-auto"
                >
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                disabled={!canSubmit}
                block
                className="sm:w-auto"
              >
                {required ? "Continue" : currentName ? "Save" : "Continue"}
              </Button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
