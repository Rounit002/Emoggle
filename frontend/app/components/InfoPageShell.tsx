import Link from "next/link";
import type { ReactNode } from "react";

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
    <main className="min-h-screen bg-[#0b0c14] px-5 py-8 text-white sm:py-12">
      <div className="mx-auto max-w-4xl">
        <nav
          aria-label="Primary navigation"
          className="flex flex-wrap items-center justify-between gap-4"
        >
          <Link
            href="/"
            className="text-xl font-black uppercase tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300"
          >
            Emoggle
          </Link>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-400">
            <Link className="hover:text-white" href="/how-it-works">
              How it works
            </Link>
            <Link className="hover:text-white" href="/about">
              About
            </Link>
            <Link className="hover:text-white" href="/faq">
              FAQ
            </Link>
          </div>
        </nav>

        <header className="border-b border-white/10 py-16 sm:py-24">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-violet-300">
            {eyebrow}
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">
            {title}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-zinc-300">
            {intro}
          </p>
        </header>

        <div className="info-content py-12 sm:py-16">{children}</div>

        <footer className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/10 py-8 text-sm text-zinc-400">
          <Link className="font-black text-white" href="/">
            Play Emoggle
          </Link>
          <Link className="hover:text-white" href="/privacy">
            Privacy
          </Link>
          <Link className="hover:text-white" href="/terms">
            Terms
          </Link>
          <Link className="hover:text-white" href="/contact">
            Contact
          </Link>
        </footer>
      </div>
    </main>
  );
}

