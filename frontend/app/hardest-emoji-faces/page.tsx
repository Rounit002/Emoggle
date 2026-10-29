import type { Metadata } from "next";
import Link from "next/link";
import InfoPageShell from "../components/InfoPageShell";
import PlayCta from "../components/PlayCta";

export const metadata: Metadata = {
  title: "Hardest Emoji Faces to Copy (and How to Nail Them)",
  description:
    "The emoji expressions people struggle to copy, why they are hard, and a quick technique for each one.",
  alternates: { canonical: "/hardest-emoji-faces" },
  openGraph: { url: "/hardest-emoji-faces" },
};

const faces = [
  {
    emoji: "🤨",
    name: "Face with raised eyebrow",
    why: "It needs one eyebrow up and the other level. Most people can only lift both together.",
    how: "Lift one eyebrow on its own and narrow the other eye a little. Keep your mouth flat. If one eyebrow won't move alone, hold the other down with a fingertip while you practise.",
  },
  {
    emoji: "😉",
    name: "Winking face",
    why: "A wink tends to drag the cheek and mouth with it, and the open eye often half-closes in sympathy.",
    how: "Close one eye firmly, keep the other wide open, and add a small one-sided smile.",
  },
  {
    emoji: "😜",
    name: "Winking face with tongue",
    why: "Three things at once: a wink, an open mouth and the tongue out.",
    how: "Do the wink first, then open your mouth and push your tongue out and slightly to one side.",
  },
  {
    emoji: "😱",
    name: "Face screaming in fear",
    why: "The mouth has to be a tall oval, not a wide grin, and the eyes have to be fully open.",
    how: "Drop your jaw as far as it goes, pull your lips into an O, and open your eyes as wide as you can. Hands on cheeks are optional.",
  },
  {
    emoji: "😐",
    name: "Neutral face",
    why: "It sounds easy, but people smile or tense up when they know they are being scored.",
    how: "Relax your whole face, close your lips without pressing them, and look straight at the camera.",
  },
  {
    emoji: "🙄",
    name: "Face with rolling eyes",
    why: "When you look up, your eyes are partly hidden from the camera.",
    how: "Tilt your chin slightly down while you look up, so the camera can still see your eyes. Keep your mouth flat or slightly pursed.",
  },
  {
    emoji: "😬",
    name: "Grimacing face",
    why: "It is a wide, tense mouth with teeth showing, which is easy to confuse with a smile.",
    how: "Clench your teeth, stretch your lips sideways, and keep your eyes neutral instead of happy.",
  },
  {
    emoji: "🥺",
    name: "Pleading face",
    why: "Big eyes and a small frown pull in opposite directions.",
    how: "Raise the inner corners of your eyebrows, open your eyes wide, and press your lips into a small pout.",
  },
] as const;

export default function HardestEmojiFacesPage() {
  return (
    <InfoPageShell
      eyebrow="Guide"
      title="The hardest emoji faces to copy"
      intro="Some emoji are easy wins: a big grin for 😁, a wide mouth for 😮. Others trip up almost everyone. Here are the hardest ones and how to get them right."
    >
      <section>
        <h2>Why some emoji are hard</h2>
        <p>
          Emoji are drawings, so they show expressions more strongly and
          more neatly than a real face does. The hardest ones ask for
          something faces rarely do: one side different from the other
          (winks, a single raised eyebrow), several features at once, or a
          mix of signals like happy eyes with a sad mouth. A scoring system
          that reads face landmarks notices when one part is missing.
        </p>
      </section>

      {faces.map((face) => (
        <section key={face.name}>
          <h2>
            <span aria-hidden>{face.emoji}</span> {face.name}
          </h2>
          <p>
            <strong>Why it is hard:</strong> {face.why}
          </p>
          <p>
            <strong>How to copy it:</strong> {face.how}
          </p>
        </section>
      ))}

      <section>
        <h2>General tips</h2>
        <ul>
          <li>Light your face from the front and keep it fully in frame.</li>
          <li>Exaggerate. A cartoon face needs a cartoon-sized expression.</li>
          <li>Hold the face for a second instead of moving through it.</li>
          <li>Practise the hard ones in Solo Emoji Scan before a live duel.</li>
        </ul>
        <p>
          New to the game? Start with{" "}
          <Link href="/emoji-face-challenge">how the emoji face challenge works</Link>.
        </p>
      </section>

      <PlayCta
        heading="Test yourself on the hard ones"
        text="Solo Emoji Scan scores each attempt instantly, so you can practise these faces before you take on another player."
      />
    </InfoPageShell>
  );
}
