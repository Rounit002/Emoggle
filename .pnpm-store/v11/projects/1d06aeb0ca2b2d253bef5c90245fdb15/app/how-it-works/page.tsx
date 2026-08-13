import type { Metadata } from "next";
import InfoPageShell from "../components/InfoPageShell";

export const metadata: Metadata = {
  title: "How the Emoji Face Game Works",
  description:
    "See how Emoggle matches players, detects facial expressions, scores emoji faces, and supports solo play.",
  alternates: {
    canonical: "/how-it-works",
  },
  openGraph: {
    url: "/how-it-works",
  },
};

export default function HowItWorksPage() {
  return (
    <InfoPageShell
      eyebrow="Three simple steps"
      title="How Emoggle works"
      intro="Allow camera access, copy the emoji expression, and get a score—either against another player or on your own."
    >
      <section>
        <h2>Live multiplayer mode</h2>
        <ol>
          <li>Choose Live Face Duel and allow camera and microphone access.</li>
          <li>Emoggle searches for another available player.</li>
          <li>Both players receive the same emoji expression prompt.</li>
          <li>Each player recreates the expression before the round ends.</li>
          <li>The two expression scores are compared and a round winner is shown.</li>
        </ol>
      </section>

      <section>
        <h2>Solo Emoji Scan</h2>
        <p>
          Solo mode removes matchmaking from the flow. Choose the solo option,
          copy the emoji shown on screen, and receive an instant expression
          score. It is useful for learning how the scoring reacts to smiles,
          winks, surprised faces, and other expressions.
        </p>
      </section>

      <section>
        <h2>How expression scoring works</h2>
        <p>
          Emoggle uses MediaPipe face-landmark detection in the browser. It
          measures features such as mouth shape, eye openness, eyebrow
          position, and facial geometry, then compares those signals with the
          current emoji prompt. The result is a game score, not an identity
          check or a medical assessment.
        </p>
      </section>

      <section>
        <h2>Camera and privacy basics</h2>
        <p>
          A webcam is required because the face is the main game input.
          Expression analysis runs locally in the browser. During a live duel,
          video and audio travel directly between the two players through a
          peer-to-peer WebRTC connection, while compact game events such as
          scores and round state pass through the signaling service.
        </p>
      </section>
    </InfoPageShell>
  );
}

