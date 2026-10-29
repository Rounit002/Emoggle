import type { Metadata } from "next";
import Link from "next/link";
import InfoPageShell from "../components/InfoPageShell";
import PlayCta from "../components/PlayCta";

export const metadata: Metadata = {
  title: "Fun Games to Play on a Video Call",
  description:
    "Easy games for a video call with friends, family or coworkers, from no-prep classics to a free emoji face game that scores everyone's expressions.",
  alternates: { canonical: "/games-to-play-on-video-call" },
  openGraph: { url: "/games-to-play-on-video-call" },
};

const games = [
  {
    name: "Emoji face-off",
    body: "Everyone opens Emoggle's Solo Emoji Scan on their own device. The host picks a moment to start, everyone copies the emoji on screen, and each player reads out their score. Play five emoji and add up the totals. Want a head-to-head final? The top two can play a private 1v1 room while the rest watch.",
  },
  {
    name: "Two truths and a lie",
    body: "Each person shares three statements about themselves and the group guesses the lie. It needs no setup and works well with people who are just getting to know each other.",
  },
  {
    name: "Guess the close-up",
    body: "Hold an everyday object very close to the camera so only a sliver is visible. The first person to guess what it is gets a point.",
  },
  {
    name: "Copy my face",
    body: "One person makes a face and everyone else copies it. Then use the emoji face game to check who actually got closest, instead of voting.",
  },
  {
    name: "Speed scavenger hunt",
    body: "Call out an item, such as something blue or a mug, and the first person to hold one up to the camera wins the round.",
  },
  {
    name: "Pictionary with paper",
    body: "Draw on paper and hold it up. No whiteboard tool needed, and bad drawings are half the fun.",
  },
] as const;

export default function GamesOnVideoCallPage() {
  return (
    <InfoPageShell
      eyebrow="Guide"
      title="Games to play on a video call"
      intro="A good video-call game starts in seconds, works on any device, and needs everyone's camera on. Here are some that do."
    >
      <section>
        <h2>What makes a good video-call game</h2>
        <ul>
          <li><strong>No installs.</strong> If it needs an app, someone always gets stuck.</li>
          <li><strong>Short rounds.</strong> A minute or less keeps everyone involved.</li>
          <li><strong>Uses the camera.</strong> Faces are why you are on video.</li>
          <li><strong>Clear scoring.</strong> Fewer arguments, more playing.</li>
        </ul>
      </section>

      {games.map((game, i) => (
        <section key={game.name}>
          <h2>
            {i + 1}. {game.name}
          </h2>
          <p>{game.body}</p>
        </section>
      ))}

      <section>
        <h2>Tips for running games on a call</h2>
        <ul>
          <li>Pick one person to host, keep score and keep things moving.</li>
          <li>Share the rules in chat before you start.</li>
          <li>For browser games, send the link before the call so people can allow camera access ahead of time.</li>
          <li>Mix camera games with talking games so nobody feels on the spot for too long.</li>
        </ul>
        <p>
          For more two-player ideas, see{" "}
          <Link href="/webcam-games-with-friends">webcam games with friends</Link>.
        </p>
      </section>

      <PlayCta
        heading="Add an emoji face-off to your next call"
        text="Send everyone the link, start Solo Emoji Scan together, and compare scores. Free, in the browser, nothing to install."
      />
    </InfoPageShell>
  );
}
