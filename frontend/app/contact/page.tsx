import type { Metadata } from "next";
import InfoPageShell from "../components/InfoPageShell";
import { siteConfig } from "../lib/site";

export const metadata: Metadata = {
  title: "Contact Emoggle",
  description: "Contact Emoggle about the game, safety, privacy, or a support payment.",
  alternates: { canonical: "/contact" },
  openGraph: { url: "/contact" },
};

export default function ContactPage() {
  return (
    <InfoPageShell
      eyebrow="We’re here to help"
      title="Contact Emoggle"
      intro="Questions about playing, a support payment, or your data? Send us an email and we’ll look into it."
    >
      <section>
        <h2>Email us</h2>
        <p>
          Write to <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>.
          Tell us what happened and which part of Emoggle you were using. A browser name,
          approximate time, and screenshot of an error can help us investigate.
        </p>
      </section>

      <section>
        <h2>Support payments and refunds</h2>
        <p>
          For a checkout problem, duplicate charge, or refund request, include the payment
          reference from your receipt, the date, and the amount. Please do not email your
          full card number or other payment credentials. See our <a href="/refund">refund policy</a>.
        </p>
      </section>

      <section>
        <h2>Player safety and privacy</h2>
        <p>
          Use the in-game report control during a live match to report another player. You
          can also email us about a safety concern or ask about access to, correction of,
          or deletion of your information. Please avoid sending another player’s photo
          or video unless it is necessary to explain the issue.
        </p>
      </section>

      <section>
        <h2>Business inquiries</h2>
        <p>
          Use the same address and put “Business” in the subject so we can route your
          message appropriately.
        </p>
      </section>
    </InfoPageShell>
  );
}
