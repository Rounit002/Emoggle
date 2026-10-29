import type { Metadata } from "next";
import Link from "next/link";
import InfoPageShell from "../components/InfoPageShell";
import PlayCta from "../components/PlayCta";

export const metadata: Metadata = {
  title: "The Emoji Face Challenge: Copy the Emoji, Get Scored",
  description:
    "How the emoji face challenge works, how to play it online with a webcam, and tips for copying emoji expressions well enough to win.",
  alternates: { canonical: "/emoji-face-challenge" },
  openGraph: { url: "/emoji-face-challenge" },
};

export default function EmojiFaceChallengePage() {
  return (
    <InfoPageShell
      eyebrow="Guide"
      title="The emoji face challenge"
      intro="Someone shows you an emoji and you copy it with your face. Whoever looks most like the emoji wins. Here is how to play it online, with a real score instead of an argument."
    >
      <section>
        <h2>What is the emoji face challenge?</h2>
        <p>
          The emoji face challenge is a simple party game. A player is shown
          an emoji, such as 😱, 😜 or 🤨, and has a few seconds to make the
          same face. At a party the group decides who did it best. On video
          apps people film themselves copying a run of emoji and post the
          results.
        </p>
        <p>
          The weak point has always been judging. Friends argue, and nobody
          agrees whether a squint counts as a wink. Emoggle replaces the
          judges with face-landmark scoring that runs in your browser, so
          every attempt gets the same score out of 10 by the same rules.
        </p>
      </section>

      <section>
        <h2>How to play the emoji face challenge online</h2>
        <ol>
          <li>Open Emoggle on a phone or computer with a camera. There is nothing to install.</li>
          <li>Pick a mode: a live duel against a random player, a private 1v1 room with a friend, or Solo Emoji Scan on your own.</li>
          <li>Allow camera access when your browser asks.</li>
          <li>An emoji appears. Copy it before the round timer runs out.</li>
          <li>Your expression is scored. In a duel, the closer match wins the round.</li>
        </ol>
        <p>
          The <Link href="/instructions">instructions page</Link> explains
          every button, including how to swap an emoji you both dislike.
        </p>
      </section>

      <section>
        <h2>Ways to play</h2>
        <ul>
          <li>
            <strong>Against a stranger.</strong> Live Face Duel matches you
            with another player online. You both get the same emoji, so the
            result is a straight comparison.
          </li>
          <li>
            <strong>Against a friend.</strong> Create a private 1v1 room,
            choose the number of rounds, and share the room code.
          </li>
          <li>
            <strong>On your own.</strong> Solo Emoji Scan gives you an
            instant score with no waiting, which is good for practice.
          </li>
          <li>
            <strong>As a group.</strong> Take turns on one laptop and keep a
            tally of solo scores, or put the game on a shared screen during
            a video call.
          </li>
        </ul>
      </section>

      <section>
        <h2>Tips for a higher score</h2>
        <ul>
          <li>Face the camera straight on with your whole face in frame.</li>
          <li>Use soft light from in front of you. A bright window behind you hides your features.</li>
          <li>Exaggerate. Emoji are cartoons, so a small smile scores lower than a huge one.</li>
          <li>Work out which features the emoji is about: mouth, eyes or eyebrows. Get those right first.</li>
          <li>Hold the face still for a moment. Moving while you are scored blurs the result.</li>
        </ul>
        <p>
          Some emoji are much harder than others. The guide to the{" "}
          <Link href="/hardest-emoji-faces">hardest emoji faces to copy</Link>{" "}
          breaks down the tricky ones.
        </p>
      </section>

      <section>
        <h2>Is it safe to play with strangers?</h2>
        <p>
          The game scores expressions, not looks. Expression analysis runs
          in your browser, and video goes directly between the two matched
          players. You can skip a player at any time, and the chat has a
          report button. The <Link href="/privacy">privacy policy</Link> has
          the details. If you would rather not meet strangers, a private
          room or solo mode gives you the same challenge.
        </p>
      </section>

      <PlayCta heading="Take the emoji face challenge" />
    </InfoPageShell>
  );
}
