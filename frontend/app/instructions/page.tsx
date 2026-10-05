import type { Metadata } from "next";
import type { ReactNode } from "react";
import InfoPageShell from "../components/InfoPageShell";

export const metadata: Metadata = {
  title: "Instructions: What Every Button Does",
  description:
    "A quick guide to Emoggle's controls: Skip emoji vs. Skip player, chat, mic, FaceSync, the search screen, and private 1v1 rooms.",
  alternates: {
    canonical: "/instructions",
  },
  openGraph: {
    url: "/instructions",
  },
};

/* Static look-alikes of the real controls. They are spans, not
   buttons, so nobody tries to tap them on this page. */

function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "yellow" | "purple" | "round" }) {
  const tones = {
    plain: "rounded-2xl bg-[var(--off-white)] text-[var(--charcoal)]",
    yellow: "rounded-xl on-accent bg-[var(--yellow)] text-[var(--ink)]",
    purple: "rounded-full on-accent-inverse bg-[var(--purple)] text-white",
    round: "h-9 w-9 justify-center rounded-full bg-[var(--off-white)] px-0 text-[var(--charcoal)]",
  } as const;
  return (
    <span
      aria-hidden
      className={`inline-flex min-h-9 flex-none items-center whitespace-nowrap border-[3px] border-[var(--charcoal)] px-3 text-xs font-extrabold uppercase tracking-[0.12em] shadow-[3px_3px_0_0_var(--charcoal)] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function Marker({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border-[2px] border-[var(--charcoal)] on-accent bg-[var(--pink)] font-mono text-[11px] font-black text-[var(--ink)]"
    >
      {n}
    </span>
  );
}

function Control({
  chip,
  name,
  marker,
  children,
}: {
  chip: ReactNode;
  name: string;
  marker?: number;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border-[3px] border-[var(--charcoal)] bg-[var(--off-white-2)] p-4 shadow-[4px_4px_0_0_var(--charcoal)] sm:flex-row sm:items-start sm:gap-5">
      <div className="flex items-center gap-2 sm:w-44 sm:flex-none">
        {marker !== undefined && <Marker n={marker} />}
        {chip}
      </div>
      <div className="min-w-0">
        <h3 className="font-display text-lg font-bold leading-tight text-[var(--charcoal)]">{name}</h3>
        <p className="mt-1 text-[15px] leading-7">{children}</p>
      </div>
    </div>
  );
}

/** A small phone sketch showing where the duel controls live. */
function PhoneMap() {
  return (
    <figure className="mx-auto w-full max-w-[260px]">
      <div
        aria-hidden
        className="flex aspect-[9/17] flex-col gap-2 rounded-[2rem] border-[4px] border-[var(--charcoal)] bg-[var(--off-white)] p-3 shadow-[6px_6px_0_0_var(--charcoal)]"
      >
        <div className="flex items-center justify-between border-b-[2px] border-[var(--charcoal)] pb-1.5 text-[10px] font-black">
          <span>← Emoggle</span>
          <span className="rounded-full bg-[var(--yellow)] px-1.5 text-[var(--ink)]">10s</span>
        </div>
        <div className="relative flex flex-1 flex-col gap-2">
          <div className="relative flex-1 rounded-xl border-[3px] border-[var(--purple-deep)] bg-zinc-800">
            <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1 text-[9px] font-black text-white">7.4/10</span>
            <span className="absolute bottom-1.5 right-1.5 h-5 w-5 rounded-full border-[2px] border-white/70 bg-[var(--purple)]" />
            <span className="absolute bottom-1 right-8"><Marker n={3} /></span>
          </div>
          <div className="relative flex-1 rounded-xl border-[3px] border-[var(--pink-deep)] bg-zinc-800">
            <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-1 text-[9px] font-black text-white">6.1/10</span>
          </div>
          {/* Emoji + Skip emoji float on the seam, like the real arena. */}
          <div className="absolute inset-x-0 top-1/2 flex h-0 items-center gap-1.5 pl-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-white bg-[var(--yellow)] text-lg shadow-[2px_2px_0_0_var(--charcoal)]">😜</span>
            <span className="rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--off-white)] px-1.5 py-1 text-[8px] font-black uppercase">Skip emoji</span>
            <Marker n={1} />
          </div>
        </div>
        <div className="flex h-11 flex-none items-center gap-1.5 rounded-xl border-[2px] border-[var(--charcoal)] p-1.5">
          <span className="flex h-full flex-1 items-center rounded-lg border-[2px] border-[var(--charcoal)] px-1.5 text-[8px] text-[var(--ink-muted)]">Message…</span>
          <Marker n={4} />
          <span className="flex h-full items-center rounded-lg border-[2px] border-[var(--charcoal)] bg-[var(--yellow)] px-2 text-[8px] font-black uppercase text-[var(--ink)]">Skip</span>
          <Marker n={2} />
          <span className="flex h-full items-center rounded-lg border-[2px] border-[var(--charcoal)] px-1.5 text-[10px] font-black">⋯</span>
          <Marker n={5} />
        </div>
      </div>
      <figcaption className="mt-4 text-center text-sm font-bold text-[var(--on-surface-variant)]">
        Where everything sits in a live duel on your phone.
      </figcaption>
    </figure>
  );
}

export default function InstructionsPage() {
  return (
    <InfoPageShell
      eyebrow="Buttons explained"
      title="Instructions"
      intro="There are two different Skip buttons. One swaps the emoji, the other swaps the person. Here's every control and what it does."
    >
      <section>
        <h2>The two Skip buttons</h2>
        <div className="grid items-start gap-8 md:grid-cols-[260px_1fr]">
          <PhoneMap />
          <div className="grid gap-4">
            <Control marker={1} chip={<Chip>Skip emoji</Chip>} name="Skip emoji: change the face, keep the player">
              Sits beside the emoji between the two cameras. It asks your
              opponent to swap the target emoji. The timer pauses and both
              players must agree. If you both agree, a new emoji starts a
              fresh round. You stay matched with the same person either
              way. You can ask up to 3 times per match. On a computer, this
              is the <strong>Request emoji skip</strong> button.
            </Control>
            <Control marker={2} chip={<Chip tone="yellow">Skip</Chip>} name="Skip: move on to a new player">
              Sits on the right of the chat bar at the bottom. It ends this
              match immediately and starts searching for someone new. Your
              opponent is sent back to the queue too. It isn&apos;t
              shown in private 1v1 rooms, because you&apos;re there to play
              your friend.
            </Control>
          </div>
        </div>
      </section>

      <section>
        <h2>During a live duel</h2>
        <div className="grid gap-4">
          <Control marker={3} chip={<Chip tone="purple">🎤</Chip>} name="Mic">
            Mutes or unmutes your microphone. Your camera stays on: the game
            needs to see your face to score it.
          </Control>
          <Control chip={<Chip>← Back</Chip>} name="Back">
            Top-left arrow. Leaves the game and returns to the home page.
          </Control>
          <Control marker={5} chip={<Chip tone="round">⋯</Chip>} name="More options">
            On a phone it&apos;s at the right end of the chat bar. On a
            computer it&apos;s at the top right. It opens:{" "}
            <strong>Find a new opponent</strong> (pick Duel for a new player
            in the same game, or switch to FaceSync, Celebrity Face or Solo
            practice), <strong>Report</strong> the other player,{" "}
            <strong>Support Emoggle</strong>, and <strong>Leave</strong> the
            game. The menu also links to How it works.
          </Control>
          <Control chip={<Chip tone="purple">Agree to skip</Chip>} name="Agree to skip / Keep emoji">
            Appears for both players after someone presses{" "}
            <strong>Skip emoji</strong>, including the one who asked. Both must
            press Agree to get a new emoji. Keep emoji, or letting the
            countdown run out, keeps the current one.
          </Control>
        </div>
      </section>

      <section>
        <h2>The chat bar</h2>
        <div className="grid gap-4">
          <Control marker={4} chip={<Chip>Message…</Chip>} name="Open chat">
            Tap the message field at the bottom to open the full chat. It
            shows the latest message, and when your opponent is typing.
            Chat lasts only for this match: nothing is saved.
          </Control>
          <Control chip={<Chip tone="round">⚑</Chip>} name="Report">
            The flag in the open chat reports the other player for review.
            They aren&apos;t told, and you can keep playing.
          </Control>
          <Control chip={<Chip tone="round">⌄</Chip>} name="Minimize">
            Folds the chat back into the bar so both cameras are visible
            again.
          </Control>
        </div>
      </section>

      <section>
        <h2>FaceSync</h2>
        <p>
          FaceSync measures how much you and a stranger look alike. There is
          no emoji, so there is no Skip emoji button.
        </p>
        <div className="mt-4 grid gap-4">
          <Control chip={<Chip tone="yellow">Skip</Chip>} name="Skip">
            Same as in the duel: the button on the right of the chat bar
            moves you to a new stranger. The ⋯ menu works the same way too. On a computer, a{" "}
            <strong>Next stranger</strong> button appears below the chat once
            your result is in.
          </Control>
        </div>
      </section>

      <section>
        <h2>While searching for a player</h2>
        <div className="grid gap-4">
          <Control chip={<Chip>Stop searching</Chip>} name="Stop searching">
            Pauses matchmaking but keeps you on the game screen. Press{" "}
            <strong>Start searching</strong> to look again.
          </Control>
          <Control chip={<Chip tone="yellow">Try again</Chip>} name="Try again / Try camera again">
            Shown when the connection fails or the camera is blocked. Allow
            camera access in your browser first, then press it.
          </Control>
          <Control chip={<Chip>Back</Chip>} name="Back">
            Cancels the search and returns home.
          </Control>
        </div>
      </section>

      <section>
        <h2>Private 1v1 rooms</h2>
        <div className="grid gap-4">
          <Control chip={<Chip tone="purple">I&apos;m ready</Chip>} name="I'm ready / Ready for next round">
            Each round starts only when both friends have pressed ready.
          </Control>
        </div>
        <p className="mt-4">
          Skip emoji works the same here, but there is no Skip player button.
          Use <strong>Leave 1v1</strong> or Back to leave the room.
        </p>
      </section>
    </InfoPageShell>
  );
}
