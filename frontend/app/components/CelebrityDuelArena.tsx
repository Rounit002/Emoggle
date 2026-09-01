"use client";

/**
 * CelebrityDuelArena
 * ------------------
 * Production UI for the Celebrity Face Mimic mode. Plays through
 * the EXISTING stranger matchmaking pipeline (the same
 * `useMatchmaking` hook + Socket.io + PeerJS transport the emoji
 * duel uses). The server now always attaches a `celebrity` field
 * to `match_started` so the arena can:
 *
 *  1. Display the celebrity image as the round target instead
 *     of an emoji.
 *  2. Use the celebrity expression scorer (peak-based scoring
 *     against a normalized facial feature profile).
 *  3. Render the celebrity-themed result screen + share card.
 *
 * No VIP / paywall logic remains. Play Now goes straight into
 * the regular stranger queue.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import VideoPanel from "./VideoPanel";
import ChatBox from "./ChatBox";
import { useUserProfile } from "../context/UserProfileContext";
import { usePlayerName } from "../context/PlayerNameContext";
import { useCountry } from "../context/CountryContext";
import { useMatchmaking, type MatchResult } from "../hooks/useMatchmaking";
import { useCelebrityExpressionScorer } from "../hooks/useCelebrityExpressionScorer";
import { useStableScoreSampler, isValidScoreSample } from "../hooks/useStableScoreSampler";
import {
  pushPeakSample,
  createPeakAccumulator,
  finalizePeakScore,
  type PeakScoreAccumulator,
  resolveExpressionProfile,
  type CelebrityTarget,
  type ExpressionProfile,
} from "../lib/celebrityScoring";
import { CelebrityResultScreen, type CelebrityResultLike } from "./CelebrityResultScreen";
import { Logo, Pill, LobbyOverlay, ThemeToggle, ArrowLeft, Timer, cn } from "../ui";
import { flagFromAnyOrFallback } from "../lib/country";

const ROUND_SECONDS = 10;

type AppPhase = "lobby" | "matched" | "countdown" | "playing" | "results";

interface CelebrityDuelArenaProps {
  onBack: () => void;
}

function toTenPoint(raw: number | null): number | null {
  if (raw === null) return null;
  return Math.max(0, Math.min(10, Number(raw.toFixed(2))));
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(10, score));
}

function emptyCelebrityTarget(): CelebrityTarget {
  return {
    id: 0,
    name: "Celebrity",
    category: "celebrity",
    imageUrl: "",
    difficulty: "medium",
    expressionProfile: null,
  };
}

function buildResult(
  matchResult: MatchResult | null,
  target: CelebrityTarget | null,
  myName: string | null,
  partnerName: string | null,
  myFlag: string,
  partnerFlag: string,
): CelebrityResultLike | null {
  if (!matchResult) return null;
  const outcome: CelebrityResultLike["outcome"] =
    matchResult.winner === "tie"
      ? "draw"
      : matchResult.winner === "you"
        ? "win"
        : "loss";
  return {
    myScore: matchResult.myScore,
    opponentScore: matchResult.partnerScore,
    outcome,
    playerName: myName ?? "ME",
    opponentName: partnerName ?? null,
    playerFlag: myFlag,
    opponentFlag: partnerFlag,
    matchId: matchResult.matchId,
    celebrity: {
      id: target?.id ?? null,
      name: target?.name ?? "Celebrity",
      imageUrl: target?.imageUrl ?? "",
      category: target?.category ?? null,
      difficulty: target?.difficulty ?? null,
    },
  };
}

export default function CelebrityDuelArena({ onBack }: CelebrityDuelArenaProps) {
  const webcamRef = useRef<HTMLVideoElement>(null);
  const peakAccumulatorRef = useRef<PeakScoreAccumulator>(createPeakAccumulator());
  const submittedRef = useRef(false);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [phase, setPhase] = useState<AppPhase>("lobby");
  const [roundSeconds, setRoundSeconds] = useState(ROUND_SECONDS);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [imageLoadError, setImageLoadError] = useState(false);

  const { profile, saveProfile, sessionToken } = useUserProfile();
  const { name: myName } = usePlayerName();
  const { country: detectedCountry } = useCountry();
  const myCountry = useMemo(
    () => (detectedCountry ? detectedCountry.display : null),
    [detectedCountry]
  );
  const myCountryCode = detectedCountry?.countryCode ?? null;

  // Use the existing stranger matchmaking pipeline. The server
  // now attaches a `celebrity` field to `match_started` so this
  // single hook drives both the emoji duel and the celebrity arena.
  const {
    status,
    remoteStream,
    countdown,
    partnerLiveScore,
    matchResult,
    currentCelebrity,
    emojiLocked,
    submitScore,
    submitLiveScore,
    skipUser,
    stopMatching,
    startMatching,
    partnerName,
    partnerCountry,
    partnerCountryCode,
    localPeerId,
    partnerPeerId,
    messages,
    sendChat,
    rivalTyping,
    sendTyping,
    currentMatchId,
  } = useMatchmaking(
    localStream,
    myName,
    myCountry,
    myCountryCode,
    profile,
    saveProfile,
    sessionToken,
    "celebrity",
  );

  // The celebrity target is passed in the `match_started` payload
  // alongside the emoji. We use the celebrity when present, and
  // fall back to a placeholder so the UI doesn't blow up while
  // we're still waiting for the first match.
  const target: CelebrityTarget = useMemo(() => {
    const base = emptyCelebrityTarget();
    if (!matchResult) return base;
    // The match_result payload also carries the celebrity ref
    // (server attaches it for every round in this build), so we
    // can hydrate the target from either place.
    return {
      ...base,
      id: matchResult.celebrity?.id ?? base.id,
      name: matchResult.celebrity?.name ?? base.name,
    };
  }, [matchResult]);

  const expressionProfile: ExpressionProfile | null = useMemo(() => {
    const source = currentCelebrity ?? target;
    return source ? resolveExpressionProfile(source) : null;
  }, [currentCelebrity, target]);

  /* Stable-interval sampler — runs while we have a valid score. */
  const expressionRef = useRef<ReturnType<typeof useCelebrityExpressionScorer> | null>(null);

  const {
    start: startScoreSampling,
    stop: stopScoreSampling,
    reset: resetScoreSampling,
    getCurrent: getCurrentScoreSamples,
  } = useStableScoreSampler(
    () => {
      const expression = expressionRef.current;
      if (!expression) return null;
      return {
        score: expression.score,
        valid: isValidScoreSample(expression.score, expression.status),
      };
    },
    { intervalMs: 100 },
  );

  const publishLiveScore = useCallback(
    (rawScore: number) => {
      const tenPointScore = toTenPoint(rawScore);
      if (tenPointScore !== null) submitLiveScore(tenPointScore);
    },
    [submitLiveScore]
  );

  const expression = useCelebrityExpressionScorer(
    webcamRef,
    expressionProfile,
    phase === "playing",
    publishLiveScore,
  );

  useEffect(() => {
    expressionRef.current = expression;
  }, [expression]);

  const liveScore = toTenPoint(expression.score);

  /* Reset transient UI state when a new match starts. */
  useEffect(() => {
    if (status === "matched") {
      peakAccumulatorRef.current = createPeakAccumulator();
      submittedRef.current = false;
      setFinalScore(null);
      setImageLoadError(false);
      setPhase("matched");
      setRoundSeconds(ROUND_SECONDS);
    }
  }, [status, currentMatchId]);

  /* Reset to lobby when we leave matchmaking. */
  useEffect(() => {
    if (
      status === "waiting" ||
      status === "idle" ||
      status === "connecting" ||
      status === "stopped"
    ) {
      peakAccumulatorRef.current = createPeakAccumulator();
      submittedRef.current = false;
      setFinalScore(null);
      setImageLoadError(false);
      setPhase("lobby");
      setRoundSeconds(ROUND_SECONDS);
    }
  }, [status]);

  /* Phase transitions driven by the server-controlled countdown. */
  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      setPhase("countdown");
    } else {
      peakAccumulatorRef.current = createPeakAccumulator();
      submittedRef.current = false;
      setFinalScore(null);
      startScoreSampling();
      setPhase("playing");
    }
  }, [countdown, startScoreSampling]);

  /* Stop the sampler when we leave the playing phase. */
  useEffect(() => {
    if (phase !== "playing") {
      stopScoreSampling();
    }
    return stopScoreSampling;
  }, [phase, stopScoreSampling]);

  /* Push the latest valid frame into the peak accumulator. The
   * scorer already throttles its onScore callback, so this is
   * a single read-per-frame. */
  useEffect(() => {
    if (phase !== "playing") return;
    if (expression.status !== "ready") return;
    if (expression.score === null || !Number.isFinite(expression.score)) return;
    peakAccumulatorRef.current = pushPeakSample(peakAccumulatorRef.current, expression.score);
  }, [phase, expression.status, expression.score]);

  /* Webcam acquisition — request audio last (mics are more likely
   * to be permission-blocked than cameras, and audio isn't required
   * for the mimic). */
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 1280, height: 720 }, audio: true })
      .then((mediaStream) => {
        stream = mediaStream;
        setLocalStream(mediaStream);
      })
      .catch(() => {
        navigator.mediaDevices
          .getUserMedia({ video: { width: 1280, height: 720 }, audio: false })
          .then((mediaStream) => {
            stream = mediaStream;
            setLocalStream(mediaStream);
          })
          .catch((err) => console.error("[Camera]", err));
      });
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  /* Finalize the local round — push the current peak sample, submit
   * the canonical peak score, lock the result UI. */
  const finalizeLocalRound = useCallback(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    stopScoreSampling();
    const snapshot = getCurrentScoreSamples();
    // Prefer the server-visible peak sample so the result the
    // client renders matches the score the server already
    // tallied from `live_score` events. The peak is the
    // player's best moment during the round.
    const finalPeak = finalizePeakScore(peakAccumulatorRef.current);
    const safeFinal = clampScore(finalPeak);
    void snapshot;
    setFinalScore(safeFinal);
    submitScore(safeFinal);
    submitLiveScore(safeFinal);
    setPhase("results");
  }, [getCurrentScoreSamples, stopScoreSampling, submitLiveScore, submitScore]);

  /* 10s client-side scan timer. The server fires
   * `emoji_locked` to mark the open, then waits for the submission
   * or the grace deadline. */
  useEffect(() => {
    if (phase !== "playing") return;
    let secondsLeft = ROUND_SECONDS;
    const timer = window.setInterval(() => {
      secondsLeft -= 1;
      setRoundSeconds(Math.max(0, secondsLeft));
      if (secondsLeft <= 0) {
        window.clearInterval(timer);
        finalizeLocalRound();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [finalizeLocalRound, phase]);

  const handleRetry = useCallback(() => {
    resetScoreSampling();
    startMatching();
  }, [resetScoreSampling, startMatching]);

  const handleCancelSearch = useCallback(() => {
    stopScoreSampling();
    stopMatching();
    onBack();
  }, [onBack, stopMatching, stopScoreSampling]);

  const myFlag = flagFromAnyOrFallback(myCountry, myCountryCode);
  const partnerFlag = flagFromAnyOrFallback(partnerCountry, partnerCountryCode);
  const inMatch = status === "matched";

  const resolvedResult = matchResult
    ? buildResult(
        matchResult,
        currentCelebrity ?? target,
        myName,
        partnerName,
        myFlag,
        partnerFlag
      )
    : null;

  const safeTarget: CelebrityTarget = currentCelebrity ?? target;

  return (
    <div className="relative flex min-h-screen w-screen flex-col bg-[var(--off-white)] text-[var(--charcoal)]">
      <header className="z-30 flex flex-none items-center justify-between gap-2 border-b-[3px] border-[var(--charcoal)] bg-[var(--off-white)] px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--charcoal)] transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--charcoal)]"
            aria-label="Back to home"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Back</span>
          </button>
          <span className="hidden h-5 w-px bg-[var(--ink-soft)] sm:inline-block" />
          <Logo size="sm" />
          <Pill tone="pink">Celebrity Mode</Pill>
        </div>
        <div className="flex items-center gap-3 text-xs sm:text-sm">
          {inMatch && phase === "playing" && (
            <Pill tone="yellow">
              <Timer size={12} />
              {roundSeconds}s
            </Pill>
          )}
          <ThemeToggle size="sm" />
        </div>
      </header>

      <main
        className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-4 lg:gap-6 lg:p-6"
        aria-label="Celebrity duel arena"
      >
        <CelebrityHero
          target={safeTarget}
          phase={phase}
          myName={myName}
          partnerName={partnerName}
          partnerFlag={partnerFlag}
          myFlag={myFlag}
          liveScore={liveScore}
          partnerLiveScore={partnerLiveScore}
          imageLoadError={imageLoadError}
          onImageError={() => setImageLoadError(true)}
        />

        <div className="relative grid flex-none grid-cols-1 gap-3 sm:min-h-[360px] sm:grid-cols-2 sm:gap-4 lg:min-h-[420px]">
          <VideoPanel
            ref={webcamRef}
            label="YOU"
            isLocal
            playerName={myName ?? "You"}
            country={myCountry}
            countryCode={myCountryCode}
            rankLabel="Celebrity Mode"
            localStream={localStream}
            autoAcquireLocalStream={false}
            scanBox={expression.faceBox}
            faceLandmarks={expression.faceLandmarks}
            isPlaying={phase === "playing"}
            isRevealing={false}
            liveScore={liveScore}
            opponentLiveScore={partnerLiveScore}
            scoreAlign="right"
          />
          <VideoPanel
            label="RIVAL"
            isLocal={false}
            playerName={partnerName ?? "Rival"}
            country={partnerCountry}
            countryCode={partnerCountryCode}
            rankLabel="Celebrity Mode"
            remoteStream={remoteStream}
            isPlaying={phase === "playing"}
            isRevealing={false}
            liveScore={partnerLiveScore}
            opponentLiveScore={liveScore}
            scoreAlign="left"
          />
        </div>

        {inMatch && (
          <div className="mt-2 flex w-full justify-center sm:mt-4">
            <ChatBox
              messages={messages}
              onSend={sendChat}
              onTyping={sendTyping}
              rivalTyping={rivalTyping}
            />
          </div>
        )}

        <AnimatePresence>
          {(phase === "lobby" || (status === "waiting" && !inMatch)) && (
            <LobbyOverlay
              status={status}
              onCancel={handleCancelSearch}
              onRetry={handleRetry}
            />
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {countdown !== null && countdown > 0 && phase === "countdown" && (
          <motion.div
            key="cd"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/35 backdrop-blur-sm"
            aria-live="polite"
            aria-label={`Round starts in ${countdown}`}
          >
            <motion.div
              key={countdown}
              initial={{ scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="text-[10rem] font-black text-white leading-none drop-shadow-[0_0_60px_rgba(255,255,255,0.6)]"
              style={{ textShadow: "0 0 80px rgba(168,85,247,0.7)" }}
            >
              {countdown}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {phase === "results" && (
        <CelebrityResultScreen
          result={resolvedResult}
          onPlayAgain={handleRetry}
          onLeave={onBack}
          selfLabel={myName ?? "ME"}
          rivalLabel={partnerName ?? "RIVAL"}
        />
      )}
    </div>
  );
}

/* ─── Celebrity hero (target reference card) ─────────────────────── */

interface CelebrityHeroProps {
  target: CelebrityTarget;
  phase: AppPhase;
  myName: string | null;
  partnerName: string | null;
  myFlag: string;
  partnerFlag: string;
  liveScore: number | null;
  partnerLiveScore: number | null;
  imageLoadError: boolean;
  onImageError: () => void;
}

function CelebrityHero({
  target,
  phase,
  myName,
  partnerName,
  myFlag,
  partnerFlag,
  liveScore,
  partnerLiveScore,
  imageLoadError,
  onImageError,
}: CelebrityHeroProps) {
  const showScores = phase === "playing" || phase === "results";
  return (
    <div className="relative flex flex-col gap-3 rounded-3xl border-[4px] border-[var(--charcoal)] bg-[var(--off-white-2)] p-3 shadow-[6px_6px_0_0_var(--charcoal)] sm:flex-row sm:items-center sm:gap-4 sm:p-4">
      <div className="flex items-center gap-3 sm:gap-4">
        <div
          className={cn(
            "relative flex h-20 w-20 flex-none items-center justify-center overflow-hidden rounded-2xl border-[3px] border-[var(--charcoal)] bg-[var(--yellow)] shadow-[3px_3px_0_0_var(--charcoal)] sm:h-24 sm:w-24",
            phase === "countdown" && "animate-pulse"
          )}
          aria-hidden={imageLoadError}
        >
          {imageLoadError || !target.imageUrl ? (
            <span className="text-3xl sm:text-4xl">🏆</span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={target.imageUrl}
              alt={target.name}
              loading="eager"
              onError={onImageError}
              crossOrigin="anonymous"
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--on-surface-variant)]">
            Imitate this face
          </span>
          <span className="truncate font-display text-xl font-bold tracking-tight sm:text-2xl">
            {target.name || "Loading…"}
          </span>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {target.category && (
              <Pill tone="purple" small>
                {target.category}
              </Pill>
            )}
            {target.difficulty && (
              <Pill tone={difficultyTone(target.difficulty)} small>
                {target.difficulty}
              </Pill>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-end gap-3 sm:gap-4">
        {showScores && (
          <ScoreBadge
            label={myName ?? "YOU"}
            flag={myFlag}
            score={liveScore}
            tone="purple"
          />
        )}
        <span
          aria-hidden
          className="hidden h-10 w-10 items-center justify-center rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--yellow)] text-xs font-black uppercase text-[var(--charcoal)] shadow-[2px_2px_0_0_var(--charcoal)] sm:flex"
        >
          vs
        </span>
        {showScores && (
          <ScoreBadge
            label={partnerName ?? "RIVAL"}
            flag={partnerFlag}
            score={partnerLiveScore}
            tone="pink"
          />
        )}
      </div>
    </div>
  );
}

function difficultyTone(difficulty: string): "yellow" | "purple" | "pink" {
  if (difficulty === "easy") return "yellow";
  if (difficulty === "hard") return "pink";
  return "purple";
}

function ScoreBadge({
  label,
  flag,
  score,
  tone,
}: {
  label: string;
  flag: string;
  score: number | null;
  tone: "purple" | "pink";
}) {
  const fill =
    tone === "purple"
      ? "bg-[var(--purple)] text-[var(--off-white)]"
      : "bg-[var(--pink)] text-[var(--charcoal)]";
  return (
    <div
      className={cn(
        "flex min-w-[100px] flex-col items-center gap-0.5 rounded-2xl border-[2px] border-[var(--charcoal)] px-3 py-1.5 text-center shadow-[2px_2px_0_0_var(--charcoal)] sm:min-w-[120px]",
        fill
      )}
    >
      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em]">
        <span aria-hidden className="text-sm leading-none">
          {flag}
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span className="font-display text-2xl font-bold leading-none tabular sm:text-3xl">
        {score == null ? "—" : score.toFixed(1)}
      </span>
    </div>
  );
}
