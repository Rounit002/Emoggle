import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us - Emoggle",
  description: "How to get in touch for support and inquiries.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 prose prose-zinc">
      <h1>Contact Us</h1>
      <p>
        Need help with your purchase or account? Please contact us with the
        details below. Include your username and any relevant order references
        to help us assist you faster.
      </p>

      <h2>Support</h2>
      <ul>
        <li>Email: support@example.com</li>
      </ul>

      <h2>Business</h2>
      <p>
        For business or partnership inquiries, please use the same contact
        above and include “Business” in the subject.
      </p>

      <h2>Report a Problem</h2>
      <p>
        If you believe there has been an unauthorized charge or a duplicate
        payment, please reach out immediately with as much information as
        possible so we can investigate.
      </p>
    </div>
  );
}
