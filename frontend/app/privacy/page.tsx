import type { Metadata } from "next";
import InfoPageShell from "../components/InfoPageShell";
import { siteConfig } from "../lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Emoggle handles when you play, chat, or support the site.",
  alternates: { canonical: "/privacy" },
  openGraph: { url: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <InfoPageShell
      eyebrow="Your data"
      title="Privacy Policy"
      intro="This page describes the information Emoggle uses to run the game, connect players, and process optional support payments."
    >
      <p>Effective September 26, 2026. Emoggle operates this site. Contact us at <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>.</p>

      <section>
        <h2>Information we handle</h2>
        <ul>
          <li><strong>Profile and game activity:</strong> your chosen display name, anonymous account and device identifiers, session tokens, match participation, scores, and reports about players. The display name is stored with an anonymous Supabase profile; match and report records are stored by the signaling service.</li>
          <li><strong>On your device:</strong> recent solo and duel history, display name cache, country flag cache, theme preference, and session information are stored in browser storage so the game can remember them.</li>
          <li><strong>Technical data:</strong> our hosting and signaling services receive ordinary connection information such as IP address and browser requests. The site also asks an IP geolocation provider for an approximate country to show a flag. That provider receives your public IP address.</li>
          <li><strong>Support payments:</strong> if you start checkout, Dodo Payments receives the amount and any payment details you provide there. We receive a payment reference, amount, currency, status, and an anonymous device identifier through its webhook. We do not collect your card number on Emoggle.</li>
        </ul>
      </section>

      <section>
        <h2>Camera, microphone, chat, and face data</h2>
        <p>
          Your browser asks permission before using your camera or microphone. Expression
          detection runs in your browser. In live modes, video and audio travel through
          a peer connection to the matched player, while the signaling server handles
          match events and scores. Network relay services may carry the connection when
          a direct path is unavailable.
        </p>
        <p>
          FaceSync sends a compact facial-geometry comparison vector to the signaling
          server for the current round. That vector is held for the match calculation,
          not written to the game database. Live chat is relayed to the other player
          during the session; the game does not keep a chat history. We do not use
          camera images to train face-recognition models.
        </p>
      </section>

      <section>
        <h2>Why we use it and who sees it</h2>
        <p>
          We use this information to identify your browser session, save your chosen
          name, match players, calculate scores, handle reports, prevent abuse, answer
          support requests, and reconcile payments. Matched players can see what you
          choose to share during a live match. We use service providers for hosting,
          anonymous profiles (Supabase), approximate country lookup, and payments
          (Dodo Payments). Those providers may process information in other countries.
          We do not sell your personal information.
        </p>
      </section>

      <section>
        <h2>How long information remains</h2>
        <p>
          Browser history and preferences remain until you clear them or your browser
          removes them. Signaling session tokens expire after seven days. Live chat and
          FaceSync comparison vectors are used for the session rather than saved as
          histories. Profile, match, moderation, and payment records currently have no
          fixed automatic deletion schedule; we retain them for service operation,
          safety, and transaction records until they are deleted or no longer needed.
          Some records may need to remain longer for legal or payment obligations.
        </p>
      </section>

      <section>
        <h2>Your choices</h2>
        <p>
          You can deny or revoke camera and microphone access in your browser, leave a
          match, and clear local game history from the History page. Clearing browser
          storage does not necessarily delete server records. Email
          <a href={`mailto:${siteConfig.supportEmail}`}> {siteConfig.supportEmail}</a> to ask
          about access, correction, or deletion of information associated with your
          session or payment. Please include enough detail for us to locate the record;
          we may need to verify the request first.
        </p>
      </section>

      <section>
        <h2>Children and changes</h2>
        <p>
          Emoggle is intended for people aged 13 or older, subject to a higher minimum
          age where required. We may update this policy as the game changes. The date
          above shows when the current version took effect.
        </p>
      </section>
    </InfoPageShell>
  );
}
