import type { Metadata } from "next";
import Link from "next/link";
import InfoPageShell from "../components/InfoPageShell";
import PlayCta from "../components/PlayCta";

export const metadata: Metadata = {
  title: "Webcam Games to Play With Friends Online",
  description:
    "Quick webcam games you can play with friends online, including a free emoji face duel that runs in the browser with a private room code.",
  alternates: { canonical: "/webcam-games-with-friends" },
  openGraph: { url: "/webcam-games-with-friends" },
};

export default function WebcamGamesWithFriendsPage() {
  return (
    <InfoPageShell
      eyebrow="Guide"
      title="Webcam games to play with friends"
      intro="Your camera can do more than video calls. These games use it as part of the play, and none of them need anything beyond a browser."
    >
      <section>
        <h2>1. Emoji face duel</h2>
        <p>
          Both players see the same emoji and copy it. Each face gets a
          score, and the closer match wins the round. In Emoggle, create a
          private 1v1 room, pick how many rounds to play, and send your
          friend the room code. Video goes directly between you, and each
          round takes seconds.
        </p>
        <p>
          It works well because nobody has to judge. The score settles it,
          and the faces people pull to win are the fun part.
        </p>
      </section>

      <section>
        <h2>2. Expression relay</h2>
        <p>
          For bigger groups: everyone plays Solo Emoji Scan on their own
          device at the same time and calls out their score after each
          emoji. Keep a tally in the group chat. The highest total after ten
          emoji wins.
        </p>
      </section>

      <section>
        <h2>3. Don&apos;t laugh</h2>
        <p>
          One person pulls faces at the camera while the other has to keep a
          straight face. Score it with the neutral emoji 😐 in solo mode. If
          the scanner sees you crack, you lose.
        </p>
      </section>

      <section>
        <h2>4. Look-alike check</h2>
        <p>
          Emoggle&apos;s FaceSync mode skips the emoji and measures how much
          two faces look alike. It is a quick ice-breaker with someone new,
          or a way to settle which of your friends looks most like a
          sibling.
        </p>
      </section>

      <section>
        <h2>5. Charades and Pictionary on camera</h2>
        <p>
          The classics still work over video. Act out a film or draw on
          paper and hold it up to the camera. They need no app, but you do
          need someone to keep score.
        </p>
      </section>

      <section>
        <h2>Setting up a game with a friend</h2>
        <ol>
          <li>Open Emoggle and choose the private 1v1 option.</li>
          <li>Pick the number of rounds and the game.</li>
          <li>Share the room code with your friend over chat or a call.</li>
          <li>Both allow camera access, and the first emoji appears.</li>
        </ol>
        <p>
          Every control is explained on the{" "}
          <Link href="/instructions">instructions page</Link>.
        </p>
      </section>

      <PlayCta
        heading="Start a game with a friend"
        text="Open a private room, share the code, and play your first round in under a minute. It is free and runs in the browser."
      />
    </InfoPageShell>
  );
}
