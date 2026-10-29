import type { Metadata } from "next";
import Link from "next/link";
import InfoPageShell from "../components/InfoPageShell";
import PlayCta from "../components/PlayCta";

export const metadata: Metadata = {
  title: "Facial Expression Game Online: Free Webcam Play",
  description:
    "Play a free facial expression game in your browser. Your webcam reads your expression and scores how well it matches an emoji, solo or against another player.",
  alternates: { canonical: "/facial-expression-game" },
  openGraph: { url: "/facial-expression-game" },
};

export default function FacialExpressionGamePage() {
  return (
    <InfoPageShell
      eyebrow="Guide"
      title="A facial expression game you play with your webcam"
      intro="Most games use a keyboard or a controller. In Emoggle, your face is the controller: your camera reads your expression and scores it against an emoji."
    >
      <section>
        <h2>What makes a facial expression game</h2>
        <p>
          A facial expression game asks you to make a face on purpose and
          measures how well you did it. Older versions needed a special
          camera or an app. Today a normal webcam and a modern browser are
          enough, because face tracking can run on the device itself.
        </p>
        <p>
          Emoggle uses this to turn emoji into targets. The game shows an
          emoji, you copy it, and the game compares your face with the
          target. The score is a game score: it measures expression, not
          identity, mood or appearance.
        </p>
      </section>

      <section>
        <h2>How the expression is measured</h2>
        <p>
          Emoggle uses MediaPipe face-landmark detection in the browser. It
          finds points around your mouth, eyes, eyebrows and jaw, and works
          out signals such as how open your mouth is, whether you are
          smiling, how wide your eyes are and where your eyebrows sit. Those
          signals are compared with the shape of the current emoji to give
          a score out of 10.
        </p>
        <p>
          This analysis runs on your own device, so frames are not uploaded
          to be scored. The <Link href="/how-it-works">how it works page</Link>{" "}
          goes into more detail.
        </p>
      </section>

      <section>
        <h2>Game modes</h2>
        <ul>
          <li>
            <strong>Live Face Duel:</strong> you and a random player get the
            same emoji, and the closer expression wins the round.
          </li>
          <li>
            <strong>Private 1v1:</strong> the same duel with a friend, joined
            through a room code.
          </li>
          <li>
            <strong>Solo Emoji Scan:</strong> practise alone and get an instant
            score.
          </li>
          <li>
            <strong>Celebrity Face:</strong> copy a famous expression instead
            of an emoji.
          </li>
          <li>
            <strong>FaceSync:</strong> no emoji at all. It measures how much
            you and a stranger look alike.
          </li>
        </ul>
      </section>

      <section>
        <h2>What you need</h2>
        <ul>
          <li>A phone, tablet or computer with a front camera.</li>
          <li>A current browser such as Chrome, Edge, Safari or Firefox.</li>
          <li>Permission to use the camera (and the microphone for live duels).</li>
          <li>Decent light on your face.</li>
        </ul>
        <p>
          It is free, with no account or download needed to start. See the{" "}
          <Link href="/faq">FAQ</Link> for common questions.
        </p>
      </section>

      <section>
        <h2>Who it is for</h2>
        <p>
          The game is quick enough to play for one round and silly enough
          to keep a group laughing. People use it to warm up a video call,
          to challenge a friend, or to test how far they can stretch their
          face. Teachers and drama groups sometimes use expression games to
          practise showing emotions clearly, and solo mode suits that well.
        </p>
      </section>

      <PlayCta heading="Play the facial expression game" />
    </InfoPageShell>
  );
}
