"use client";

/**
 * CelebrityResultScreen
 * ---------------------
 * End-of-match modal for the Celebrity Face Mimic mode. Mirrors
 * the structure of `result/ResultScreen.tsx` so the two screens
 * feel like the same app, but the "target emoji" tile is
 * replaced with the celebrity photo + name, the share image is
 * the celebrity-themed `CelebrityShareScoreCard`, and the
 * outcome copy talks about the celebrity ("I won the mimic",
 * "The original remains undefeated").
 *
 * The component is self-contained: it does NOT depend on the
 * matchmaking hook. The parent passes a `CelebrityMatchResult`
 * shape and we render everything from there.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Refresh, cn } from "../ui";
import { ShareScoreCardPortal } from "./result/ShareScoreCardPortal";
import { ShareButton } from "./result/ShareButton";
import { useShareScorecard } from "./result/useShareScorecard";
import {
  bandForAccuracy,
  scoreToAccuracyPct,
  type AccuracyBand,
  type Outcome,
} from "./result/SarcasticMessageGenerator";
import { generateCelebrityReaction } from "./result/celebrityReaction";
import {
  CelebrityShareScoreCard,
  type CelebrityShareData,
  type ScorecardOutcome,
} from "./result/CelebrityShareScoreCard";
import { trackResultEvent } from "./result/analytics";

export interface CelebrityResultLike {
  /** Player's final score (0..10). */
  myScore: number;
  /** Opponent's final score (0..10). */
  opponentScore: number;
  /** "win" / "loss" / "draw" — the player-relative outcome. */
  outcome: Outcome;
  /** Optional player name; falls back to "ME". */
  playerName?: string | null;
  /** Optional opponent name; falls back to "OPPONENT". */
  opponentName?: string | null;
  /** Render-ready flag emoji for the player. */
  playerFlag?: string;
  /** Render-ready opponent flag emoji. */
  opponentFlag?: string;
  /** Optional matchId for analytics. */
  matchId?: string | null;
  /** Celebrity the round was about. Required for the celebrity share image. */
  celebrity: {
    id: number | null;
    name: string;
    imageUrl: string;
    category?: string | null;
    difficulty?: string | null;
  } | null;
}

interface CelebrityResultScreenProps {
  result: CelebrityResultLike | null;
  onPlayAgain: () => void;
  onLeave?: () => void;
  selfLabel?: string;
  rivalLabel?: string;
}

const OUTCOME_HEADLINE: Record<Outcome, string> = {
  win: "You won 😎",
  loss: "You lost 💀",
  draw: "You tied 🤝",
};

const OUTCOME_TONE: Record<Outcome, string> = {
  win: "var(--purple-deep)",
  loss: "var(--pink-deep)",
  draw: "var(--yellow-deep)",
};

export function CelebrityResultScreen({
  result,
  onPlayAgain,
  onLeave,
  selfLabel = "ME",
  rivalLabel = "OPPONENT",
}: CelebrityResultScreenProps) {
  // The pre-generated reaction line. Uses the celebrity-specific
  // generator so the verdict can mention the celebrity by name.
  const reactionMessage = useMemo(() => {
    if (!result) return "";
    const myPct = scoreToAccuracyPct(result.myScore);
    const band: AccuracyBand = bandForAccuracy(myPct);
    const delta = result.myScore - result.opponentScore;
    return generateCelebrityReaction({
      outcome: result.outcome,
      band,
      delta,
      withCelebrityPrefix: true,
    });
  }, [result]);

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
      expression: result.celebrity?.name ?? null,
      mode: "celebrity",
    });
  }, [result]);

  const shareCardRef = useRef<HTMLDivElement | null>(null);
  const share = useShareScorecard(shareCardRef);

  const handlePlayAgain = () => {
    if (result) {
      trackResultEvent("play_again_clicked", {
        matchId: result.matchId ?? undefined,
        result: result.outcome,
        score: result.myScore,
        mode: "celebrity",
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
      expression: result.celebrity?.name ?? null,
      mode: "celebrity",
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
          aria-label={result ? "Celebrity match result" : "Calculating match result"}
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

      {result && (
        <ShareScoreCardPortal ref={shareCardRef}>
          <CelebrityShareScoreCard
            {...celebrityShareDataFromResult(result, reactionMessage)}
          />
        </ShareScoreCardPortal>
      )}
    </>
  );
}

function celebrityShareDataFromResult(
  result: CelebrityResultLike,
  reactionMessage: string,
): CelebrityShareData {
  return {
    outcome: toScorecardOutcome(result.outcome),
    accuracyPct: scoreToAccuracyPct(result.myScore),
    myScore: result.myScore,
    opponentScore: result.opponentScore,
    reactionMessage,
    playerName: result.playerName ?? null,
    opponentName: result.opponentName ?? null,
    matchId: result.matchId ?? null,
    celebrity: result.celebrity
      ? {
          id: result.celebrity.id,
          name: result.celebrity.name,
          imageUrl: result.celebrity.imageUrl,
          category: result.celebrity.category ?? undefined,
          difficulty: result.celebrity.difficulty ?? undefined,
        }
      : null,
  };
}

function toScorecardOutcome(outcome: Outcome): ScorecardOutcome {
  if (outcome === "win" || outcome === "loss" || outcome === "draw") return outcome;
  return "loss";
}

/* ─── Subcomponents ──────────────────────────────────────────────── */

function PendingResult({ onRetry, onLeave }: { onRetry: () => void; onLeave?: () => void }) {
  const [isDelayed, setIsDelayed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setIsDelayed(true), 12000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      className="flex min-h-64 flex-col items-center justify-center gap-4 py-8"
      role="status"
      aria-live="polite"
    >
      <motion.span
        aria-hidden
        animate={{ rotate: 360 }}
        transition={{ duration: 1, ease: "linear", repeat: Infinity }}
        className="flex h-16 w-16 items-center justify-center rounded-full border-[4px] border-[var(--charcoal)] border-t-[var(--pink)] bg-[var(--yellow)] text-2xl shadow-[4px_4px_0_0_var(--charcoal)]"
      >
        🎬
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
  result: CelebrityResultLike;
  reactionMessage: string;
  selfLabel: string;
  rivalLabel: string;
}) {
  const { outcome, celebrity, myScore, opponentScore } = result;
  const accuracyPct = scoreToAccuracyPct(myScore);
  const oppAccuracyPct = scoreToAccuracyPct(opponentScore);
  const headline = OUTCOME_HEADLINE[outcome];
  const tone = OUTCOME_TONE[outcome];

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="eyebrow">Celebrity mimic</span>
      <motion.h2
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 360, damping: 18, delay: 0.18 }}
        className="font-display text-[clamp(2.25rem,11vw,4rem)] font-bold leading-[1.05] tracking-tight"
        style={{ color: tone }}
      >
        {headline}
      </motion.h2>

      <div className="mt-1 flex items-center gap-3 sm:gap-4">
        <CelebrityTile celebrity={celebrity} />
        <div className="flex flex-col items-start text-left">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--on-surface-variant)]">
            Mimic accuracy
          </span>
          <span className="font-display text-2xl font-bold leading-none tracking-tight text-[var(--charcoal)] sm:text-3xl">
            <span className="tabular" style={{ color: tone }}>
              {accuracyPct}%
            </span>
            <span className="ml-1 text-base font-bold text-[var(--on-surface-variant)]">you</span>
          </span>
          <span className="mt-0.5 max-w-[14ch] truncate text-xs font-bold text-[var(--on-surface-variant)] sm:text-sm">
            {celebrity?.name ?? "the celebrity"}
          </span>
          {Math.abs(accuracyPct - oppAccuracyPct) > 0.5 && (
            <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--on-surface-variant)]">
              {rivalLabel} {oppAccuracyPct}%
            </span>
          )}
        </div>
      </div>

      <motion.blockquote
        initial={{ y: 6, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.3 }}
        className="mt-2 max-w-md text-[15px] font-semibold leading-snug text-[var(--charcoal)] sm:text-base"
      >
        “{reactionMessage}”
      </motion.blockquote>

      <span className="sr-only">
        {selfLabel} scored {myScore} and {rivalLabel} scored {opponentScore}, imitating {celebrity?.name ?? "the celebrity"}.
      </span>
    </div>
  );
}

function CelebrityTile({
  celebrity,
}: {
  celebrity: CelebrityResultLike["celebrity"];
}) {
  if (!celebrity) {
    return (
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-[3px] border-[var(--charcoal)] bg-[var(--yellow)] text-3xl shadow-[3px_3px_0_0_var(--charcoal)] sm:h-16 sm:w-16 sm:text-4xl sm:shadow-[4px_4px_0_0_var(--charcoal)]">
        🏆
      </div>
    );
  }
  return (
    <div className="relative h-14 w-14 overflow-hidden rounded-2xl border-[3px] border-[var(--charcoal)] bg-[var(--yellow)] shadow-[3px_3px_0_0_var(--charcoal)] sm:h-16 sm:w-16 sm:shadow-[4px_4px_0_0_var(--charcoal)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={celebrity.imageUrl}
        alt={celebrity.name}
        className="h-full w-full object-cover"
        loading="eager"
        crossOrigin="anonymous"
      />
    </div>
  );
}

function ScoreStrip({
  result,
  selfLabel,
  rivalLabel,
}: {
  result: CelebrityResultLike;
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
        <span aria-hidden className="text-base leading-none">
          {flag}
        </span>
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
            "bg-[var(--yellow)] text-[var(--charcoal)]",
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
      <Button
        size="md"
        onClick={onPlayAgain}
        iconLeft={<Refresh size={16} />}
        className="w-full sm:flex-1 sm:basis-1/2"
      >
        Play Again
      </Button>
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
