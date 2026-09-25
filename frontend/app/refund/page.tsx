import type { Metadata } from "next";
import InfoPageShell from "../components/InfoPageShell";
import { siteConfig } from "../lib/site";

export const metadata: Metadata = {
  title: "Support Payment Refunds",
  description: "How to request help with an optional Emoggle support payment.",
  alternates: { canonical: "/refund" },
  openGraph: { url: "/refund" },
};

export default function RefundPage() {
  return (
    <InfoPageShell
      eyebrow="Payment help"
      title="Refunds and cancellations"
      intro="Playing Emoggle is free. This policy covers only optional one-time payments made through Support this site."
    >
      <p>Effective September 26, 2026.</p>

      <section>
        <h2>Before and after checkout</h2>
        <p>
          You can close the support form or leave checkout before paying. There is no
          subscription to cancel and no paid game access to lose. A completed support
          payment is voluntary and generally is not refundable simply because you stop
          playing. This does not affect rights you may have under applicable law.
        </p>
      </section>

      <section>
        <h2>Request a review</h2>
        <p>
          If you paid by mistake, were charged twice, see an unauthorized charge, or
          experienced a payment problem, email
          <a href={`mailto:${siteConfig.supportEmail}`}> {siteConfig.supportEmail}</a> promptly.
          Include the payment reference from your Dodo receipt, payment date, amount,
          and a short explanation. Do not send your full card number or payment password.
          We will review the request and work with Dodo Payments where a refund is
          appropriate. Any approved refund is processed through the payment provider;
          the time it takes to reach your original payment method can vary.
        </p>
      </section>

      <section>
        <h2>Questions</h2>
        <p>
          See our <a href="/contact">Contact page</a> for other support or our
          <a href="/terms"> Terms of Use</a> for the rules of the game.
        </p>
      </section>
    </InfoPageShell>
  );
}
