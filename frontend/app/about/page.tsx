import type { Metadata } from "next";
import InfoPageShell from "../components/InfoPageShell";

export const metadata: Metadata = {
  title: "About the Emoji Face-Matching Game",
  description:
    "Learn what Emoggle is, who it is for, and how its solo and live emoji face-matching modes work.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    url: "/about",
  },
};

export default function AboutPage() {
  return (
    <InfoPageShell
      eyebrow="About the game"
      title="About Emoggle"
      intro="A browser game that turns facial expressions into a quick social challenge."
    >
      <section>
        <h2>Emoggle at a glance</h2>
        <p>
          Emoggle is a browser-based social game in which players recreate
          facial expressions shown as emoji prompts. In live multiplayer mode,
          two randomly matched players see the same emoji, make the expression
          on camera, and compare scores to determine the closer match. Solo
          Emoji Scan offers the same expression challenge for one player
          without requiring a partner. Emoggle uses face-landmark analysis in
          the browser to estimate expression similarity and provide an instant
          score. Live video is shared between matched players through a
          peer-to-peer connection. The game is designed for short, casual
          sessions and runs in a modern web browser without an app download. A
          working webcam and camera permission are required for expression
          scoring.
        </p>
      </section>

      <section>
        <h2>Who it is for</h2>
        <p>
          Emoggle is for people looking for a quick webcam game, a face-mimic
          challenge, or an unusual two-player reaction game that starts in the
          browser.
        </p>
      </section>

      <section>
        <h2>What makes it different</h2>
        <ul>
          <li>The emoji is the prompt and the player&apos;s face is the controller.</li>
          <li>Players can choose a live random match or practice alone.</li>
          <li>No native app download is required.</li>
          <li>Expression scoring is based on face landmarks detected in the browser.</li>
        </ul>
      </section>
    </InfoPageShell>
  );
}

