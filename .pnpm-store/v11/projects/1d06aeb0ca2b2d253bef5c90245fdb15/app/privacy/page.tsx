import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Emoggle collects, uses, and protects your data.",
  alternates: { canonical: "/privacy" },
  openGraph: { url: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 prose prose-zinc">
      <h1>Privacy Policy</h1>
      <p>
        Your privacy matters. This policy explains what personal data we
        collect, how we use it, and the choices you have.
      </p>

      <h2>Information We Collect</h2>
      <ul>
        <li>
          We do not ask for your name, date of birth, age, or gender, and we do
          not perform gender verification.
        </li>
        <li>Usage data such as interactions, device type, and approximate region.</li>
      </ul>

      <h2>How We Use Information</h2>
      <ul>
        <li>To provide, maintain, and improve the Emoggle experience.</li>
        <li>To enforce our Terms and ensure platform safety.</li>
      </ul>

      <h2>Data Sharing</h2>
      <p>
        We do not sell your personal information. We share data only with
        service providers as needed to operate the service or when required by
        law.
      </p>

      <h2>Data Retention</h2>
      <p>
        We retain information for as long as necessary to provide our services
        and comply with legal obligations.
      </p>

      <h2>Your Choices</h2>
      <ul>
        <li>Clear locally stored app data through your browser settings.</li>
        <li>Request support or data inquiries via our Contact page.</li>
      </ul>

      <h2>Changes</h2>
      <p>
        We may update this Privacy Policy periodically. The updated version will
        be posted here with the effective date.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about privacy? Visit our <a href="/contact">Contact</a> page.
      </p>
    </div>
  );
}
