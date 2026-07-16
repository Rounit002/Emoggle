import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions - Emoggle",
  description: "Terms and conditions for using Emoggle.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 prose prose-zinc">
      <h1>Terms & Conditions</h1>
      <p>
        Welcome to Emoggle. By accessing or using our website or creating an
        account, you agree to be bound by these Terms & Conditions.
      </p>

      <h2>Eligibility</h2>
      <p>
        You must be at least 13 years of age to use Emoggle. If you are under
        the age of majority in your jurisdiction, you must have your parent or
        legal guardian’s permission to use the service.
      </p>

      <h2>Accounts and Security</h2>
      <p>
        You are responsible for all activity under your account. Keep your
        account credentials secure and do not share them with others.
      </p>

      <h2>Acceptable Use</h2>
      <p>
        Do not upload, share, or transmit any content that is illegal, harmful,
        harassing, infringing, or otherwise objectionable. Do not attempt to
        interfere with or disrupt the service, its infrastructure, or other
        users.
      </p>

      <h2>Intellectual Property</h2>
      <p>
        All content, trademarks, and logos on Emoggle are the property of their
        respective owners and protected by applicable laws. You may not copy,
        modify, or distribute any part of the service without permission.
      </p>

      <h2>Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, Emoggle shall not be liable for
        any indirect, incidental, special, consequential, or punitive damages,
        or any loss of profits or revenues, whether incurred directly or
        indirectly.
      </p>

      <h2>Changes to These Terms</h2>
      <p>
        We may update these Terms & Conditions from time to time. The updated
        version will be posted on this page with an updated date.
      </p>

      <h2>Contact</h2>
      <p>
        Questions? Visit our <a href="/contact">Contact</a> page.
      </p>
    </div>
  );
}
