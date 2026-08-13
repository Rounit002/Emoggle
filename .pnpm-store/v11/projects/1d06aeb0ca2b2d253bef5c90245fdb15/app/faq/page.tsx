import type { Metadata } from "next";
import InfoPageShell from "../components/InfoPageShell";
import { frequentlyAskedQuestions } from "../lib/site";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description:
    "Answers about Emoggle's cost, webcam access, solo mode, multiplayer duels, expression scoring, and face data.",
  alternates: {
    canonical: "/faq",
  },
  openGraph: {
    url: "/faq",
  },
};

export default function FaqPage() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: frequentlyAskedQuestions.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqSchema).replace(/</g, "\\u003c"),
        }}
      />
      <InfoPageShell
        eyebrow="Product facts"
        title="Frequently asked questions"
        intro="Straight answers about playing Emoggle, webcam requirements, scoring, and privacy."
      >
        <div className="divide-y divide-white/10 rounded-3xl border border-white/10 bg-white/[0.03] px-6 sm:px-8">
          {frequentlyAskedQuestions.map((item) => (
            <section key={item.question} className="py-7">
              <h2 className="mt-0 text-xl">{item.question}</h2>
              <p className="mb-0">{item.answer}</p>
            </section>
          ))}
        </div>
      </InfoPageShell>
    </>
  );
}

