import type { Metadata } from "next";
import InfoPageShell from "../components/InfoPageShell";
import { siteConfig } from "../lib/site";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The rules for playing Emoggle and making optional support payments.",
  alternates: { canonical: "/terms" },
  openGraph: { url: "/terms" },
};

export default function TermsPage() {
  return (
    <InfoPageShell
      eyebrow="The ground rules"
      title="Terms of Use"
      intro="Emoggle is a free webcam game. These terms explain what to expect when you play or choose to support the site."
    >
      <p>Effective September 26, 2026. Emoggle operates this website. By using it, you agree to these terms.</p>

      <section>
        <h2>Who can play</h2>
        <p>
          You must be at least 13 years old and meet any higher minimum age required where
          you live. If you are a minor, use Emoggle only with your parent or guardian’s
          permission. You are responsible for anyone you allow to use your browser session.
        </p>
      </section>

      <section>
        <h2>Live play and acceptable use</h2>
        <p>
          Live modes connect you with another player and may share your camera, microphone,
          display name, and chat messages with that player during the match. Only enable
          your camera and microphone if everyone who may appear or be heard has agreed.
          You can leave a match or revoke browser permissions at any time.
        </p>
        <p>
          Do not harass or threaten players, share sexual or illegal content, impersonate
          others, use a name or chat message that abuses someone, or try to disrupt or
          exploit the game. Do not record or redistribute another player’s video or audio
          without their permission. We may restrict access when needed to protect players
          or the service. Use the in-game report control to flag misconduct.
        </p>
      </section>

      <section>
        <h2>Scores and availability</h2>
        <p>
          Expression and FaceSync scores are for entertainment. They do not verify identity,
          measure health, or make a factual judgment about appearance. Scoring and matching
          can be imperfect. We may change or interrupt features, including for maintenance
          or safety, and cannot promise uninterrupted access.
        </p>
      </section>

      <section>
        <h2>Optional support payments</h2>
        <p>
          Every game mode is free. If you choose “Support this site,” you enter a one-time
          USD amount of at least $1 before being sent to Dodo Payments for checkout. A
          payment does not buy game access, a subscription, or a competitive advantage.
          Review the final amount and Dodo’s checkout terms before paying. Our
          <a href="/refund"> refund policy</a> explains how to request help with a charge.
        </p>
      </section>

      <section>
        <h2>Content and intellectual property</h2>
        <p>
          Emoggle’s original design, code, and branding belong to Emoggle or their
          respective owners. You keep rights in content you share during play. You allow
          us to transmit that content as needed for the live session and to handle reports.
          Do not copy or misuse the service or another person’s content in violation of
          their rights.
        </p>
      </section>

      <section>
        <h2>Responsibility and changes</h2>
        <p>
          Use of a live service involves other people and technical limitations. To the
          extent permitted by applicable law, Emoggle is provided as available, and we
          are not responsible for indirect losses arising from use of the service. Nothing
          here limits rights that cannot legally be excluded. We may update these terms;
          the effective date on this page will show when the current version began.
        </p>
      </section>

      <section>
        <h2>Questions</h2>
        <p>
          Email <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a> or
          visit our <a href="/contact">Contact page</a>. Our <a href="/privacy">Privacy Policy</a>
          explains how information is handled.
        </p>
      </section>
    </InfoPageShell>
  );
}
