"use client";

/**
 * ResultScreen
 * ------------
 * The end-of-match scorecard overlay. Replaces the previous
 * "ScoreReveal" sticker inside `DuelArena`. Combines:
 *  - outcome (win / loss / draw) with the giant headline
 *  - the round emoji, both player scores, the accuracy
 *  - a pre-generated sarcastic reaction message (the SAME
 *    string used in the share image)
 *  - the "Play Again" and "Share Scorecard" CTAs
 *  - an off-screen `<ShareScoreCard>` mounted for capture
 *
 * The reaction message is generated ONCE per result, stored in
 * state, and then threaded into both the visible card and the
 * off-screen share card. The user will never see one line on
 * screen and a different one in their shared image.
 *
 * This component is self-contained — it does not depend on the
 * matchmaking hook or the UserProfile context. The parent passes
 * a `MatchResultLike` shape with everything we need, which keeps
 * it trivial to drop into solo mode or any future mode.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Refresh, WebEmoji, cn } from "../../ui";
import {
  ShareScoreCard,
  type ScorecardOutcome,
} from "./ShareScoreCard";
import { ShareScoreCardPortal } from "./ShareScoreCardPortal";
import { ShareButton } from "./ShareButton";
import { useShareScorecard } from "./useShareScorecard";
import {
  bandForAccuracy,
  generateReactionMessage,
  scoreToAccuracyPct,
  type AccuracyBand,
  type Outcome,
} from "./SarcasticMessageGenerator";
import { trackResultEvent } from "./analytics";

/**
 * Minimal result shape the ResultScreen needs. The matchmaking
 * hook's `MatchResult` and the solo judge both reduce to this
 * one shape on the wire.
 */
export interface MatchResultLike {
  /** Player's final score (out of 10). */
  myScore: number;
  /** Opponent's final score (out of 10). */
  opponentScore: number;
  /** The target emoji the round was about, e.g. "😱". */
  emoji: string | null;
  /** "win" / "loss" / "draw" — the player-relative outcome. */
  outcome: Outcome;
  /** Optional player name; falls back to "ME" / "YOU". */
  playerName?: string | null;
  /** Optional opponent name; falls back to "OPPONENT" / "RIVAL". */
  opponentName?: string | null;
  /** Render-ready flag emoji, including the neutral globe fallback. */
  playerFlag?: string;
  /** Render-ready opponent flag emoji, including the neutral globe fallback. */
  opponentFlag?: string;
  /** Optional matchId for analytics. */
  matchId?: string | null;
}

interface ResultScreenProps {
  result: MatchResultLike | null;
  onPlayAgain: () => void;
  onLeave?: () => void;
  /** Display labels. Defaults to "ME" and "OPPONENT". */
  selfLabel?: string;
  rivalLabel?: string;
}

export function ResultScreen({
  result,
  onPlayAgain,
  onLeave,
  selfLabel = "ME",
  rivalLabel = "OPPONENT",
}: ResultScreenProps) {
  // The pre-generated sarcastic line. Computed once per `result`
  // identity so it stays consistent across re-renders and across
  // the visible card vs. the off-screen share card.
  const reactionMessage = useMemo(() => {
    if (!result) return "";
    const myPct = scoreToAccuracyPct(result.myScore);
    const band: AccuracyBand = bandForAccuracy(myPct);
    const delta = result.myScore - result.opponentScore;
    return generateReactionMessage({
      outcome: result.outcome,
      band,
      delta,
    });
  }, [result]);

  // Track which result we have already fired a "result_viewed" event
  // for. We only want to log it once per result.
  const trackedViewRef = useRef<string | null>(null);
  useEffect(() => {
    if (!result) return;
    const key = `${result.matchId ?? "solo"}:${result.outcome}:${result.myScore}:${result.opponentScore}`;
    if (trackedViewRef.current === key) return;
    trackedViewRef.current = key;
    const accuracy = scoreToAccuracyPct(result.myScore);
    trackResultEvent("result_viewed", {
      matchId: result.matchId ?? undefined,
      result: result.outcome,
      score: result.myScore,
      accuracy,
      expression: result.emoji ?? null,
    });
  }, [result]);

  // Off-screen share card is mounted for the lifetime of the
  // result screen. The capture ref points at it.
  const shareCardRef = useRef<HTMLDivElement | null>(null);
  const share = useShareScorecard(shareCardRef);

  const handlePlayAgain = () => {
    if (result) {
      trackResultEvent("play_again_clicked", {
        matchId: result.matchId ?? undefined,
        result: result.outcome,
        score: result.myScore,
      });
    }
    onPlayAgain();
  };

  const handleShareClick = () => {
    if (!result) return;
    trackResultEvent("scorecard_share_clicked", {
      matchId: result.matchId ?? undefined,
      result: result.outcome,
      score: result.myScore,
      accuracy: scoreToAccuracyPct(result.myScore),
      expression: result.emoji ?? null,
    });
    void share.share();
  };

  return (
    <>
      <AnimatePresence>
        <motion.div
          key={result?.matchId ?? "pending-result"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          // The result screen sits above every other arena element
          // (header z-30, camera control bar z-40, lobby overlays
          // z-60). Background is fully opaque so the camera + score
          // bar underneath cannot bleed through and look like
          // overlapping controls. Safe-area insets keep the card
          // away from notches / home indicators on mobile.
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4"
          style={{
            backgroundColor: "var(--off-white)",
            paddingTop: "max(0.75rem, env(safe-area-inset-top))",
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
            paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
            paddingRight: "max(0.75rem, env(safe-area-inset-right))",
          }}
          role="dialog"
          aria-modal="true"
          aria-label={result ? "Match result" : "Calculating match result"}
        >
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.92, rotate: -1.5 }}
            animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 22, delay: 0.05 }}
            className="my-auto flex w-full max-w-xl flex-col items-stretch gap-4 rounded-3xl border-[4px] border-[var(--charcoal)] bg-[var(--off-white-2)] p-4 text-center shadow-[8px_8px_0_0_var(--charcoal)] sm:gap-5 sm:p-8 sm:shadow-[10px_10px_0_0_var(--charcoal)]"
          >
            {result ? (
              <>
                <ResultHeader
                  result={result}
                  reactionMessage={reactionMessage}
                  selfLabel={selfLabel}
                  rivalLabel={rivalLabel}
                />

                <ScoreStrip
                  result={result}
                  selfLabel={selfLabel}
                  rivalLabel={rivalLabel}
                />

                <ActionRow
                  reactionMessage={reactionMessage}
                  share={share}
                  onShare={handleShareClick}
                  onPlayAgain={handlePlayAgain}
                  onLeave={onLeave}
                />
              </>
            ) : (
              <PendingResult onRetry={handlePlayAgain} onLeave={onLeave} />
            )}
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {/*
        Off-screen share card is rendered through a portal directly
        under `document.body` (NOT inside the result modal). The
        result modal uses framer-motion `transform` for the
        spring-in, which would otherwise become the containing
        block for our `position: fixed` card and clip the
        1080x1350 export to the modal's box.
      */}
      {result && (
        <ShareScoreCardPortal ref={shareCardRef}>
          <ShareScoreCard
            outcome={toScorecardOutcome(result.outcome)}
            accuracyPct={scoreToAccuracyPct(result.myScore)}
            myScore={result.myScore}
            opponentScore={result.opponentScore}
            emoji={result.emoji ?? "😀"}
            reactionMessage={reactionMessage}
            playerName={result.playerName ?? selfLabel}
            opponentName={result.opponentName ?? rivalLabel}
            matchId={result.matchId ?? undefined}
          />
        </ShareScoreCardPortal>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Subcomponents                                                       */
/* ------------------------------------------------------------------ */

function PendingResult({ onRetry, onLeave }: { onRetry: () => void; onLeave?: () => void }) {
  const [isDelayed, setIsDelayed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setIsDelayed(true), 12000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-4 py-8" role="status" aria-live="polite">
      <motion.span
        aria-hidden
        animate={{ rotate: 360 }}
        transition={{ duration: 1, ease: "linear", repeat: Infinity }}
        className="flex h-16 w-16 items-center justify-center rounded-full border-[4px] border-[var(--charcoal)] border-t-[var(--purple)] bg-[var(--yellow)] text-2xl shadow-[4px_4px_0_0_var(--charcoal)]"
      >
        ✨
      </motion.span>
      <div className="space-y-1 text-center">
        <span className="eyebrow">Round complete</span>
        <h2 className="font-display text-3xl font-bold tracking-tight text-[var(--charcoal)] sm:text-4xl">
          {isDelayed ? "Results are taking longer" : "Calculating results…"}
        </h2>
        <p className="text-sm font-semibold text-[var(--on-surface-variant)]">
          {isDelayed ? "The other score did not arrive. You can safely start a new match." : "Locking both final scores."}
        </p>
      </div>
      {isDelayed && (
        <div className="flex w-full max-w-xs flex-col gap-2 sm:flex-row">
          <Button onClick={onRetry} className="min-h-11 flex-1">New match</Button>
          {onLeave && <Button variant="secondary" onClick={onLeave} className="min-h-11 flex-1">Back home</Button>}
        </div>
      )}
    </div>
  );
}

function ResultHeader({
  result,
  reactionMessage,
  selfLabel,
  rivalLabel,
}: {
  result: MatchResultLike;
  reactionMessage: string;
  selfLabel: string;
  rivalLabel: string;
}) {
  const { outcome, emoji, myScore, opponentScore } = result;
  const accuracyPct = scoreToAccuracyPct(myScore);
  const oppAccuracyPct = scoreToAccuracyPct(opponentScore);

  const headline = OUTCOME_HEADLINE[outcome];
  const tone = OUTCOME_TONE[outcome];

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="eyebrow">Round result</span>
      <motion.h2
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 360, damping: 18, delay: 0.18 }}
        className={cn(
          "font-display text-[clamp(2.25rem,11vw,4rem)] font-bold leading-[1.05] tracking-tight",
        )}
        style={{ color: tone }}
      >
        {headline} <WebEmoji emoji={OUTCOME_EMOJI[outcome]} />
      </motion.h2>

      {/* Emoji being played + accuracy percentage row */}
      <div className="mt-1 flex items-center gap-3 sm:gap-4">
        <span
          aria-hidden
          className="flex h-14 w-14 items-center justify-center rounded-2xl border-[3px] border-[var(--charcoal)] bg-[var(--yellow)] text-3xl shadow-[3px_3px_0_0_var(--charcoal)] sm:h-16 sm:w-16 sm:text-4xl sm:shadow-[4px_4px_0_0_var(--charcoal)]"
        >
          <WebEmoji emoji={emoji ?? "😀"} />
        </span>
        <div className="flex flex-col items-start text-left">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--on-surface-variant)]">
            Expression match
          </span>
          <span className="font-display text-2xl font-bold leading-none tracking-tight text-[var(--charcoal)] sm:text-3xl">
            <span
              className="tabular"
              style={{ color: tone }}
            >
              {accuracyPct}%
            </span>
            <span className="ml-1 text-base font-bold text-[var(--on-surface-variant)]">you</span>
          </span>
          {Math.abs(accuracyPct - oppAccuracyPct) > 0.5 && (
            <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--on-surface-variant)]">
              {rivalLabel} {oppAccuracyPct}%
            </span>
          )}
        </div>
      </div>

      {/* The sarcastic reaction line — the SAME line used in the
          share image. */}
      <motion.blockquote
        initial={{ y: 6, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.3 }}
        className="mt-2 max-w-md text-[15px] font-semibold leading-snug text-[var(--charcoal)] sm:text-base"
      >
        “{reactionMessage}”
      </motion.blockquote>

      <span className="sr-only">
        {selfLabel} scored {myScore} and {rivalLabel} scored {opponentScore}.
      </span>
    </div>
  );
}

function ScoreStrip({
  result,
  selfLabel,
  rivalLabel,
}: {
  result: MatchResultLike;
  selfLabel: string;
  rivalLabel: string;
}) {
  const { myScore, opponentScore, outcome } = result;
  const iWon = outcome === "win";
  const opponentWon = outcome === "loss";
  const draw = outcome === "draw";

  return (
    <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:mt-2 sm:gap-4">
      <RevealScoreCard
        label={selfLabel}
        flag={result.playerFlag ?? "🌐"}
        score={myScore}
        tone="purple"
        emphasis={iWon}
        delay={0.18}
      />
      <motion.div
        initial={{ scale: 0.6, opacity: 0, rotate: -10 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 18, delay: 0.32 }}
        className="flex h-11 w-11 flex-none items-center justify-center rounded-full border-[3px] border-[var(--charcoal)] bg-[var(--yellow)] font-display text-sm font-bold uppercase text-[var(--charcoal)] shadow-[3px_3px_0_0_var(--charcoal)] sm:h-14 sm:w-14 sm:text-lg sm:shadow-[4px_4px_0_0_var(--charcoal)]"
        aria-hidden
      >
        vs
      </motion.div>
      <RevealScoreCard
        label={rivalLabel}
        flag={result.opponentFlag ?? "🌐"}
        score={opponentScore}
        tone="pink"
        emphasis={opponentWon}
        delay={0.24}
      />
      {draw && (
        <span className="col-span-3 mt-1 inline-flex items-center justify-center self-center rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--off-white)] px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--charcoal)] shadow-[2px_2px_0_0_var(--charcoal)]">
          Draw
        </span>
      )}
    </div>
  );
}

function RevealScoreCard({
  label,
  flag,
  score,
  tone,
  emphasis,
  delay,
}: {
  label: string;
  flag: string;
  score: number;
  tone: "purple" | "pink";
  emphasis: boolean;
  delay: number;
}) {
  const fill =
    tone === "purple"
      ? "bg-[var(--purple)] text-[var(--off-white)]"
      : "bg-[var(--pink)] text-[var(--charcoal)]";
  return (
    <motion.div
      initial={{ y: 8, opacity: 0, scale: 0.95, rotate: tone === "purple" ? -2 : 2 }}
      animate={{ y: 0, opacity: 1, scale: 1, rotate: tone === "purple" ? -1 : 1 }}
      transition={{ type: "spring", stiffness: 280, damping: 24, delay }}
      className={cn(
        "flex min-w-0 flex-col items-center gap-1 rounded-2xl border-[3px] border-[var(--charcoal)] p-3 text-center sm:gap-1.5 sm:p-4",
        "shadow-[4px_4px_0_0_var(--charcoal)] sm:shadow-[6px_6px_0_0_var(--charcoal)]",
        fill,
      )}
    >
      <span className="inline-flex max-w-full items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] opacity-90">
        <span aria-hidden className="text-base leading-none">{flag}</span>
        <span className="truncate">{label}</span>
      </span>
      <span
        className="font-display text-4xl font-bold leading-none tabular tracking-tight sm:text-[clamp(2.25rem,6vw,3.5rem)]"
        style={{
          color: tone === "purple" ? "var(--off-white)" : "var(--charcoal)",
        }}
      >
        {score.toFixed(1)}
      </span>
      {emphasis && (
        <span
          className={cn(
            "rounded-full border-[2px] border-[var(--charcoal)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em]",
            tone === "purple"
              ? "bg-[var(--yellow)] text-[var(--charcoal)]"
              : "bg-[var(--yellow)] text-[var(--charcoal)]",
          )}
        >
          Winner
        </span>
      )}
    </motion.div>
  );
}

function ActionRow({
  reactionMessage,
  share,
  onShare,
  onPlayAgain,
  onLeave,
}: {
  reactionMessage: string;
  share: ReturnType<typeof useShareScorecard>;
  onShare: () => void;
  onPlayAgain: () => void;
  onLeave?: () => void;
}) {
  return (
    <motion.div
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.25, delay: 0.5 }}
      className="mt-1 flex w-full flex-col gap-2 sm:mt-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-3"
    >
      {/* Primary CTA — play again */}
      <Button
        size="md"
        onClick={onPlayAgain}
        iconLeft={<Refresh size={16} />}
        className="w-full sm:flex-1 sm:basis-1/2"
      >
        Play Again
      </Button>

      {/* Secondary CTA — share */}
      <div className="w-full sm:flex-1 sm:basis-1/2">
        <ShareButton
          phase={share.phase}
          isBusy={share.isBusy}
          error={share.error}
          onClick={onShare}
        />
      </div>

      {onLeave && (
        <button
          type="button"
          onClick={onLeave}
          className="self-center text-xs font-bold uppercase tracking-[0.18em] text-[var(--on-surface-variant)] underline-offset-4 hover:underline"
        >
          Back home
        </button>
      )}

      <p className="sr-only">{`Reaction: ${reactionMessage}`}</p>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                              */
/* ------------------------------------------------------------------ */

const OUTCOME_HEADLINE: Record<Outcome, string> = {
  win: "You won",
  loss: "You lost",
  draw: "You tied",
};

const OUTCOME_EMOJI: Record<Outcome, string> = {
  win: "😎",
  loss: "💀",
  draw: "🤝",
};

const OUTCOME_TONE: Record<Outcome, string> = {
  win: "var(--purple-deep)",
  loss: "var(--pink-deep)",
  draw: "var(--yellow-deep)",
};

function toScorecardOutcome(outcome: Outcome): ScorecardOutcome {
  if (outcome === "win" || outcome === "loss" || outcome === "draw") return outcome;
  return "loss";
}
