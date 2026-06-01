import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refunds & Cancellations - Emoggle",
  description: "Policy for refunds, cancellations, and customer support.",
};

export default function RefundPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 prose prose-zinc">
      <h1>Refunds & Cancellations</h1>
      <p>
        Emoggle VIP provides access to premium features. Because this is a
        digital service, refunds are generally not provided once a purchase is
        completed. If you experience an issue such as duplicate charges or
        unauthorized payment, please contact us promptly and we will review your
        request.
      </p>

      <h2>How to Request Support</h2>
      <p>
        Please reach out via our <a href="/contact">Contact</a> page with your
        username, approximate date/time of purchase, and any screenshots or
        order references you have. We aim to respond within a reasonable time.
      </p>

      <h2>Processing Time</h2>
      <p>
        If a refund is approved, processing time may vary based on your bank or
        payment provider.
      </p>

      <h2>Exceptions</h2>
      <p>
        We reserve the right to refuse or limit refunds in cases of abuse,
        fraud, or violations of our Terms & Conditions.
      </p>
    </div>
  );
}
