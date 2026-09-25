"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useUserProfile } from "../context/UserProfileContext";

const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL ?? "http://localhost:3001";
const MIN_SUPPORT_CENTS = 100;

function amountInCents(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [dollars, cents = ""] = value.split(".");
  const amount = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount >= MIN_SUPPORT_CENTS ? amount : null;
}

export function SupportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { sessionToken, isSessionReady } = useUserProfile();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const close = useCallback(() => {
    setAmount("");
    setError(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) close();
      if (event.key !== "Tab") return;
      const elements = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled])',
      );
      if (!elements?.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [close, open]);

  if (!open) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (amountInCents(amount) === null) {
      setError("Enter at least $1.00, using no more than two decimal places.");
      inputRef.current?.focus();
      return;
    }
    if (!sessionToken) {
      setError("Your player session is still loading. Please try again in a moment.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${SIGNALING_URL}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ amount }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.checkoutUrl !== "string") {
        setError(typeof data.detail === "string" ? data.detail : "Could not open checkout. Please try again.");
        return;
      }
      window.location.assign(data.checkoutUrl);
    } catch {
      setError("Could not reach checkout. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-[var(--ink-overlay)] p-4 backdrop-blur-sm"
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-title"
        aria-describedby="support-description"
        className="relative w-full max-w-md rounded-3xl border-[4px] border-[var(--charcoal)] bg-[var(--off-white-2)] p-6 text-[var(--charcoal)] shadow-[8px_8px_0_0_var(--charcoal)] sm:p-8"
      >
        <button
          type="button"
          onClick={close}
          disabled={busy}
          aria-label="Close support popup"
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--off-white)] text-xl font-bold hover:bg-[var(--yellow)] disabled:opacity-50"
        >
          ×
        </button>
        <span className="inline-block rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--yellow)] px-4 py-2 font-display text-base font-extrabold uppercase tracking-wide text-[var(--on-accent)] shadow-[3px_3px_0_0_var(--charcoal)] sm:text-lg">
          Support Emoggle
        </span>
        <h2 id="support-title" className="mt-5 pr-8 font-display text-3xl font-bold leading-tight">
          Enjoying the game?
        </h2>
        <p id="support-description" className="mt-3 text-sm leading-relaxed text-[var(--on-surface-variant)]">
          Help us keep Emoggle running. Choose an amount that feels right. Playing is free whether you contribute or not.
        </p>
        <form onSubmit={submit} className="mt-6">
          <label htmlFor="support-amount" className="text-sm font-bold">Your amount (USD)</label>
          <div className="mt-2 flex h-14 items-center rounded-2xl bg-[var(--off-white)] px-4">
            <span aria-hidden className="text-xl font-bold">$</span>
            <input
              ref={inputRef}
              id="support-amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(event) => { setAmount(event.target.value); setError(null); }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "support-error" : undefined}
              className="h-full w-full bg-transparent pl-2 text-xl font-bold outline-none"
            />
          </div>
          {error && <p id="support-error" role="alert" className="mt-3 text-sm font-bold text-[var(--pink-deep)]">{error}</p>}
          <button
            type="submit"
            disabled={busy || !isSessionReady || !sessionToken}
            className="mt-6 min-h-12 w-full rounded-full border-[3px] border-[var(--charcoal)] bg-[var(--purple)] px-5 font-bold text-[var(--ink)] shadow-[4px_4px_0_0_var(--charcoal)] transition-transform active:translate-y-1 active:shadow-none disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? "Opening checkout…" : !isSessionReady ? "Getting ready…" : "Continue to secure checkout"}
          </button>
        </form>
        <button type="button" onClick={close} disabled={busy} className="mt-4 min-h-11 w-full text-sm font-bold underline-offset-4 hover:underline disabled:opacity-50">
          Maybe later — let me play
        </button>
      </div>
    </div>
  );
}
