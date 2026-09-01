import Link from "next/link";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t-[3px] border-[var(--charcoal)] bg-[var(--off-white-2)]">
      <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-[var(--ink-muted)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-[var(--ink)]">
            <span className="font-display font-extrabold">Emoggle</span>
            <span className="hidden sm:inline text-[var(--ink-muted)]">·</span>
            <span className="text-[var(--ink-muted)]">Two strangers. One emoji.</span>
          </div>

          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href="/history" className="hover:text-[var(--ink)]">History</Link>
            <Link href="/terms" className="hover:text-[var(--ink)]">Terms</Link>
            <Link href="/privacy" className="hover:text-[var(--ink)]">Privacy</Link>
            <Link href="/refund" className="hover:text-[var(--ink)]">Refunds</Link>
            <Link href="/contact" className="hover:text-[var(--ink)]">Contact</Link>
          </nav>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[var(--ink-muted)]">© {year} Emoggle. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
