"use client";

import { useEffect, useState } from "react";
import styles from "./HeroPreview.module.css";
import { motion } from "framer-motion";
import { usePlayerName } from "../context/PlayerNameContext";
import { useCountry } from "../context/CountryContext";
import { SupportModal } from "./SupportModal";
import { ScrollReveal } from "./home/EmojiMotion";
import {
  GooeyBlock,
  Headline,
  PulseDot,
  RotateBlock,
  TypewriterBlock,
} from "./home/HeadlineMotion";
import {
  Button,
  EmojiPromptMotion,
  WebEmoji,
  Logo,
  Pill,
  ThemeToggle,
  Camera,
  Edit,
  User,
  cn,
} from "../ui";
import { ChooseGameMode, type GameMode } from "./ChooseGameMode";
import { NameEntryModal } from "./NameEntryModal";
interface ModeSelectProps {
  onSelect: (mode: ModeId) => void;
  supportOpen: boolean;
  onDismissSupport: () => void;
  onOpenSupport: () => void;
}

const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL ?? "http://localhost:3001";

type ModeId = "camera" | "solo" | "celebrity" | "facesync";

/* Which animation the hero's purple chip uses.

   "textrotate"  — phrases slide up and out of the chip character by
                   character while the next slides in, and the chip resizes
                   to fit (components/ui/text-rotate.tsx).
   "gooey"       — phrases blur and bleed into one another through an SVG
                   threshold filter (components/ui/gooey-text-morphing.tsx).
   "typewriter"  — the original design: one phrase typed out character by
                   character with a blinking caret.

   All three paths are live code. Flip this constant to switch the hero;
   nothing else needs to change, and every block stays exported from
   home/HeadlineMotion either way. */
const HERO_CHIP_ANIMATION: "textrotate" | "gooey" | "typewriter" = "typewriter";

/* The second line of the hero headline, in two halves.

   "textrotate" keeps the first half still and rotates only the second, so
   just the closing word wears the purple chip. "gooey" and "typewriter"
   animate the line as one phrase, so they take the halves already joined.
   Both are derived from the same two constants — edit the copy here and
   every variant follows.

   Module-level so the arrays keep their identity across renders: a fresh
   array each render would restart the animation. "Make friends." stays
   first, since that is the phrase that ships in the server-rendered <h1>
   for crawlers and screen readers. */
const HERO_CHIP_STATIC_WORD = "Make";
const HERO_CHIP_ROTATING_WORDS = ["friends.", "faces.", "chaos."];
const HERO_CHIP_PHRASES = HERO_CHIP_ROTATING_WORDS.map(
  (word) => `${HERO_CHIP_STATIC_WORD} ${word}`
);

/* Font size and top margin for that whole line. Separate from the sticker
   below because the rotating variant puts the static word outside the chip,
   and both halves have to be sized as one line. */
const HERO_CHIP_LINE_CLASSNAME = "mt-2 text-[0.82em] sm:mt-3 sm:text-[1em]";

/* The chip itself: purple sticker, hard offset shadow, tilted a couple of
   degrees off true. */
const HERO_CHIP_STICKER_CLASSNAME =
  "inline-block whitespace-nowrap rotate-[-2deg] rounded-2xl border-[3px] border-[var(--ink-shadow)] on-accent-inverse bg-[var(--purple)] px-3 py-1 text-[var(--ink)] shadow-[6px_6px_0_0_var(--ink-shadow)] sm:px-5 sm:py-2";

/* The two joined, for the variants that put the whole phrase in one chip. */
const HERO_CHIP_CLASSNAME = `${HERO_CHIP_LINE_CLASSNAME} ${HERO_CHIP_STICKER_CLASSNAME}`;

interface ModeCard {
  id: ModeId;
  number: string;
  /** Background fill tone for the card */
  fill: "yellow" | "purple" | "pink";
  /** Glyph emoji in the card circle */
  glyph: string;
  /** Slight rotation for the scattered-on-a-table look */
  tilt: "tilt-l-1" | "tilt-l-2" | "tilt-0" | "tilt-r-1" | "tilt-r-2";
  title: string;
  description: string;
  badge: string;
}

const MODES: ModeCard[] = [
  {
    id: "camera",
    number: "1",
    fill: "purple",
    glyph: "😎",
    tilt: "tilt-l-1",
    title: "Match a stranger",
    description:
      "Hit play and instantly connect with another player ready for some squishy face action.",
    badge: "Live",
  },
  {
    id: "solo",
    number: "2",
    fill: "yellow",
    glyph: "🤪",
    tilt: "tilt-r-1",
    title: "Mimic the emoji",
    description:
      "An emoji pops up. You have 3 seconds to make the exact same face into your camera.",
    badge: "Solo",
  },
  {
    id: "celebrity",
    number: "3",
    fill: "pink",
    glyph: "🏆",
    tilt: "tilt-l-2",
    title: "Win points",
    description:
      "Our highly inaccurate AI judges who did it better. Rack up points and climb the leaderboard. Free to play.",
    badge: "Free to play",
  },
];

const fillClasses: Record<ModeCard["fill"], string> = {
  yellow: "on-accent bg-[var(--yellow)]",
  purple: "on-accent-inverse bg-[var(--purple)] text-[var(--ink)]",
  pink: "on-accent bg-[var(--pink)]",
};

export default function ModeSelect({ onSelect, supportOpen, onDismissSupport, onOpenSupport }: ModeSelectProps) {
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  // True when the "Play now" CTA has opened the mode picker.
  // Lives in ModeSelect (not in the parent) so the home page
  // never unmounts while the modal is open — opening the modal
  // should feel like a stack push, not a route change.
  const [modePickerOpen, setModePickerOpen] = useState(false);
  // True while the first-time "what's your name?" modal is on
  // screen. Set automatically on mount if no name is stored, and
  // re-set by any mode-pick attempt that races ahead of the gate.
  const [nameModalOpen, setNameModalOpen] = useState(false);
  // The first-time gate is "required" — the user can't dismiss it
  // without picking a name. After a name exists, the same modal is
  // re-used in non-required mode for the "edit name" flow.
  const [nameModalRequired, setNameModalRequired] = useState(true);
  // Tracks the next mode the user tried to pick while the name
  // modal was open, so we can advance to the right picker once
  // the modal closes successfully.
  const [pendingMode, setPendingMode] = useState<GameMode | null>(null);

  const { name, isHydrated: isNameHydrated, save: saveName } = usePlayerName();
  const { country } = useCountry();

  useEffect(() => {
    let cancelled = false;
    const fetchCount = async () => {
      try {
        const res = await fetch(`${SIGNALING_URL}/online`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.count === "number") {
          setOnlineCount(data.count);
        }
      } catch {
        /* server may be offline */
      }
    };
    fetchCount();
    const interval = setInterval(fetchCount, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Auto-open the first-time name modal once the storage has been
  // read. We deliberately wait for `isNameHydrated` so we don't
  // briefly flash the homepage and then slap a modal on top of
  // it for returning users.
  useEffect(() => {
    if (!isNameHydrated || supportOpen) return;
    if (name) return;
    if (nameModalOpen) return;
    const timer = window.setTimeout(() => {
      setNameModalRequired(true);
      setNameModalOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isNameHydrated, name, nameModalOpen, supportOpen]);

  // Wrap `handleSelect` so the gate kicks in before any mode pick.
  // If the user doesn't have a name, we open the modal in
  // required mode and stash the chosen mode for after submit.
  const requestMode = (mode: GameMode) => {
    if (!name) {
      setPendingMode(mode);
      setNameModalRequired(true);
      setNameModalOpen(true);
      return;
    }
    proceedToMode(mode);
  };

  const handleSelect = (mode: ModeId) => {
    requestMode(mode);
  };

  // The mode picker modal calls this with the chosen mode id.
  const handleModalSelect = (mode: GameMode) => {
    setModePickerOpen(false);
    requestMode(mode);
  };

  /** Actually transition into a mode — separated from the gate
   *  wrapper so we can call it both from the click handler and
   *  from the post-modal-success path. */
  const proceedToMode = (mode: GameMode) => onSelect(mode);

  const handleNameSubmit = (next: string) => {
    saveName(next);
    setNameModalOpen(false);
    // If the user was trying to pick a mode while the modal was
    // up, continue that flow now that the gate is satisfied.
    if (pendingMode) {
      const target = pendingMode;
      setPendingMode(null);
      proceedToMode(target);
    }
  };

  const handleEditName = () => {
    setNameModalRequired(false);
    setNameModalOpen(true);
  };

  const handleNameModalCancel = () => {
    if (nameModalRequired) return; // first-time gate has no cancel
    setNameModalOpen(false);
    setPendingMode(null);
  };

  // No background fill on the wrapper: the page-level DoodleBackdrop
  // paints the canvas and its two drifting doodle lanes behind this
  // whole screen, and an opaque fill here would hide them.
  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1200px] flex-col px-4 py-6 sm:px-8 sm:py-10">
        {/* Top bar — chunky charcoal underline.
            One wrapping flex row whose items are re-ordered per
            breakpoint, so each control stays a single DOM node rather
            than a mobile copy plus a desktop copy.

              phone   row 1: logo · theme toggle
                      row 2: name capsule · online capsule
              sm+     one nowrap row:
                      logo · name · [links from md] · online · toggle

            On a 375px screen the four items do not fit side by side —
            the online capsule used to land on top of the name capsule
            and cover its edit pencil — so the two capsules get a row
            of their own underneath the wordmark. */}
        <header className="border-b-[3px] border-[var(--charcoal)]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 pb-3 sm:flex-nowrap sm:gap-x-4 sm:pb-5">
            <Logo size="md" className="order-1 shrink-0" />

            {/* Ends the logo row on phones, ends the whole bar from sm
                up. `ml-auto` only applies on mobile, where it is the
                sole other item on row 1; from sm up the spacer below
                does the pushing instead. */}
            <ThemeToggle
              size="sm"
              className="order-2 ml-auto shrink-0 sm:order-6 sm:ml-0"
            />

            {/* Zero-height, full-width flex item: the line break that
                drops the capsules below the logo on phones. Rendered
                only when there is a capsule to drop, so an anonymous
                user with the signaling server down doesn't get an
                empty second row's worth of gap. */}
            {(onlineCount !== null || (isNameHydrated && name)) && (
              <span aria-hidden className="order-3 h-0 basis-full sm:hidden" />
            )}

            {isNameHydrated && name && (
              <button
                type="button"
                onClick={handleEditName}
                aria-label="Edit your name"
                title="Edit your name"
                className="order-4 inline-flex h-7 min-w-0 max-w-[60%] shrink items-center gap-1.5 rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--off-white-2)] px-2.5 text-[11px] font-bold text-[var(--charcoal)] shadow-[2px_2px_0_0_var(--charcoal)] transition-transform active:translate-y-0.5 active:shadow-none sm:order-2 sm:h-auto sm:max-w-[200px] sm:py-1 sm:text-xs"
              >
                <User size={12} className="shrink-0" />
                <span className="truncate">{name}</span>
                {country?.flag && (
                  <span aria-hidden className="shrink-0 text-sm leading-none">
                    {country.flag}
                  </span>
                )}
                <Edit size={12} className="shrink-0" />
              </button>
            )}

            {/* Holds the right-hand group against the right edge from
                sm up. A grow spacer rather than `ml-auto` on the first
                right-hand item, because both the links and the online
                capsule are conditional — an auto margin on either one
                leaves the group floating mid-bar when it is absent. */}
            <span aria-hidden className="hidden grow sm:order-3 sm:block" />

            {/* The text links only appear from `md`. In the sm–md band
                the bar is a single nowrap row with no room for them
                beside both capsules — they used to cope by wrapping
                each label onto two lines, which made the header 24px
                taller there than at any other width. They stay
                reachable on phones through the footer nav. */}
            <nav className="order-5 hidden shrink-0 items-center gap-6 whitespace-nowrap text-sm font-bold text-[var(--charcoal)] sm:order-4 md:flex">
              <a href="/how-it-works" className="hover:underline">
                How to play
              </a>
              <a href="/history" className="hover:underline">
                History
              </a>
              <a href="/faq" className="hover:underline">
                Feedback
              </a>
            </nav>

            {onlineCount !== null && (
              <Pill
                tone="purple"
                className="order-6 h-7 shrink-0 whitespace-nowrap sm:order-5 sm:h-auto"
              >
                {/* The dot breathes on a 2.5s cycle. The "N
                    online" text next to it stays still — only
                    the dot moves, per the spec. */}
                <PulseDot className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--off-white)]" />
                {onlineCount} online
              </Pill>
            )}
          </div>
        </header>

        {/* Hero — left column on desktop with the text/CTA,
            right column with a live face-off preview that fills the screen.
            On mobile it stacks to a single column. */}
        <section className="relative grid w-full grid-cols-1 items-center gap-8 pb-10 pt-8 sm:gap-10 sm:pb-12 sm:pt-10 lg:grid-cols-[1fr_minmax(420px,1.1fr)] lg:gap-12 lg:pt-14">
          {/* Left: text + CTA */}
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 18, rotate: -8 }}
              animate={{ opacity: 1, y: 0, rotate: -3 }}
              transition={{ duration: 0.52, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex h-28 w-28 items-center justify-center rounded-[2rem] border-[4px] border-[var(--ink-shadow)] on-accent bg-[var(--yellow)] shadow-[6px_6px_0_0_var(--ink-shadow)] sm:h-40 sm:w-40 sm:shadow-[8px_8px_0_0_var(--ink-shadow)] lg:h-48 lg:w-48"
              aria-hidden
            >
              <EmojiPromptMotion
                emoji="🤪"
                className="text-6xl sm:text-8xl lg:text-9xl"
                wrapperClassName="-rotate-3"
                burstTone="purple"
              />
            </motion.div>

            <h1 className="mt-5 font-display text-[clamp(2.35rem,11.5vw,2.75rem)] font-bold leading-[1.05] tracking-tight text-[var(--charcoal)] sm:mt-8 sm:text-[clamp(2.75rem,6vw,4.5rem)] lg:mt-10">
              {/* "Match faces." — per-word reveal with a slightly
                  larger stagger than the section headlines so the
                  hero lands with more weight. Plays once on
                  mount. */}
              <Headline
                text="Match faces."
                trigger="mount"
                stagger={0.1}
              />
              <br />
              {/* The purple chip. All three animations pop the block
                  in with the same spring, so the landing stays tactile
                  whichever is active; they differ only in what happens
                  to the text afterwards. HERO_CHIP_ANIMATION at the top
                  of this file picks between them. */}
              {HERO_CHIP_ANIMATION === "textrotate" ? (
                /* Half still, half moving: "Make" holds its place in
                   headline charcoal and only the closing word rotates
                   inside the chip, sliding up and out character by
                   character, last character first, while the next
                   slides in from below. */
                <RotateBlock
                  texts={HERO_CHIP_ROTATING_WORDS}
                  staticText={HERO_CHIP_STATIC_WORD}
                  delay={0.1}
                  rotationInterval={2600}
                  lineClassName={HERO_CHIP_LINE_CLASSNAME}
                  className={HERO_CHIP_STICKER_CLASSNAME}
                />
              ) : HERO_CHIP_ANIMATION === "gooey" ? (
                /* Gooey morph: the chip cycles through
                   HERO_CHIP_PHRASES, each phrase blurring and bleeding
                   into the next. Sized to the longest phrase so it holds
                   its shape instead of resizing mid-morph. The cooldown
                   is longer than the primitive's default so each phrase
                   reads as a sentence before it dissolves. */
                <GooeyBlock
                  texts={HERO_CHIP_PHRASES}
                  label={HERO_CHIP_PHRASES[0]}
                  delay={0.1}
                  morphTime={0.9}
                  cooldownTime={1.1}
                  className={HERO_CHIP_CLASSNAME}
                />
              ) : (
                /* Original design, kept for rollback: "Make friends."
                   typed out character by character with a blinking
                   caret, at a slower cadence than the primitive's
                   default so it has time to register. */
                <TypewriterBlock
                  text="Make friends."
                  startDelay={0.3}
                  typingSpeed={90}
                  className={HERO_CHIP_CLASSNAME}
                />
              )}
            </h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.18 }}
              className="mt-4 max-w-sm text-[15px] leading-relaxed text-[var(--on-surface-variant)] sm:mt-6 sm:max-w-md sm:text-base lg:max-w-lg"
            >
              The chaotic, high-energy party game where you mimic emojis to win.
              <span className="hidden sm:inline">
                {" "}Jump in, match with strangers, and see who makes the best squishy face.
              </span>
            </motion.p>

            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.26 }}
              className="mt-5 flex w-full flex-col items-center gap-3 sm:mt-8 sm:w-auto lg:items-start"
            >
              {/* The one thing a phone visitor is here to tap, so on
                  mobile it stretches to the column instead of sitting
                  as a 160px pill in the middle of a 375px screen.
                  Capped at 320px so it keeps the sticker proportions
                  rather than becoming a banner. */}
              <Button
                size="lg"
                block
                className="max-w-[320px] sm:w-auto"
                onClick={() => setModePickerOpen(true)}
                iconLeft={<Camera size={18} />}
              >
                Play now
              </Button>
              <p className="hidden text-xs text-[var(--on-surface-variant)] sm:block">
                Webcam + a straight face you won&apos;t keep
              </p>
            </motion.div>
          </div>

          {/* Right: live face-off preview — fills the available space.
              This is the same treatment the in-game duel uses, sized for the
              landing. */}
          <HeroPreview />
        </section>

        {/* How to play — three scattered, rotated, sticker-shadowed cards */}
        <section className="relative mx-auto w-full max-w-[1100px] pb-16 sm:pb-24">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="font-display text-2xl font-bold tracking-tight text-[var(--charcoal)] sm:text-4xl">
              {/* "How to play" — per-word reveal that fires the
                  first time the user scrolls to it. The
                  Headline renders inside the underline span, so
                  the border-b sits beneath the words and tracks
                  with them as they pop in. */}
              <span className="inline-block border-b-[4px] border-[var(--charcoal)] pb-1">
                <Headline text="How to play" trigger="scroll" />
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <Pill tone="yellow">All modes are free to play</Pill>
              <button type="button" onClick={onOpenSupport} className="min-h-11 rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--off-white-2)] px-4 text-sm font-bold text-[var(--charcoal)] shadow-[2px_2px_0_0_var(--charcoal)] hover:bg-[var(--yellow)]">
                Support Emoggle
              </button>
            </div>
          </div>

          <ul className="mt-8 grid grid-cols-1 items-start gap-8 px-1 sm:mt-10 sm:grid-cols-3 sm:gap-6 sm:px-0 sm:pt-8">
            {MODES.map((mode, i) => (
              /* ScrollReveal renders as a <li> so the surrounding
                 <ol>/<ul> stays semantically valid. The small
                 delay per card creates a soft stagger so the
                 three cards ease in one after another rather
                 than all snapping in at the same tick. */
              <ScrollReveal
                as="li"
                key={mode.id}
                delay={i * 0.08}
                className={cn(
                  "flex justify-center",
                  i === 1 && "sm:translate-y-6",
                )}
              >
                <button
                  onClick={() => handleSelect(mode.id)}
                  className={cn(
                    "group relative flex w-full max-w-[320px] flex-col items-start gap-4",
                    "rounded-3xl border-[4px] border-[var(--ink-shadow)] p-4 text-left sm:p-5",
                    "shadow-[6px_6px_0_0_var(--ink-shadow)]",
                    "transition-transform duration-100",
                    "active:translate-y-1 active:shadow-[2px_2px_0_0_var(--ink-shadow)]",
                    mode.tilt,
                    fillClasses[mode.fill],
                    "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ink-shadow)]",
                  )}
                >
                  <div className="flex w-full items-start justify-between">
                    <span
                      className="flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-[var(--charcoal)] bg-[var(--off-white)] text-[var(--charcoal)] sm:h-14 sm:w-14"
                    >
                      <span className="text-2xl leading-none sm:text-3xl" aria-hidden>
                        <WebEmoji emoji={mode.glyph} />
                      </span>
                    </span>
                    <span className="font-display text-3xl font-bold leading-none text-[var(--ink-soft)]">
                      {mode.number}
                    </span>
                  </div>

                  <div className="flex-1">
                    <h3 className="font-display text-lg font-bold tracking-tight text-[var(--ink)]">
                      <Headline text={mode.title} trigger="scroll" />
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-muted)]">
                      {mode.description}
                    </p>
                  </div>

                  <div className="flex w-full items-center justify-between text-xs font-bold text-[var(--ink-muted)]">
                    <span className="uppercase tracking-[0.18em]">{mode.badge}</span>
                    {/* Reveal-on-hover is a pointer affordance — a
                        touch device never fires it, so on phones the
                        card's only "this is tappable" cue was the
                        press-squash you get after committing. Shown
                        outright below sm; still a hover reveal on
                        pointer-sized screens. */}
                    <span className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                      Play →
                    </span>
                  </div>
                </button>
              </ScrollReveal>
            ))}
          </ul>

        </section>

      </div>

      {/* Mode picker — opened by the "Play now" CTA. Lives at
          the end of the tree so its portal-like fixed overlay
          sits on top of every other element on the home page. */}
      <ChooseGameMode
        open={modePickerOpen}
        onClose={() => setModePickerOpen(false)}
        onSelect={handleModalSelect}
      />

      <SupportModal open={supportOpen} onClose={onDismissSupport} />

      {/* Name entry — first-time gate or "edit name" affordance.
          Required mode for the first-time flow so the user can't
          dismiss without picking a name; non-required for the
          edit affordance. Mounted last so the z-index sits on
          top of every other element. */}
      <NameEntryModal
        open={nameModalOpen}
        currentName={name}
        required={nameModalRequired}
        onSubmit={handleNameSubmit}
        onCancel={handleNameModalCancel}
      />
    </div>
  );
}

/** Decorative landing preview; game state and controls live elsewhere. */
function HeroPreview() {
  return (
    <div className={styles.preview}>
      <span className={styles.sunburst} aria-hidden="true"><i /><i /><i /></span>
      <div className={styles.cards}>
        <PreviewColumn seat="a" score={84} interest="travel" src="/preview-faces/violet.webp" alt="A young woman with a playful expression." />
        <div className={styles.connector} aria-hidden="true">
          <svg className={styles.rays} viewBox="0 0 80 180" fill="none">
            <path d="M39 8 L40 37 M19 29 L25 41 M60 25 L54 40 M25 139 L19 154 M40 143 L41 167 M55 139 L62 151" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <div className={styles.emoji}><WebEmoji emoji="😜" /></div>
        </div>
        <PreviewColumn seat="b" score={71} interest="music" src="/preview-faces/pink.webp" alt="A young man mimicking a playful emoji expression." />
      </div>
    </div>
  );
}

function PreviewColumn({ seat, score, interest, src, alt }: {
  seat: "a" | "b";
  score: number;
  interest: string;
  src: string;
  alt: string;
}) {
  return (
    <div className={cn(styles.card, seat === "a" ? styles.left : styles.right)}>
      <span className={styles.badge}>Matched!</span>
      <div className={styles.photo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} width={720} height={900} loading="eager" decoding="async" />
        <svg className={styles.cameraMark} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="6" stroke="currentColor" strokeWidth="2.5" />
          <path d="M9 12a3 3 0 0 0 6 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="9" cy="9" r="1" fill="currentColor" /><circle cx="15" cy="9" r="1" fill="currentColor" />
        </svg>
      </div>
      <div className={styles.caption}>
        <span>You both like {interest}</span>
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21S2 15 2 8.5C2 3 9 1.5 12 6c3-4.5 10-3 10 2.5C22 15 12 21 12 21Z" /></svg>
      </div>
      <div className={styles.score}>
        <div className={styles.scoreLabel}><span>Score</span><strong>{score}%</strong></div>
        <div className={styles.scoreTrack} aria-hidden="true">
          <div className={styles.scoreFill} style={{ width: `${score}%` }} />
        </div>
      </div>
    </div>
  );
}
