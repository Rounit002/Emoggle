import Link from "next/link";
import type { ReactNode } from "react";
import { Logo, ThemeToggle, cn } from "../ui";

export default function InfoPageShell({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[var(--off-white)] text-[var(--charcoal)]">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
        <nav
          aria-label="Primary navigation"
          className="flex flex-wrap items-center justify-between gap-4 border-b-[3px] border-[var(--charcoal)] pb-5"
        >
          <Link
            href="/"
            className="rounded focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--charcoal)]"
          >
            <Logo size="sm" />
          </Link>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-bold text-[var(--charcoal)]">
            <Link className="hover:underline" href="/how-it-works">How it works</Link>
            <Link className="hover:underline" href="/about">About</Link>
            <Link className="hover:underline" href="/faq">FAQ</Link>
            <Link className="hover:underline" href="/history">History</Link>
            <ThemeToggle size="sm" />
          </div>
        </nav>

        <header className="py-12 sm:py-16">
          <span className="inline-block rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--yellow)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--charcoal)] shadow-[2px_2px_0_0_var(--charcoal)]">
            {eyebrow}
          </span>
          <h1 className="mt-5 font-display text-4xl font-bold tracking-tight text-[var(--charcoal)] sm:text-6xl">
            {title}
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-[var(--on-surface-variant)]">
            {intro}
          </p>
        </header>

        <div className="info-content pb-16">{children}</div>

        <footer className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t-[3px] border-[var(--charcoal)] py-6 text-sm font-bold text-[var(--charcoal)]">
          <Link className="hover:underline" href="/">Play Emoggle</Link>
          <Link className="hover:underline" href="/privacy">Privacy</Link>
          <Link className="hover:underline" href="/terms">Terms</Link>
          <Link className="hover:underline" href="/contact">Contact</Link>
        </footer>
      </div>
    </main>
  );
}
