"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRevenueCat } from "../context/RevenueCatContext";
import {
  BlinkingEmoji,
  FloatingEmoji,
  ScrollReveal,
} from "./home/EmojiMotion";
import {
  Headline,
  PulseDot,
  TypewriterBlock,
} from "./home/HeadlineMotion";
import {
  Button,
  Logo,
  Pill,
  ThemeToggle,
  Camera,
  Mic,
  Target,
  Crown,
  Globe,
  Sparkle,
  cn,
} from "../ui";

interface ModeSelectProps {
  onSelect: (mode: "camera" | "solo" | "celebrity") => void;
}

const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL ?? "http://localhost:3001";

type ModeId = "camera" | "solo" | "celebrity";

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
      "Our highly inaccurate AI judges who did it better. Rack up points and climb the leaderboard.",
    badge: "VIP",
  },
];

const fillClasses: Record<ModeCard["fill"], string> = {
  yellow: "bg-[var(--yellow)]",
  purple: "bg-[var(--purple)] text-[var(--off-white)]",
  pink: "bg-[var(--pink)]",
};

export default function ModeSelect({ onSelect }: ModeSelectProps) {
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const {
    isAvailable: isRevenueCatAvailable,
    isLoading: isRevenueCatLoading,
    isPurchasing,
    isVIP,
    showPaywall,
    refreshCustomerInfo,
    error: revenueCatError,
  } = useRevenueCat();

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

  const handleSelect = (mode: ModeCard) => {
    if (mode.id === "celebrity") {
      if (isVIP || !isRevenueCatAvailable) {
        onSelect(mode.id);
        return;
      }
      if (isRevenueCatLoading) return;
      void showPaywall().then((unlocked) => {
        if (unlocked) onSelect(mode.id);
      });
      return;
    }
    onSelect(mode.id);
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[var(--off-white)]">
      {/* Floating decorative emojis — the spec calls for these. */}
      <DecoEmojis />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1200px] flex-col px-4 py-6 sm:px-8 sm:py-10">
        {/* Top bar — chunky charcoal underline */}
        <header className="border-b-[3px] border-[var(--charcoal)]">
          <div className="flex items-center justify-between pb-4 sm:pb-5">
            <Logo size="md" />
            <nav className="flex items-center gap-4 text-sm font-bold text-[var(--charcoal)] sm:gap-6">
              <a href="/how-it-works" className="hidden hover:underline sm:inline">
                How to play
              </a>
              <a href="/history" className="hidden hover:underline sm:inline">
                History
              </a>
              <a href="/faq" className="hidden hover:underline sm:inline">
                Feedback
              </a>
              {onlineCount !== null && (
                <Pill tone="purple">
                  {/* The dot breathes on a 2.5s cycle. The "N
                      online" text next to it stays still — only
                      the dot moves, per the spec. */}
                  <PulseDot className="h-1.5 w-1.5 rounded-full bg-[var(--off-white)]" />
                  {onlineCount} online
                </Pill>
              )}
              <ThemeToggle size="sm" />
            </nav>
          </div>
        </header>

        {/* Hero — left column on desktop with the text/CTA,
            right column with a live face-off preview that fills the screen.
            On mobile it stacks to a single column. */}
        <section className="relative grid w-full grid-cols-1 items-center gap-8 pb-10 pt-8 sm:gap-10 sm:pb-12 sm:pt-10 lg:grid-cols-[1fr_minmax(420px,1.1fr)] lg:gap-12 lg:pt-14">
          {/* Left: text + CTA */}
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <motion.div
              initial={{ scale: 0.85, opacity: 0, rotate: -3 }}
              animate={{ scale: 1, opacity: 1, rotate: -3 }}
              transition={{ type: "spring", stiffness: 280, damping: 18 }}
              className="relative flex h-28 w-28 items-center justify-center rounded-[2rem] border-[4px] border-[var(--charcoal)] bg-[var(--yellow)] shadow-[6px_6px_0_0_var(--charcoal)] sm:h-40 sm:w-40 sm:shadow-[8px_8px_0_0_var(--charcoal)] lg:h-48 lg:w-48"
              aria-hidden
            >
              {/* The hero mascot gets the "wink" personality —
                  slightly longer blink with a small squish and
                  head tilt, on a 10-15s interval so it stays
                  occasional and not constant. The outer span
                  keeps the -rotate-3 sticker tilt; the inner
                  BlinkingEmoji handles the wink animation. */}
              <span className="-rotate-3 text-6xl leading-none sm:text-8xl">
                <BlinkingEmoji
                  personality="wink"
                  intervalMin={10000}
                  intervalMax={15000}
                  blinkDuration={260}
                >
                  🤪
                </BlinkingEmoji>
              </span>
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
              {/* "Make friends." — classic typewriter on the
                  purple chip. The block still pops in (same
                  spring as before, so the landing stays tactile),
                  then the text types out character by character
                  with a blinking caret. This instance deliberately
                  uses a slower character cadence than the primitive's
                  default so "Make friends." has time to register. */}
              <TypewriterBlock
                text="Make friends."
                startDelay={0.3}
                typingSpeed={90}
                className="mt-2 inline-block rotate-[-2deg] rounded-2xl border-[3px] border-[var(--charcoal)] bg-[var(--purple)] px-3 py-1 text-[var(--off-white)] shadow-[6px_6px_0_0_var(--charcoal)] sm:mt-3 sm:px-5 sm:py-2"
              />
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
              className="mt-5 flex flex-col items-center gap-3 sm:mt-8 lg:items-start"
            >
              <Button
                size="lg"
                onClick={() => handleSelect(MODES[0])}
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
            {isVIP ? (
              <Pill tone="yellow">VIP active</Pill>
            ) : isRevenueCatAvailable ? (
              <button
                onClick={() => void showPaywall()}
                disabled={isPurchasing}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--charcoal)] underline-offset-4 hover:underline disabled:opacity-50"
              >
                <Crown size={14} />
                {isPurchasing ? "Opening checkout…" : "Unlock VIP"}
              </button>
            ) : null}
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
                  onClick={() => handleSelect(mode)}
                  disabled={mode.id === "celebrity" && isRevenueCatAvailable && isRevenueCatLoading}
                  className={cn(
                    "group relative flex w-full max-w-[320px] flex-col items-start gap-4",
                    "rounded-3xl border-[4px] border-[var(--charcoal)] p-4 text-left sm:p-5",
                    "shadow-[6px_6px_0_0_var(--charcoal)]",
                    "transition-transform duration-100",
                    "active:translate-y-1 active:shadow-[2px_2px_0_0_var(--charcoal)]",
                    mode.tilt,
                    fillClasses[mode.fill],
                    "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--charcoal)]",
                    mode.id === "celebrity" && isRevenueCatAvailable && isRevenueCatLoading && "opacity-60",
                  )}
                >
                  <div className="flex w-full items-start justify-between">
                    <span
                      className="flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-[var(--charcoal)] bg-[var(--off-white)] sm:h-14 sm:w-14"
                    >
                      {/* Card-icon emoji — plain blink on a
                          randomized 3-7s interval. Each card gets
                          its own schedule so the three icons
                          never blink in unison. */}
                      <BlinkingEmoji className="text-2xl leading-none sm:text-3xl">
                        {mode.glyph}
                      </BlinkingEmoji>
                    </span>
                    <span className="font-display text-3xl font-bold leading-none text-[var(--ink-soft)]">
                      {mode.number}
                    </span>
                  </div>

                  <div className="flex-1">
                    <h3 className="font-display text-lg font-bold tracking-tight text-[var(--charcoal)]">
                      <Headline text={mode.title} trigger="scroll" />
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-muted)]">
                      {mode.description}
                    </p>
                  </div>

                  <div className="flex w-full items-center justify-between text-xs font-bold text-[var(--ink-muted)]">
                    <span className="uppercase tracking-[0.18em]">{mode.badge}</span>
                    <span className="opacity-0 transition-opacity group-hover:opacity-100">
                      {i < 2 ? "Play →" : "Unlock →"}
                    </span>
                  </div>
                </button>
              </ScrollReveal>
            ))}
          </ul>

          {revenueCatError && (
            <p className="mt-4 text-center text-xs text-[var(--pink-deep)]">
              {revenueCatError}
            </p>
          )}

          {isRevenueCatAvailable && (
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-[var(--on-surface-variant)]">
              <button
                onClick={() => void refreshCustomerInfo()}
                disabled={isRevenueCatLoading}
                className="inline-flex items-center gap-1.5 hover:text-[var(--charcoal)] hover:underline disabled:opacity-50"
              >
                <Globe size={14} />
                {isRevenueCatLoading ? "Checking…" : "Refresh access"}
              </button>
              <span className="inline-flex items-center gap-1.5">
                <Sparkle size={14} />
                Fair play · No face data sold
              </span>
            </div>
          )}
        </section>

        {/* Bottom — thick charcoal rule, simple nav */}
        <footer className="mt-auto border-t-[3px] border-[var(--charcoal)]">
          <div className="flex flex-col items-center justify-between gap-3 pt-4 sm:flex-row">
            <Logo size="sm" />
            <span className="text-xs font-bold text-[var(--on-surface-variant)]">
              © {new Date().getFullYear()} Emoggle. Stay squishy.
            </span>
            <nav className="flex items-center gap-4 text-xs font-bold text-[var(--on-surface-variant)]">
              <a href="/privacy" className="hover:text-[var(--charcoal)] hover:underline">
                Privacy
              </a>
              <a href="/terms" className="hover:text-[var(--charcoal)] hover:underline">
                Terms
              </a>
              <a href="/contact" className="hover:text-[var(--charcoal)] hover:underline">
                Support
              </a>
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}

/**
 * Floating decorative emojis. Purely decorative (aria-hidden),
 * positioned absolutely around the page corners and edges. Each
 * one layers a slow vertical bob on top of an independent blink
 * cycle, with a randomized phase so the six emojis never bob or
 * blink in unison.
 *
 * Structure: the outer span owns the absolute positioning and the
 * static rotation tilt (so the sticker-language is preserved). The
 * inner FloatingEmoji handles the motion — it composes its own
 * vertical translateY on top of whatever transform the outer
 * span has, so the rotation and the bob coexist cleanly.
 */
function DecoEmojis() {
  const items: Array<{ emoji: string; style: React.CSSProperties; rotation: number }> = [
    { emoji: "😜", style: { top: "8%", left: "5%" }, rotation: -4 },
    { emoji: "😝", style: { top: "12%", right: "7%" }, rotation: 6 },
    { emoji: "🤪", style: { top: "40%", left: "3%" }, rotation: -8 },
    { emoji: "😛", style: { top: "55%", right: "4%" }, rotation: 5 },
    { emoji: "🥳", style: { bottom: "20%", left: "6%" }, rotation: -10 },
    { emoji: "🤩", style: { bottom: "16%", right: "8%" }, rotation: 7 },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
      {items.map((item, i) => (
        <span
          key={i}
          className="absolute select-none text-3xl opacity-50 sm:text-4xl"
          style={{
            ...item.style,
            transform: `rotate(${item.rotation}deg)`,
          }}
        >
          {/* Slight per-element variation in the bob distance and
              duration so the six emojis feel hand-placed rather
              than mechanical. BlinkingEmoji randomizes its own
              interval on first render, so no two share a
              schedule. */}
          <FloatingEmoji
            floatAmount={3 + (i % 3)}
            floatDuration={4.5 + (i % 3) * 0.6}
            blinkDuration={200}
          >
            {item.emoji}
          </FloatingEmoji>
        </span>
      ))}
    </div>
  );
}

/**
 * HeroPreview — a stylized face-off that fills the right column on desktop.
 *
 * It uses the same chunky-frame + sticker-shadow + score-bar language as the
 * in-game duel, sized for the landing. Two tilt-opposed frames (purple on
 * the left, pink on the right) flank a charcoal seam with a yellow target
 * emoji floating in the middle. Below each frame is a tinted score bar.
 *
 * This is the visual promise of the product: "this is what you'll see when
 * you play." On mobile it stacks the same way it does in-game.
 */
function HeroPreview() {
  return (
    <div className="relative mx-auto flex w-full max-w-[640px] flex-col gap-3 lg:max-w-none">
      {/* Top label — the game-state header */}
      <div className="flex items-center justify-between gap-2">
        <Pill tone="purple">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--off-white)]" />
          Round 03
        </Pill>
        <Pill tone="yellow">
          <span className="font-mono tabular">10s</span>
        </Pill>
      </div>

      {/* The face-off */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-1.5 sm:gap-3">
        {/* Player A — purple */}
        <PreviewColumn seat="a" label="Violet" score="8.4" src="/preview-faces/violet.webp" alt="A young woman with a playful expression." />

        {/* Seam with the target emoji */}
        <div className="relative flex w-14 items-center justify-center sm:w-20 lg:w-24">
          <div className="absolute inset-y-2 left-1/2 w-1 -translate-x-1/2 bg-[var(--charcoal)]" aria-hidden />
          <div className="relative z-10 flex flex-col items-center gap-1.5">
            <span className="eyebrow text-[9px]">Target</span>
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl border-[3px] border-[var(--charcoal)] bg-[var(--yellow)] shadow-[4px_4px_0_0_var(--charcoal)] sm:h-20 sm:w-20 lg:h-24 lg:w-24"
              aria-hidden
            >
              {/* The target emoji in the live preview also blinks
                  on the standard 3-7s cycle. The outer span keeps
                  the static -rotate-3 tilt; the inner
                  BlinkingEmoji does the vertical scale. */}
              <span className="-rotate-3 text-3xl sm:text-5xl lg:text-6xl">
                <BlinkingEmoji blinkDuration={200}>😜</BlinkingEmoji>
              </span>
            </div>
            <span className="font-mono tabular text-[11px] font-bold text-[var(--charcoal)]">10s</span>
          </div>
        </div>

        {/* Player B — pink */}
        <PreviewColumn seat="b" label="Pink" score="7.1" src="/preview-faces/pink.webp" alt="A young man winking with his tongue out, mimicking a playful emoji expression." />
      </div>
    </div>
  );
}

function PreviewColumn({
  seat,
  label,
  score,
  src,
  alt,
}: {
  seat: "a" | "b";
  label: string;
  score: string;
  src: string;
  alt: string;
}) {
  const isA = seat === "a";
  const borderColor = isA ? "border-[var(--purple-deep)]" : "border-[var(--pink-deep)]";
  const seatColor = isA ? "var(--purple)" : "var(--pink)";
  const seatText = isA ? "text-[var(--purple-deep)]" : "text-[var(--pink-deep)]";
  const tilt = isA ? "tilt-l-1" : "tilt-r-1";

  return (
    <div className="flex flex-col gap-2">
      {/* Camera frame — aspect-ratio sized, fills the column.
          The image is the AI-generated portrait, sitting flush inside the
          frame with a soft inner ring so the seat-color tag in the corner
          reads cleanly on top. */}
      <div
        className={cn(
          "relative aspect-[4/5] overflow-hidden rounded-2xl border-[4px] bg-[var(--off-white-2)]",
          borderColor,
          "shadow-[6px_6px_0_0_var(--charcoal)]",
          tilt,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          width={720}
          height={900}
          loading="eager"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Bottom darken so the score-tag area below the frame stays clean
            and the face has a clear focal point. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-12"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.18), rgba(0,0,0,0))",
          }}
        />
        <span
          className={cn(
            "absolute left-2 top-2 flex items-center gap-1 rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--off-white)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] shadow-[2px_2px_0_0_var(--charcoal)] sm:left-3 sm:top-3 sm:gap-1.5 sm:px-2 sm:text-[10px]",
            seatText,
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: seatColor }} />
          {label}
        </span>
      </div>

      {/* Score bar — same treatment as the in-game footer */}
      <div className="flex flex-col gap-1.5 rounded-xl border-[2px] border-[var(--charcoal)] bg-[var(--off-white-2)] px-2.5 py-1.5 shadow-[2px_2px_0_0_var(--charcoal)]">
        <div className="flex items-center justify-between font-mono text-[9px] font-bold uppercase tracking-[0.14em] sm:text-[10px]">
          <span className={seatText}>{label}</span>
          <span className="text-[var(--charcoal)]">
            {score}<span className="text-[var(--on-surface-variant)]">/10</span>
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--off-white)]">
          <div
            className="h-full rounded-full"
            style={{
              width: `${(Number(score) / 10) * 100}%`,
              background: seatColor,
            }}
          />
        </div>
      </div>
    </div>
  );
}
