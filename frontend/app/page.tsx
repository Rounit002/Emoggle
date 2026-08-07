import Link from "next/link";
import type { Metadata } from "next";
import HomeExperience from "./components/HomeExperience";
import { frequentlyAskedQuestions, siteConfig } from "./lib/site";
import { Logo, ThemeToggle } from "./ui";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

export default function Home() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteConfig.url}/#website`,
        url: `${siteConfig.url}/`,
        name: siteConfig.name,
        alternateName: siteConfig.alternateNames,
        description: siteConfig.description,
        inLanguage: "en",
      },
      {
        "@type": ["WebApplication", "VideoGame"],
        "@id": `${siteConfig.url}/#webapp`,
        name: siteConfig.name,
        alternateName: siteConfig.alternateNames,
        url: `${siteConfig.url}/`,
        description: siteConfig.description,
        isPartOf: { "@id": `${siteConfig.url}/#website` },
        applicationCategory: "GameApplication",
        operatingSystem: "Any operating system with a modern browser",
        browserRequirements: "Requires JavaScript and webcam access",
        gamePlatform: "Web browser",
        playMode: [
          "https://schema.org/SinglePlayer",
          "https://schema.org/MultiPlayer",
        ],
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        featureList: [
          "Live emoji expression duels with a random player",
          "Solo emoji expression practice",
          "In-browser facial-expression scoring",
          "No app download required",
        ],
      },
    ],
  };

  return (
    <main className="bg-[var(--off-white)] text-[var(--charcoal)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />

      <HomeExperience />

      <section
        aria-labelledby="how-emoggle-works"
        className="border-t-[3px] border-[var(--charcoal)] px-5 py-20 sm:py-24"
      >
        <div className="mx-auto max-w-[1200px]">
          <span className="inline-block rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--yellow)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--charcoal)] shadow-[2px_2px_0_0_var(--charcoal)]">
            Play in your browser
          </span>
          <h2
            id="how-emoggle-works"
            className="mt-4 max-w-3xl font-display text-3xl font-bold tracking-tight text-[var(--charcoal)] sm:text-5xl"
          >
            A face-expression game built around one shared emoji
          </h2>
          <p className="mt-5 max-w-3xl text-base leading-7 text-[var(--on-surface-variant)] sm:text-lg">
            Emoggle is a casual webcam game where an emoji appears on screen
            and players try to recreate its expression. Face landmarks are
            analyzed in the browser to produce an expression score.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <article
              id="multiplayer"
              className="rounded-3xl border-[4px] border-[var(--purple-deep)] bg-[var(--off-white-2)] p-7 shadow-[6px_6px_0_0_var(--charcoal)] tilt-l-1"
            >
              <span className="inline-block rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--purple)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--off-white)] shadow-[2px_2px_0_0_var(--charcoal)]">
                Multiplayer mode
              </span>
              <h3 className="mt-3 font-display text-2xl font-bold tracking-tight text-[var(--charcoal)]">
                Live emoji face duel
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--on-surface-variant)]">
                Get matched with another player, receive the same emoji prompt,
                and compete for the closest facial-expression score in real
                time.
              </p>
            </article>

            <article
              id="solo"
              className="rounded-3xl border-[4px] border-[var(--pink-deep)] bg-[var(--off-white-2)] p-7 shadow-[6px_6px_0_0_var(--charcoal)] tilt-r-1"
            >
              <span className="inline-block rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--pink)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--charcoal)] shadow-[2px_2px_0_0_var(--charcoal)]">
                Solo mode
              </span>
              <h3 className="mt-3 font-display text-2xl font-bold tracking-tight text-[var(--charcoal)]">
                Solo Emoji Scan
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--on-surface-variant)]">
                Practice by yourself, copy the emoji face, and get an instant
                score without waiting for a partner.
              </p>
            </article>
          </div>

          <ol className="mt-14 grid gap-6 sm:grid-cols-3">
            {[
              ["1", "Allow camera access", "A webcam is used for live expression detection."],
              ["2", "Copy the emoji", "Recreate the expression shown on screen."],
              ["3", "Get your score", "See how closely your face matched the prompt."],
            ].map(([number, title, description], i) => (
              <li
                key={number}
                className={`rounded-3xl border-[3px] border-[var(--charcoal)] bg-[var(--off-white-2)] p-6 shadow-[6px_6px_0_0_var(--charcoal)] ${
                  i === 0 ? "tilt-l-1" : i === 1 ? "tilt-0" : "tilt-r-1"
                }`}
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--yellow)] font-mono text-sm font-extrabold text-[var(--charcoal)] shadow-[2px_2px_0_0_var(--charcoal)]">
                  {number}
                </span>
                <h3 className="mt-5 font-display text-lg font-bold tracking-tight text-[var(--charcoal)]">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--on-surface-variant)]">
                  {description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        aria-labelledby="frequently-asked-questions"
        className="border-t-[3px] border-[var(--charcoal)] px-5 py-20 sm:py-24"
      >
        <div className="mx-auto max-w-4xl">
          <span className="inline-block rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--yellow)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--charcoal)] shadow-[2px_2px_0_0_var(--charcoal)]">
            Quick answers
          </span>
          <h2
            id="frequently-asked-questions"
            className="mt-4 font-display text-3xl font-bold tracking-tight text-[var(--charcoal)] sm:text-5xl"
          >
            Frequently asked questions
          </h2>
          <div className="mt-9 divide-y-[2px] divide-[var(--ink-line)] rounded-3xl border-[4px] border-[var(--charcoal)] bg-[var(--off-white-2)] shadow-[6px_6px_0_0_var(--charcoal)]">
            {frequentlyAskedQuestions.slice(0, 4).map((item) => (
              <details key={item.question} className="group px-6 py-5 sm:px-8">
                <summary className="cursor-pointer list-none pr-8 font-display text-lg font-bold text-[var(--charcoal)] marker:hidden">
                  <span className="flex items-center justify-between gap-3">
                    {item.question}
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--yellow)] font-mono text-base font-bold text-[var(--charcoal)] shadow-[2px_2px_0_0_var(--charcoal)] transition-transform group-open:rotate-45">
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3 max-w-3xl text-[15px] leading-7 text-[var(--on-surface-variant)]">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
          <Link
            href="/faq"
            className="mt-6 inline-flex h-12 items-center rounded-full border-[3px] border-[var(--charcoal)] bg-[var(--off-white-2)] px-5 text-sm font-bold text-[var(--charcoal)] shadow-[4px_4px_0_0_var(--charcoal)] transition-transform active:translate-y-1 active:shadow-none hover:bg-[var(--yellow)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--charcoal)]"
          >
            Read all FAQs
          </Link>
        </div>
      </section>

      <nav
        aria-label="About Emoggle"
        className="border-t-[3px] border-[var(--charcoal)] px-5 py-8"
      >
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-3 text-sm font-bold text-[var(--charcoal)]">
          <Logo size="sm" />
          <Link className="hover:underline" href="/how-it-works">How it works</Link>
          <Link className="hover:underline" href="/about">About</Link>
          <Link className="hover:underline" href="/faq">FAQ</Link>
          <Link className="hover:underline" href="/history">History</Link>
          <Link className="hover:underline" href="/privacy">Privacy</Link>
          <Link className="hover:underline" href="/terms">Terms</Link>
          <Link className="hover:underline" href="/contact">Contact</Link>
          <span className="ml-auto" />
          <ThemeToggle size="sm" />
        </div>
      </nav>
    </main>
  );
}
