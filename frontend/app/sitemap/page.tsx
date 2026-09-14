import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HTML Sitemap",
  description: "Browse the public pages on Emoggle, the emoji face-matching webcam game.",
  alternates: { canonical: "/sitemap" },
};

const links = [
  ["/", "Play Emoggle"],
  ["/how-it-works", "How the emoji face game works"],
  ["/about", "About Emoggle"],
  ["/faq", "Frequently asked questions"],
  ["/history", "Game history"],
  ["/contact", "Contact"],
  ["/privacy", "Privacy policy"],
  ["/terms", "Terms and conditions"],
  ["/refund", "Refunds and cancellations"],
] as const;

export default function SitemapPage() {
  return (
    <main className="min-h-screen bg-[var(--off-white)] px-5 py-12 text-[var(--charcoal)] sm:px-8 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <p className="eyebrow">Explore Emoggle</p>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-6xl">HTML sitemap</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--on-surface-variant)]">
          Find every public page for the emoji face-matching game.
        </p>
        <nav aria-label="Sitemap" className="mt-10 grid gap-3 sm:grid-cols-2">
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-2xl border-[3px] border-[var(--charcoal)] bg-[var(--off-white-2)] px-5 py-4 font-bold shadow-[4px_4px_0_0_var(--charcoal)] hover:bg-[var(--yellow)]"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
