import Link from "next/link";
import type { Metadata } from "next";
import HomeExperience from "./components/HomeExperience";
import { frequentlyAskedQuestions, siteConfig } from "./lib/site";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
  openGraph: {
    url: "/",
  },
};

export default function Home() {
  const webApplicationSchema = {
    "@context": "https://schema.org",
    "@type": ["WebApplication", "VideoGame"],
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
    applicationCategory: "GameApplication",
    operatingSystem: "Any operating system with a modern web browser",
    browserRequirements: "Requires JavaScript and webcam access",
    gamePlatform: "Web browser",
    playMode: [
      "https://schema.org/SinglePlayer",
      "https://schema.org/MultiPlayer",
    ],
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "Live emoji expression duels with a random player",
      "Solo emoji expression practice",
      "In-browser facial-expression scoring",
      "No app download required",
    ],
  };

  return (
    <main className="bg-[#0b0c14] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(webApplicationSchema).replace(/</g, "\\u003c"),
        }}
      />

      <HomeExperience />

      <section
        aria-labelledby="how-emoggle-works"
        className="border-t border-white/10 bg-[#0b0c14] px-5 py-20"
      >
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-violet-300">
            Play in your browser
          </p>
          <h2
            id="how-emoggle-works"
            className="mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-5xl"
          >
            A face-expression game built around one shared emoji
          </h2>
          <p className="mt-6 max-w-3xl text-base leading-7 text-zinc-300 sm:text-lg">
            Emoggle is a casual webcam game where an emoji appears on screen
            and players try to recreate its expression. Face landmarks are
            analyzed in the browser to produce an expression score.
          </p>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <article
              id="multiplayer"
              className="rounded-3xl border border-yellow-300/20 bg-yellow-300/5 p-7"
            >
              <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-300">
                Multiplayer mode
              </p>
              <h3 className="mt-3 text-2xl font-black">
                Live emoji face duel
              </h3>
              <p className="mt-3 leading-7 text-zinc-300">
                Get matched with another player, receive the same emoji prompt,
                and compete for the closest facial-expression score in real
                time.
              </p>
            </article>

            <article
              id="solo"
              className="rounded-3xl border border-cyan-300/20 bg-cyan-300/5 p-7"
            >
              <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">
                Solo mode
              </p>
              <h3 className="mt-3 text-2xl font-black">Solo Emoji Scan</h3>
              <p className="mt-3 leading-7 text-zinc-300">
                Practice by yourself, copy the emoji face, and get an instant
                score without waiting for a partner.
              </p>
            </article>
          </div>

          <ol className="mt-12 grid gap-5 sm:grid-cols-3">
            {[
              ["1", "Allow camera access", "A webcam is used for live expression detection."],
              ["2", "Copy the emoji", "Recreate the expression shown on screen."],
              ["3", "Get your score", "See how closely your face matched the prompt."],
            ].map(([number, title, description]) => (
              <li
                key={number}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-500 font-black">
                  {number}
                </span>
                <h3 className="mt-5 text-lg font-black">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        aria-labelledby="frequently-asked-questions"
        className="bg-zinc-950 px-5 py-20"
      >
        <div className="mx-auto max-w-4xl">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-cyan-300">
            Quick answers
          </p>
          <h2
            id="frequently-asked-questions"
            className="mt-3 text-3xl font-black tracking-tight sm:text-5xl"
          >
            Frequently asked questions
          </h2>
          <div className="mt-9 divide-y divide-white/10 rounded-3xl border border-white/10 bg-white/[0.03] px-6 sm:px-8">
            {frequentlyAskedQuestions.slice(0, 4).map((item) => (
              <details key={item.question} className="group py-6">
                <summary className="cursor-pointer list-none pr-8 text-lg font-bold marker:content-none">
                  {item.question}
                </summary>
                <p className="mt-3 max-w-3xl leading-7 text-zinc-300">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
          <Link
            href="/faq"
            className="mt-7 inline-flex min-h-11 items-center rounded-full border border-violet-300/40 px-5 py-2 text-sm font-black uppercase tracking-[0.12em] text-violet-200 transition-colors hover:border-violet-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300"
          >
            Read all FAQs
          </Link>
        </div>
      </section>

      <nav
        aria-label="About Emoggle"
        className="border-t border-white/10 bg-zinc-950 px-5 py-8"
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 text-sm text-zinc-400">
          <span className="font-black text-white">Emoggle</span>
          <Link className="hover:text-white" href="/how-it-works">
            How it works
          </Link>
          <Link className="hover:text-white" href="/about">
            About
          </Link>
          <Link className="hover:text-white" href="/faq">
            FAQ
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
        </div>
      </nav>
    </main>
  );
}
