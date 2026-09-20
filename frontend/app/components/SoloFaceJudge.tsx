"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import VideoPanel from "./VideoPanel";
import { useExpressionScorer } from "../hooks/useExpressionScorer";
import { useLocalCamera } from "../hooks/useLocalCamera";
import { isValidScoreSample, useStableScoreSampler } from "../hooks/useStableScoreSampler";
import { useRoundClock } from "../hooks/useRoundClock";
import type { RoundSchedule } from "../lib/serverClock";
import { usePlayerName } from "../context/PlayerNameContext";
import { useCountry } from "../context/CountryContext";
import {
  Button,
  EmojiPromptMotion,
  WebEmoji,
  Logo,
  Pill,
  Score,
  ThemeToggle,
  ArrowLeft,
  Camera,
  Refresh,
  Sparkle,
  cn,
} from "../ui";
import {
  appendSoloHistory,
  computeStats,
  getMatchHistory,
  getSoloHistory,
  setStats as setStoredStats,
  type SoloHistoryEntry,
} from "../lib/storage";

const ROUND_SECONDS = 10;
const EMOJI_PROMPTS = [
  "😀","😁","😂","😮","😲","😉","😋","😛","😜","🤪",
  "😎","🤩","🥳","🤔","😏","😬","😴","🤯","🥺","😡",
  "🤡","👻","💀","🙄","😬","😱","🤤","😇","🤠","🤓",
];

type SoloPhase = "ready" | "playing" | "results";

interface SoloFaceJudgeProps {
  onBack: () => void;
}

function pickEmoji(previous?: string) {
  const choices = EMOJI_PROMPTS.filter((emoji) => emoji !== previous);
  return choices[Math.floor(Math.random() * choices.length)];
}

function toTenPoint(rawScore: number | null) {
  if (rawScore === null) return null;
  return Math.max(0, Math.min(10, Number(rawScore.toFixed(2))));
}

function formatScore(score: number | null) {
  return score === null ? "--" : score.toFixed(1);
}

function soloResult(score: number | null) {
  if (score === null) {
    return { label: "No face card", tone: "var(--yellow-deep)" as const, sub: "Could not lock a face score this round." };
  }
  if (score >= 8.5)
    return { label: "Ate that", tone: "var(--purple-deep)" as const, sub: "Main-character accuracy." };
  if (score >= 7)
    return { label: "Face card valid", tone: "var(--purple-deep)" as const, sub: "Solid match. The face was facing." };
  if (score >= 5)
    return { label: "Kinda cooked", tone: "var(--yellow-deep)" as const, sub: "Close enough. Room to mog harder." };
  return { label: "Try again bestie", tone: "var(--pink-deep)" as const, sub: "The emoji did not feel seen this time." };
}

export default function SoloFaceJudge({ onBack }: SoloFaceJudgeProps) {
  const webcamRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<SoloPhase>("ready");
  const [emojiPrompt, setEmojiPrompt] = useState(() => pickEmoji());
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [history, setHistory] = useState<SoloHistoryEntry[]>([]);
  const {
    stream: localStream,
    status: localCameraStatus,
    error: localCameraError,
    retry: retryCamera,
  } = useLocalCamera();
  const { name: playerName } = usePlayerName();
  const { country: detectedCountry } = useCountry();

  useEffect(() => {
    // `getSoloHistory` migrates the legacy colon-form key on first
    // read, so existing users keep their attempts.
    // This is intentionally a post-hydration browser-storage sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(getSoloHistory());
  }, []);

  const noopScore = useCallback(() => {}, []);
  const expressionRef = useRef<ReturnType<typeof useExpressionScorer> | null>(null);
  const expression = useExpressionScorer(webcamRef, emojiPrompt, phase === "playing", noopScore);
  // Mirror the scorer output for the sampler callback.
  useEffect(() => {
    expressionRef.current = expression;
  }, [expression]);
  const liveScore = toTenPoint(expression.score);

  // Stable-interval averaging. The same hook the duel arena
  // uses, so solo and duel rounds share identical scoring
  // semantics: a deterministic time-driven mean over the full
  // 10 seconds, ignoring no-face / loading / error frames.
  // Bind the sampler's STABLE callbacks, never the object it
  // returns. That object carries the live sample state, so it is a
  // new reference on every render — using it as an effect
  // dependency tore the round timer down and rebuilt it faster than
  // it could ever fire once the face detector started re-rendering
  // this component, which is what left solo rounds running forever.
  const {
    start: startSampling,
    stop: stopSampling,
    reset: resetSampling,
    getCurrent: getCurrentSamples,
    peak: samplePeak,
  } = useStableScoreSampler(
    () => {
      const exp = expressionRef.current;
      if (!exp) return null;
      return {
        score: exp.score,
        valid: isValidScoreSample(exp.score, exp.status),
      };
    },
    { intervalMs: 100 },
  );

  useEffect(() => {
    if (phase === "playing") {
      startSampling();
    } else {
      stopSampling();
    }
  }, [phase, startSampling, stopSampling]);

  /*
   * The round is bounded by an absolute deadline rather than ten
   * counted interval ticks — the same clock the duel arena runs on.
   * Beyond surviving re-renders, it means a phone that throttles
   * timers while running face detection still gets a real ten
   * seconds instead of twelve or more.
   */
  const [roundStartedAt, setRoundStartedAt] = useState<number | null>(null);
  const roundSchedule = useMemo<RoundSchedule | null>(() => {
    if (roundStartedAt === null) return null;
    // Solo has no opponent and no pre-round countdown, so the scan
    // window opens the moment the player hits start. FaceSync needs
    // two faces, so its lead-in is already over here too.
    return {
      matchId: null,
      faceSyncEndsAt: roundStartedAt,
      countdownEndsAt: roundStartedAt,
      scanStartsAt: roundStartedAt,
      scanEndsAt: roundStartedAt + ROUND_SECONDS * 1000,
      durationSec: ROUND_SECONDS,
      anchored: true,
    };
  }, [roundStartedAt]);

  const finishedRef = useRef(false);
  const finishRound = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    stopSampling();
    const snapshot = getCurrentSamples();
    const score = Number((snapshot.sampleCount > 0 ? snapshot.average : 0).toFixed(1));
    setFinalScore(score);
    const entry: SoloHistoryEntry = { emoji: emojiPrompt, score, ts: Date.now() };
    const next = appendSoloHistory(entry);
    setHistory(next);
    // Refresh aggregate stats so the homepage/history page see this
    // attempt immediately. Pulling from the just-written list avoids
    // a re-read of localStorage.
    setStoredStats(computeStats(getMatchHistory(), next));
    setPhase("results");
  }, [emojiPrompt, getCurrentSamples, stopSampling]);

  const { secondsLeft } = useRoundClock({
    schedule: roundSchedule,
    active: phase === "playing",
    onScanEnd: finishRound,
  });
  const roundSeconds = secondsLeft ?? ROUND_SECONDS;

  const statusText = useMemo(() => {
    if (phase !== "playing") return "Solo scan";
    if (expression.status === "loading") return "Loading face tracker...";
    if (expression.status === "no-face") return "Face not found";
    if (expression.status === "error") return "Face tracker unavailable";
    return "Scanning your face";
  }, [expression.status, phase]);

  const result = soloResult(finalScore);
  const personalBest = history.length > 0 ? Math.max(...history.map((e) => e.score)) : null;

  const startRound = () => {
    if (localCameraStatus !== "ready") return;
    resetSampling();
    setFinalScore(null);
    finishedRef.current = false;
    setRoundStartedAt(Date.now());
    setPhase("playing");
  };

  const nextEmoji = () => {
    setEmojiPrompt((current) => pickEmoji(current));
    resetSampling();
    setFinalScore(null);
    finishedRef.current = false;
    setRoundStartedAt(null);
    setPhase("ready");
  };

  return (
    <div className="relative flex min-h-dvh w-full max-w-full flex-col overflow-x-clip bg-[var(--off-white)] text-[var(--charcoal)]">
      <header className="z-30 flex flex-none flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b-[3px] border-[var(--charcoal)] bg-[var(--off-white)] px-3 py-2.5 sm:flex-nowrap sm:px-6 sm:py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            onClick={onBack}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-[13px] font-bold text-[var(--charcoal)] transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--charcoal)]"
            aria-label="Back to home"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Back</span>
          </button>
          <span className="hidden h-5 w-px bg-[var(--ink-soft)] sm:inline-block" />
          <Logo size="sm" />
          <Pill tone="yellow">Solo</Pill>
        </div>
        <div className="order-3 flex w-full min-w-0 items-center justify-between gap-2 border-t-2 border-[var(--ink-soft)] pt-2 text-xs sm:order-none sm:w-auto sm:justify-end sm:gap-3 sm:border-0 sm:pt-0 sm:text-sm">
          <span
            className={cn(
              "min-w-0 truncate font-bold",
              expression.status === "ready" ? "text-[var(--purple-deep)]" : "text-[var(--yellow-deep)]",
            )}
          >
            {statusText}
          </span>
          {personalBest !== null && (
            <span className="shrink-0 whitespace-nowrap font-mono tabular text-[var(--on-surface-variant)]">
              Best {formatScore(personalBest)}/10
            </span>
          )}
          <ThemeToggle size="sm" />
        </div>
      </header>

      <main className="relative mx-auto flex w-full max-w-[1600px] min-w-0 flex-1 flex-col gap-4 p-3 sm:p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:items-stretch lg:gap-6 lg:p-6">
        {/* Camera frame — yellow sticker-shadowed card, slight tilt.
            The container is pinned to a fixed aspect ratio so the
            <video> element can never grow the column to match the
            camera's intrinsic resolution (the classic iOS Safari
            getUserMedia auto-expand bug). */}
        <div className="relative min-w-0">
          <div
            className={cn(
              "relative mx-auto overflow-hidden rounded-3xl border-[4px] border-[var(--charcoal)] bg-[var(--off-white-2)] lg:mx-0",
              // Aspect ratio locks the column to a predictable
              // shape on first paint, before getUserMedia resolves.
              "aspect-[4/5] w-full max-w-[720px]",
              // Tablets remain stacked; the two-column layout only
              // begins when both the camera and controls have room.
              // The video inside uses object-cover so the feed is
              // cropped to fill, never letterboxed.
              "sm:aspect-video lg:max-w-none",
              "shadow-[10px_10px_0_0_var(--charcoal)]",
              "tilt-l-1",
            )}
          >
            <VideoPanel
              ref={webcamRef}
              label="YOU"
              playerName={playerName ?? "You"}
              country={detectedCountry?.display ?? null}
              rankLabel="SOLO · PRACTICE"
              isLocal={true}
              localStream={localStream}
              autoAcquireLocalStream={false}
              localCameraStatus={localCameraStatus}
              localCameraError={localCameraError}
              onRetryCamera={retryCamera}
              frozenFrame={null}
              liveScore={phase === "results" ? finalScore : liveScore}
              score={finalScore}
              verdict={null}
              roast={null}
              isRevealing={false}
              isPlaying={phase === "playing" || phase === "results"}
              isJudging={false}
              scoreAlign="left"
              scanBox={expression.faceBox}
              faceLandmarks={expression.faceLandmarks}
            />
          </div>
        </div>

        {/* Side panel — target emoji + score + actions */}
        <aside className="flex min-w-0 flex-col gap-3 lg:min-h-0">
          {/* Target card — yellow sticker */}
          <div
            className={cn(
              "flex min-w-0 flex-col gap-3 rounded-3xl border-[4px] border-[var(--charcoal)] bg-[var(--off-white-2)] p-4 sm:p-5 lg:flex-1 lg:gap-4",
              "shadow-[8px_8px_0_0_var(--charcoal)]",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="eyebrow">Target</span>
              {phase === "playing" && (
                <Pill tone={roundSeconds <= 3 ? "pink" : "yellow"}>
                  <span className="font-mono tabular">{roundSeconds.toString().padStart(2, "0")}s</span>
                </Pill>
              )}
            </div>

            <div className="flex items-center justify-center">
              <EmojiCard emoji={emojiPrompt} active={phase === "playing"} />
            </div>

            <div className="mt-auto flex flex-col items-center gap-1 text-center">
              {/* Personal greeting — uses the player's saved name
                  when present, falls back to a friendly default.
                  The country flag (when detected) is rendered
                  alongside the name as a tiny pill. */}
              <span className="font-display text-sm font-bold text-[var(--charcoal)]">
                {playerName
                  ? `Hey ${playerName}${detectedCountry?.flag ? ` ${detectedCountry.flag}` : ""}, make this face:`
                  : "Make this face:"}
              </span>
              <span className="eyebrow mt-1">Your score</span>
              <Score
                value={phase === "results" ? finalScore : liveScore}
                size="lg"
                tone={phase === "results" ? (finalScore && finalScore >= 7 ? "purple" : finalScore && finalScore >= 5 ? "neutral" : "pink") : "neutral"}
                animated
              />
              {phase === "playing" && samplePeak > 0 && (
                <span className="mt-1 font-mono tabular text-xs text-[var(--on-surface-variant)]">
                  Best {formatScore(Number(samplePeak.toFixed(1)))}/10
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          {phase !== "playing" && (
            <div className="flex flex-col gap-2">
              <Button
                block
                size="lg"
                onClick={startRound}
                iconLeft={<Camera size={18} />}
                disabled={localCameraStatus !== "ready"}
              >
                {localCameraStatus === "ready"
                  ? phase === "results" ? "Try again" : "Start scan"
                  : localCameraStatus === "error" ? "Camera unavailable" : "Waiting for camera…"}
              </Button>
              <Button block variant="secondary" onClick={nextEmoji} iconLeft={<Refresh size={16} />}>
                New emoji
              </Button>
            </div>
          )}
        </aside>
      </main>

      {/* History — scattered, sticker-shadowed chips */}
      <footer className="z-30 w-full min-w-0 border-t-[3px] border-[var(--charcoal)] bg-[var(--off-white)] px-3 py-3 sm:px-6">
        <div className="mx-auto flex min-w-0 max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="eyebrow">Recent</span>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {history.length === 0 ? (
              <span className="text-xs text-[var(--on-surface-variant)]">
                No attempts yet. Your last 50 scores are stored on this device.
              </span>
            ) : (
              history.slice(0, 6).map((entry) => (
                <HistoryChip key={entry.ts} entry={entry} />
              ))
            )}
          </div>
        </div>
      </footer>

      <AnimatePresence>
        {phase === "results" && (
          <ResultCard result={result} score={finalScore} onContinue={nextEmoji} onRetry={startRound} />
        )}
      </AnimatePresence>
    </div>
  );
}

function EmojiCard({ emoji }: { emoji: string; active: boolean }) {
  return (
    <motion.div
      layout
      className={cn(
        // Target emoji scales up on desktop so it doesn't look like a
        // postage stamp next to a 1000+ px wide camera frame.
        "flex aspect-square w-full max-w-[180px] items-center justify-center rounded-2xl border-[4px] border-[var(--ink-shadow)] on-accent bg-[var(--yellow)] min-[420px]:max-w-[220px] sm:max-w-[240px] lg:max-w-[280px] xl:max-w-[300px]",
        "shadow-[6px_6px_0_0_var(--charcoal)]",
        "tilt-r-1",
      )}
      aria-label={`Target emoji: ${emoji}`}
    >
      <EmojiPromptMotion
        emoji={emoji}
        className="text-6xl min-[420px]:text-7xl sm:text-8xl lg:text-9xl"
        wrapperClassName="-rotate-3"
        burstTone="pink"
      />
    </motion.div>
  );
}

function HistoryChip({ entry }: { entry: SoloHistoryEntry }) {
  const tone =
    entry.score >= 8 ? "purple" : entry.score >= 5 ? "yellow" : "pink";
  const chipClass =
    tone === "purple"
      ? "on-accent-inverse bg-[var(--purple)] text-[var(--ink)] border-[var(--ink-shadow)]"
      : tone === "yellow"
        ? "on-accent bg-[var(--yellow)] text-[var(--ink)] border-[var(--ink-shadow)]"
        : "on-accent bg-[var(--pink)] text-[var(--ink)] border-[var(--ink-shadow)]";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-[2px] px-2.5 py-1 text-xs font-bold",
        "shadow-[2px_2px_0_0_var(--charcoal)]",
        chipClass,
      )}
    >
      <span aria-hidden><WebEmoji emoji={entry.emoji} /></span>
      <span className="font-mono tabular">{entry.score.toFixed(1)}</span>
    </span>
  );
}

function ResultCard({
  result,
  score,
  onContinue,
  onRetry,
}: {
  result: ReturnType<typeof soloResult>;
  score: number | null;
  onContinue: () => void;
  onRetry: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto overscroll-contain bg-[var(--ink-overlay)] p-3 sm:items-center sm:p-4"
    >
      <motion.div
        initial={{ y: 18, opacity: 0, scale: 0.95, rotate: -1.5 }}
        animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 22, delay: 0.05 }}
        className="my-auto flex w-full min-w-0 max-w-md flex-col items-center gap-3 rounded-3xl border-[4px] border-[var(--charcoal)] bg-[var(--off-white-2)] p-4 text-center shadow-[8px_8px_0_0_var(--charcoal)] sm:gap-4 sm:p-9 sm:shadow-[10px_10px_0_0_var(--charcoal)]"
      >
        <span className="eyebrow">Round result</span>
        <h2
          className="font-display text-[clamp(2.25rem,6vw,3.5rem)] font-bold leading-[1.05] tracking-tight"
          style={{ color: result.tone }}
        >
          {result.label}
        </h2>
        <div className="flex items-end gap-2">
          <span className="font-display text-5xl font-bold leading-none tabular tracking-tight text-[var(--charcoal)] sm:text-6xl">
            {formatScore(score)}
          </span>
          <span className="mb-2 text-xl text-[var(--on-surface-variant)]">/10</span>
        </div>
        <p className="max-w-md text-sm leading-relaxed text-[var(--on-surface-variant)]">
          {result.sub}
        </p>
        <div className="mt-2 flex w-full flex-col items-center justify-center gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
          <Button className="w-full sm:w-auto" onClick={onRetry} iconLeft={<Refresh size={16} />}>Try again</Button>
          <Button className="w-full sm:w-auto" variant="secondary" onClick={onContinue} iconLeft={<Sparkle size={16} />}>New emoji</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
