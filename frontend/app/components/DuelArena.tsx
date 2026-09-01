"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import VideoPanel from "./VideoPanel";
import ChatBox from "./ChatBox";
import { useMatchmaking } from "../hooks/useMatchmaking";
import { useExpressionScorer } from "../hooks/useExpressionScorer";
import { isValidScoreSample, useStableScoreSampler } from "../hooks/useStableScoreSampler";
import { useUserProfile } from "../context/UserProfileContext";
import { usePlayerName } from "../context/PlayerNameContext";
import { useCountry } from "../context/CountryContext";
import { ResultScreen, type MatchResultLike } from "./result";
import {
  Button,
  IconButton,
  Logo,
  Pill,
  LobbyOverlay,
  Seam,
  ThemeToggle,
  ArrowLeft,
  Camera,
  Mic,
  MicOff,
  Refresh,
  Sparkle,
  Timer,
  seatForIds,
  seatStyle,
  cn,
  type Seat,
} from "../ui";
import {
  appendMatchHistory,
  computeStats,
  setStats as setStoredStats,
  type MatchHistoryEntry,
} from "../lib/storage";
import { flagFromAnyOrFallback } from "../lib/country";

const ROUND_SECONDS = 10;

type AppPhase = "lobby" | "dueling" | "countdown" | "playing" | "results";

interface DuelArenaProps {
  onBack: () => void;
}

interface RankSnapshot {
  tier: string;
  elo: number;
  delta: number | null;
}

const DEFAULT_RANK: RankSnapshot = { tier: "Bronze", elo: 400, delta: null };

function toTenPoint(rawScore: number | null) {
  if (rawScore === null) return null;
  return Math.max(0, Math.min(10, Number(rawScore.toFixed(2))));
}

function formatRank(rank: RankSnapshot) {
  return `${rank.tier} · ${rank.elo} ELO`;
}

function formatDelta(delta: number | null) {
  if (delta === null) return "";
  return `${delta >= 0 ? "+" : ""}${delta}`;
}

function finiteOr(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Shape the matchmaking hook's `MatchResult` (and the local scores
 * we already have) into the `MatchResultLike` shape consumed by
 * `ResultScreen`.
 */
function buildMatchResult(args: {
  matchResult: import("../hooks/useMatchmaking").MatchResult | null;
  emoji: string | null;
  myName: string | null;
  partnerName: string | null;
  myFlag: string;
  partnerFlag: string;
}): MatchResultLike | null {
  const { matchResult, emoji, myName, partnerName, myFlag, partnerFlag } = args;
  if (!matchResult) return null;

  const outcome: MatchResultLike["outcome"] =
    matchResult.winner === "tie"
      ? "draw"
      : matchResult.winner === "you"
        ? "win"
        : "loss";

  return {
    myScore: matchResult.myScore,
    opponentScore: matchResult.partnerScore,
    emoji,
    outcome,
    playerName: myName ?? "ME",
    opponentName: partnerName ?? null,
    playerFlag: myFlag,
    opponentFlag: partnerFlag,
    matchId: matchResult.matchId,
  };
}

export default function DuelArena({ onBack }: DuelArenaProps) {
  const webcamRef = useRef<HTMLVideoElement>(null);
  const submittedRef = useRef(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [phase, setPhase] = useState<AppPhase>("lobby");
  const [roundSeconds, setRoundSeconds] = useState(ROUND_SECONDS);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [searchSession, setSearchSession] = useState(0);
  const [noOneFound, setNoOneFound] = useState(false);
  const [myRank, setMyRank] = useState<RankSnapshot>(DEFAULT_RANK);
  const [partnerRank, setPartnerRank] = useState<RankSnapshot>(DEFAULT_RANK);
  const { profile, saveProfile, sessionToken } = useUserProfile();
  const { name: myName } = usePlayerName();
  const { country: detectedCountry } = useCountry();
  // The locally-detected country ("🇮🇳 India" or null). Used as
  // the player's own flag on the tile. The partner's flag is
  // supplied by the server in `match_started` from the partner's
  // own edge-headers or, when the server doesn't trust the geo
  // header, the partner's own client-side detection.
  const myCountry = useMemo(() => {
    if (detectedCountry) return detectedCountry.display;
    // Fall back to the existing /api/geo response for symmetry
    // with the partner side. Populated by the effect below.
    return null;
  }, [detectedCountry]);
  // Canonical 2-letter ISO code. The wire format the signaling
  // server relays to the partner, and what the partner's tile
  // uses to render the flag. Sending the code (not the display
  // string) means a sender with a glitched display string can
  // never make the partner see "IN" where they should see 🇮🇳.
  const myCountryCode = detectedCountry?.countryCode ?? null;

  // Holds the latest expression-scorer output so the stable
  // sampler can read it without re-subscribing on every render.
  // Populated after `useExpressionScorer` returns below.
  const expressionRef = useRef<ReturnType<typeof useExpressionScorer> | null>(null);

  // Stable-interval sample collection. Runs a 100ms tick during
  // the `playing` phase, only counting valid face-detection
  // samples. The final 10-second score is the mean of every
  // sample we managed to collect — never a single frame, never
  // the last value the scorer happened to report.
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

  const {
    status,
    remoteStream,
    countdown,
    partnerLiveScore,
    matchResult,
    emojiPrompt,
    emojiLocked,
    submitScore,
    submitLiveScore,
    skipUser,
    stopMatching,
    startMatching,
    requestChangeEmoji,
    partnerName,
    partnerCountry,
    partnerCountryCode,
    localPeerId,
    partnerPeerId,
    messages,
    sendChat,
    rivalTyping,
    sendTyping,
    reportPartner,
    currentMatchId,
  } = useMatchmaking(
    localStream,
    myName,
    myCountry,
    myCountryCode,
    profile,
    saveProfile,
    sessionToken,
  );

  const mySeat: Seat = useMemo(
    () => seatForIds(localPeerId, partnerPeerId),
    [localPeerId, partnerPeerId],
  );
  const rivalSeat: Seat = mySeat === "a" ? "b" : "a";
  const mine = seatStyle(mySeat);
  const rival = seatStyle(rivalSeat);

  const publishLiveScore = useCallback(
    (rawScore: number) => {
      const tenPointScore = toTenPoint(rawScore);
      if (tenPointScore !== null) submitLiveScore(tenPointScore);
    },
    [submitLiveScore],
  );

  const expression = useExpressionScorer(
    webcamRef,
    emojiPrompt,
    phase === "playing",
    publishLiveScore,
  );

  // Keep the stable sampler pointed at the freshest scorer state.
  // Synced in an effect (not during render) so the React 19
  // `react-hooks/refs` rule is happy and the interval callback
  // never sees a stale value.
  useEffect(() => {
    expressionRef.current = expression;
  }, [expression]);

  const liveScore = toTenPoint(expression.score);

  // Drive the sampler off the active phase. `start()` resets any
  // prior run, so consecutive rounds don't share samples.
  useEffect(() => {
    if (phase === "playing") {
      startScoreSampling();
    } else {
      stopScoreSampling();
    }
    return stopScoreSampling;
  }, [phase, startScoreSampling, stopScoreSampling]);

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

  useEffect(() => {
    if (status === "matched") {
      setPhase("dueling");
      setRoundSeconds(ROUND_SECONDS);
      setFinalScore(null);
      setPartnerRank(DEFAULT_RANK);
      resetScoreSampling();
      submittedRef.current = false;
    }
  }, [status, emojiPrompt, resetScoreSampling]);

  useEffect(() => {
    if (status === "waiting" || status === "idle" || status === "connecting" || status === "stopped") {
      setPhase("lobby");
      setRoundSeconds(ROUND_SECONDS);
      setFinalScore(null);
      resetScoreSampling();
      submittedRef.current = false;
    }
  }, [status, resetScoreSampling]);

  useEffect(() => {
    if (status !== "waiting") {
      setNoOneFound(false);
      return;
    }
    setNoOneFound(false);
    const timer = setTimeout(() => setNoOneFound(true), 6000);
    return () => clearTimeout(timer);
  }, [status, searchSession]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      setPhase("countdown");
    } else {
      setRoundSeconds(ROUND_SECONDS);
      setFinalScore(null);
      resetScoreSampling();
      submittedRef.current = false;
      setPhase("playing");
    }
  }, [countdown, resetScoreSampling]);

  useEffect(() => {
    if (!matchResult) return;
    setMyRank({
      tier: matchResult.myTier || DEFAULT_RANK.tier,
      elo: finiteOr(matchResult.myElo, DEFAULT_RANK.elo),
      delta:
        typeof matchResult.myEloDelta === "number" && Number.isFinite(matchResult.myEloDelta)
          ? matchResult.myEloDelta
          : null,
    });
    setPartnerRank({
      tier: matchResult.partnerTier || DEFAULT_RANK.tier,
      elo: finiteOr(matchResult.partnerElo, DEFAULT_RANK.elo),
      delta:
        typeof matchResult.partnerEloDelta === "number" && Number.isFinite(matchResult.partnerEloDelta)
          ? matchResult.partnerEloDelta
          : null,
    });
  }, [matchResult]);

  // Persist completed duels to local history.
  //
  // Storage key moved from `emoggle:duel-history` to
  // `emoggle_match_history` as part of the namespaced localStorage
  // pass. The new key path is in `app/lib/storage.ts`, which also
  // performs a one-shot migration from the legacy colon-form key
  // the first time the new key is read.
  useEffect(() => {
    if (!matchResult) return;
    if (typeof window === "undefined") return;
    const entry: MatchHistoryEntry = {
      id: matchResult.matchId,
      ts: Date.now(),
      mySeat,
      myScore: matchResult.myScore,
      rivalScore: matchResult.partnerScore,
      winner: matchResult.winner,
      myTier: matchResult.myTier || DEFAULT_RANK.tier,
      myElo: finiteOr(matchResult.myElo, DEFAULT_RANK.elo),
      myDelta:
        typeof matchResult.myEloDelta === "number" && Number.isFinite(matchResult.myEloDelta)
          ? matchResult.myEloDelta
          : null,
    };
    const next = appendMatchHistory(entry);
    // Recompute aggregate stats from the freshly-appended list.
    // The solo history is also included so a single number
    // captures the player's overall best / average.
    setStoredStats(computeStats(next));
  }, [matchResult, mySeat]);

  const finalizeLocalRound = useCallback(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;

    // Freeze the round before reading it. The ref-backed snapshot
    // includes the most recent interval tick even if React has not
    // rendered that state update yet.
    stopScoreSampling();
    const snapshot = getCurrentScoreSamples();
    const averageScore = snapshot.sampleCount > 0 ? snapshot.average : 0;
    const score = Number(averageScore.toFixed(1));

    // Keep the locally calculated value immutable for diagnostics and
    // the waiting UI. The visible verdict waits for `match_result`,
    // whose scores are server-normalized and mapped per player.
    setFinalScore(score);
    submitScore(score);
    submitLiveScore(score);
    setPhase("results");
  }, [getCurrentScoreSamples, stopScoreSampling, submitLiveScore, submitScore]);

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

  const resolvedFinalScore = matchResult?.myScore ?? finalScore;
  const resolvedPartnerScore = matchResult?.partnerScore ?? null;
  const myFlag = flagFromAnyOrFallback(myCountry, myCountryCode);
  const partnerFlag = flagFromAnyOrFallback(partnerCountry, partnerCountryCode);

  const remoteDisplayStream =
    remoteStream ??
    (typeof window !== "undefined" &&
    ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) &&
    status === "matched"
      ? localStream
      : null);

  const handleRetry = useCallback(() => {
    setSearchSession((s) => s + 1);
    startMatching();
  }, [startMatching]);

  const handleStartMatching = useCallback(() => {
    startMatching();
  }, [startMatching]);

  const handleCancelSearch = useCallback(() => {
    stopMatching();
    onBack();
  }, [onBack, stopMatching]);

  /* Report flow — the ChatBox calls this when the user confirms
     they want to flag the current partner. The hook does the
     actual socket emit (`report_player`); we just attach a local
     breadcrumb here so the dev console records it too. A real
     moderation table is a follow-up. */
  const handleReportPartner = useCallback(() => {
    reportPartner();
    if (typeof console !== "undefined") {
      console.info("[Chat] partner report submitted", {
        matchId: matchResult?.matchId ?? null,
        ts: Date.now(),
      });
    }
  }, [matchResult, reportPartner]);

  const toggleMic = useCallback(() => {
    if (!localStream) return;
    const next = !isMicMuted;
    localStream.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setIsMicMuted(next);
  }, [localStream, isMicMuted]);

  // The result modal is the only place final scores are shown. Keeping the
  // seam idle prevents a second score stack from sitting behind (or, on
  // narrow screens, above) the modal.
  const seamState: "idle" | "playing" | "revealing" =
    phase === "playing" ? "playing" : "idle";

  const inMatch = status === "matched";

  return (
    <div className="relative flex min-h-screen w-screen flex-col bg-[var(--off-white)] text-[var(--charcoal)]">
      {/* Top bar */}
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
          {inMatch && (
            <Pill tone={mySeat === "a" ? "purple" : "pink"}>
              You are {mine.name}
            </Pill>
          )}
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

      {/* Mobile: two inset camera cards with a dedicated emoji row.
          Desktop restores the side-by-side arena. */}
      <main
        className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-4 lg:gap-6 lg:p-6"
        aria-label="Duel arena"
      >
        {/* The seam is a real mobile grid row, so it cannot cover a face. */}
        <div className="relative grid flex-none grid-cols-1 grid-rows-[auto_auto_auto] gap-3 sm:min-h-[480px] sm:flex-1 sm:grid-cols-[1fr_auto_1fr] sm:grid-rows-1 sm:gap-4 lg:min-h-[520px]">
          {/* Player A column */}
          <DuelColumn
            seat="a"
            playerName={mySeat === "a" ? (myName ?? "You") : (partnerName ?? "Rival")}
            country={mySeat === "a" ? myCountry : partnerCountry}
            countryCode={mySeat === "a" ? myCountryCode : partnerCountryCode}
            rankLabel={mySeat === "a" ? formatRank(myRank) : formatRank(partnerRank)}
            liveScore={mySeat === "a" ? liveScore : partnerLiveScore}
            finalScore={mySeat === "a" ? resolvedFinalScore : resolvedPartnerScore}
            phase={phase}
            isLocal={mySeat === "a"}
            localStream={localStream}
            remoteStream={remoteDisplayStream}
            webcamRef={mySeat === "a" ? webcamRef : undefined}
            scanBox={mySeat === "a" ? expression.faceBox : null}
            faceLandmarks={mySeat === "a" ? expression.faceLandmarks : null}
            rivalLiveScore={mySeat === "a" ? partnerLiveScore : liveScore}
            onToggleMic={toggleMic}
            isMicMuted={isMicMuted}
          />

          {/* The seam */}
          <SeamColumn
            state={seamState}
            emoji={emojiPrompt}
            scoreA={mySeat === "a" ? (phase === "results" ? resolvedFinalScore : liveScore) : (phase === "results" ? resolvedPartnerScore : partnerLiveScore)}
            scoreB={mySeat === "a" ? (phase === "results" ? resolvedPartnerScore : partnerLiveScore) : (phase === "results" ? resolvedFinalScore : liveScore)}
            secondsLeft={phase === "playing" ? roundSeconds : null}
            emojiLocked={emojiLocked}
            onRequestChangeEmoji={requestChangeEmoji}
          />

          {/* Player B column */}
          <DuelColumn
            seat="b"
            playerName={rivalSeat === "a" ? (myName ?? "You") : (partnerName ?? "Rival")}
            country={rivalSeat === "a" ? myCountry : partnerCountry}
            countryCode={rivalSeat === "a" ? myCountryCode : partnerCountryCode}
            rankLabel={rivalSeat === "a" ? formatRank(myRank) : formatRank(partnerRank)}
            liveScore={rivalSeat === "a" ? liveScore : partnerLiveScore}
            finalScore={rivalSeat === "a" ? resolvedFinalScore : resolvedPartnerScore}
            phase={phase}
            isLocal={rivalSeat === "a"}
            localStream={localStream}
            remoteStream={remoteDisplayStream}
            webcamRef={rivalSeat === "a" ? webcamRef : undefined}
            scanBox={rivalSeat === "a" ? expression.faceBox : null}
            faceLandmarks={rivalSeat === "a" ? expression.faceLandmarks : null}
            rivalLiveScore={rivalSeat === "a" ? partnerLiveScore : liveScore}
            onToggleMic={toggleMic}
            isMicMuted={isMicMuted}
          />
        </div>

        {/* Chat panel — always below the cameras, full width, on
            every viewport. 300px is enough for the header +
            ~4 visible message rows + input + ephemeral-hint
            footer. Any overflow messages scroll inside the panel
            itself, so the section never grows. */}
        {inMatch && (
          <div className="mx-auto h-[72px] w-full max-w-[360px] flex-none sm:h-[300px] sm:max-w-none">
            <ChatBox
              messages={messages}
              onSend={sendChat}
              onTyping={sendTyping}
              rivalTyping={rivalTyping}
              partnerLabel={partnerName ?? "Stranger"}
              matchId={currentMatchId}
              onReport={handleReportPartner}
              compactOnMobile
            />
          </div>
        )}
      </main>

      {/* Lobby — the cream waiting state */}
      <AnimatePresence>
        {(phase === "lobby" || (status === "waiting" && !inMatch)) && !noOneFound && (
          <LobbyOverlay
            status={status}
            onCancel={handleCancelSearch}
            onRetry={handleRetry}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {status === "waiting" && noOneFound && (
          <NoMatchOverlay onRetry={handleRetry} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {status === "stopped" && (
          <PausedOverlay onStart={handleStartMatching} />
        )}
      </AnimatePresence>

      {/* Countdown — full-bleed, single spring-in per digit */}
      <AnimatePresence>
        {phase === "countdown" && countdown !== null && (
          <Countdown count={countdown} />
        )}
      </AnimatePresence>

      {/* Score reveal — page 5 lands this in final form */}
      <AnimatePresence>
        {phase === "results" && (
          <ResultScreen
            result={buildMatchResult({
              matchResult,
              emoji: emojiPrompt,
              myName,
              partnerName,
              myFlag,
              partnerFlag,
            })}
            onPlayAgain={handleRetry}
            onLeave={onBack}
            selfLabel={myName ?? "ME"}
            rivalLabel={partnerName ?? "STRANGER"}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* =====================================================================
   DuelColumn — one player's slot.
   ===================================================================== */

interface DuelColumnProps {
  seat: Seat;
  playerName: string;
  country: string | null;
  /**
   * 2-letter ISO country code (e.g. "IN"). When present, the
   * tile renders the flag via `isoFlag()` — the canonical path
   * that never falls back to the raw code. The `country` prop
   * is kept around for the bottom sticker-card variant.
   */
  countryCode: string | null;
  rankLabel: string;
  liveScore: number | null;
  finalScore: number | null;
  phase: AppPhase;
  isLocal: boolean;
  localStream: MediaStream | null | undefined;
  remoteStream: MediaStream | null | undefined;
  webcamRef: React.RefObject<HTMLVideoElement | null> | undefined;
  scanBox: ReturnType<typeof useExpressionScorer>["faceBox"];
  faceLandmarks: ReturnType<typeof useExpressionScorer>["faceLandmarks"];
  rivalLiveScore: number | null;
  onToggleMic: () => void;
  isMicMuted: boolean;
}

function DuelColumn({
  seat,
  playerName,
  country,
  countryCode,
  rankLabel,
  liveScore,
  finalScore,
  phase,
  isLocal,
  localStream,
  remoteStream,
  webcamRef,
  scanBox,
  faceLandmarks,
  rivalLiveScore,
  onToggleMic,
  isMicMuted,
}: DuelColumnProps) {
  const isA = seat === "a";
  const accent = isA ? "var(--purple)" : "var(--pink)";
  const accentText = isA ? "var(--purple-deep)" : "var(--pink-deep)";

  const isPlaying = phase === "playing" || phase === "results";
  const displayScore = phase === "results" ? finalScore : liveScore;
  const barValue = displayScore === null ? 0 : Math.max(0, Math.min(1, displayScore / 10));

  return (
    <div className="relative mx-auto flex h-auto w-full max-w-[360px] min-h-0 flex-col sm:mx-0 sm:h-full sm:max-w-none sm:gap-3">
      {/* Centered 4:3 mobile card; the tilted 16:9 card returns at sm+. */}
      <div
        className={cn(
          "relative aspect-[4/3] w-full flex-none overflow-hidden rounded-[1.75rem] border-[4px] bg-[var(--off-white-2)] shadow-[5px_5px_0_0_var(--charcoal)]",
          "sm:aspect-video sm:flex-none sm:rounded-3xl sm:border-[4px] sm:shadow-[8px_8px_0_0_var(--charcoal)]",
          isA
            ? "border-[var(--purple-deep)] sm:-rotate-[1.5deg]"
            : "border-[var(--pink-deep)] sm:rotate-[1.5deg]",
        )}
      >
        <VideoPanel
          ref={webcamRef}
          label={isLocal ? "YOU" : "STRANGER"}
          playerName={playerName}
          country={country}
          countryCode={countryCode}
          rankLabel={rankLabel}
          isLocal={isLocal}
          localStream={localStream ?? null}
          remoteStream={remoteStream ?? null}
          autoAcquireLocalStream={false}
          frozenFrame={null}
          liveScore={displayScore}
          score={finalScore}
          verdict={null}
          roast={null}
          isRevealing={false}
          isPlaying={isPlaying}
          isJudging={false}
          scoreAlign={isA ? "left" : "right"}
          opponentLiveScore={rivalLiveScore}
          scanBox={scanBox}
          faceLandmarks={faceLandmarks}
          fullBleedOnMobile
        />

        <div className="absolute bottom-3 left-3 z-40 inline-flex items-baseline gap-1.5 rounded-full border border-white/20 bg-black/70 px-3 py-1.5 text-white shadow-lg backdrop-blur-md sm:hidden">
          <span className="text-[9px] font-black uppercase tracking-[0.16em] text-white/70">Score</span>
          <span className="font-mono text-base font-black leading-none tabular-nums">
            {displayScore === null ? "--" : displayScore.toFixed(1)}
          </span>
          <span className="text-[9px] font-bold text-white/60">/10</span>
        </div>

        {isLocal && (
          <div className="absolute bottom-2.5 right-2.5 z-40 sm:hidden">
            <IconButton
              size="sm"
              variant={isMicMuted ? "default" : isA ? "purple" : "pink"}
              label={isMicMuted ? "Unmute microphone" : "Mute microphone"}
              onClick={onToggleMic}
            >
              {isMicMuted ? <MicOff size={16} /> : <Mic size={16} />}
            </IconButton>
          </div>
        )}

        {/* Desktop seat color tag; mobile identity comes from the outline. */}
        <span
          aria-hidden
          className={cn(
            "absolute bottom-3 right-3 z-30 hidden items-center gap-1.5 rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--off-white)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] shadow-[2px_2px_0_0_var(--charcoal)] sm:flex",
            isA
              ? "text-[var(--purple-deep)] sm:left-3 sm:right-auto"
              : "text-[var(--pink-deep)] sm:right-3",
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
          {isA ? "Violet" : "Pink"}
        </span>
      </div>

      {/* Full score controls stay below the camera on desktop only. */}
      <div className="relative z-40 hidden min-h-12 flex-none items-center gap-3 rounded-2xl border-[3px] border-[var(--charcoal)] bg-[var(--off-white-2)] px-3 py-2 shadow-[4px_4px_0_0_var(--charcoal)] sm:flex">
        {isLocal && (
          <IconButton
            size="sm"
            variant={isMicMuted ? "default" : isA ? "purple" : "pink"}
            label={isMicMuted ? "Unmute microphone" : "Mute microphone"}
            onClick={onToggleMic}
          >
            {isMicMuted ? <MicOff size={16} /> : <Mic size={16} />}
          </IconButton>
        )}
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3 font-mono text-[10px] tabular font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            <span style={{ color: accentText }}>{isA ? "Violet" : "Pink"}</span>
            <span>
              {displayScore === null ? "--" : displayScore.toFixed(1)}/10
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--off-white)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${barValue * 100}%`,
                background: accent,
                transition: "width 0.3s ease-out",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   SeamColumn
   ===================================================================== */

interface SeamColumnProps {
  state: "idle" | "playing" | "revealing";
  emoji: string | null;
  scoreA: number | null;
  scoreB: number | null;
  secondsLeft: number | null;
  /**
   * True once the server has fired `emoji_locked` — the scan
   * window is open and the target emoji is frozen. Drives the
   * disabled state of the change-emoji control.
   */
  emojiLocked: boolean;
  /**
   * Ask the server to swap the target emoji. The server decides
   * whether to actually do the swap; if the round is locked it's
   * a silent no-op and the local cooldown will still expire.
   */
  onRequestChangeEmoji: () => void;
}

/**
 * Minimum delay between emoji changes (ms). Backs both the
 * client-side cooldown and the effective minimum on the wire —
 * mashing the button faster than this just queues one request per
 * interval, no extra load on the server.
 */
const EMOJI_CHANGE_COOLDOWN_MS = 1500;

function SeamColumn({
  state,
  emoji,
  scoreA,
  scoreB,
  secondsLeft,
  emojiLocked,
  onRequestChangeEmoji,
}: SeamColumnProps) {
  // The button is only meaningful in the "playing" phase, which
  // here is the brief pre-scan window where both players can see
  // the target emoji but the round timer hasn't started yet. Once
  // emojiLocked flips true (server-driven), the control is dimmed
  // on both clients simultaneously.
  const showChangeEmoji = state === "playing" && !emojiLocked && emoji !== null;
  const [changeArmed, setChangeArmed] = useState(true);

  // Reset the cooldown whenever the target emoji changes — either
  // because the user just hit the button, or because the server
  // pushed a new one. This keeps the button armed for the next
  // possible swap.
  useEffect(() => {
    setChangeArmed(false);
    if (!showChangeEmoji) return;
    const t = window.setTimeout(() => setChangeArmed(true), EMOJI_CHANGE_COOLDOWN_MS);
    return () => window.clearTimeout(t);
  }, [emoji, showChangeEmoji]);

  const handleChangeEmoji = () => {
    if (!changeArmed || emojiLocked) return;
    setChangeArmed(false);
    onRequestChangeEmoji();
    // Re-arm after the cooldown in case the server didn't echo
    // back an emoji_changed (e.g. someone else already swapped).
    window.setTimeout(() => setChangeArmed(true), EMOJI_CHANGE_COOLDOWN_MS);
  };

  return (
    <div
      className="relative flex h-[72px] items-center justify-center sm:inset-auto sm:top-auto sm:z-auto sm:h-auto sm:items-stretch"
      aria-hidden={state === "idle"}
    >
      <div
        className="absolute left-1/2 top-3 bottom-3 hidden w-1 -translate-x-1/2 bg-[var(--charcoal)] sm:block"
      />
      <div className="relative z-10 flex w-full flex-row items-center justify-center sm:w-auto sm:flex-col sm:gap-0">
        <Seam
          state={state}
          scoreA={scoreA ?? null}
          scoreB={scoreB ?? null}
          emoji={emoji}
          secondsLeft={secondsLeft}
          label={state === "playing" ? "Target" : undefined}
        />
        {showChangeEmoji && (
          <button
            type="button"
            onClick={handleChangeEmoji}
            disabled={!changeArmed}
            aria-label="Change target emoji"
            title={
              emojiLocked
                ? "Locked — round in progress"
                : changeArmed
                  ? "Swap to a new target emoji"
                  : "Cooldown — wait a moment"
            }
            className={cn(
              "hidden items-center justify-center gap-1.5 rounded-full sm:static sm:mt-2 sm:inline-flex sm:translate-y-0",
              "border-[2px] border-[var(--charcoal)] bg-[var(--off-white)]",
              "px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--charcoal)]",
              "shadow-[2px_2px_0_0_var(--charcoal)]",
              "transition-transform duration-100",
              "active:translate-y-[1px] active:shadow-[0_0_0_0_var(--charcoal)]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--charcoal)]",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <Refresh size={12} />
            <span>{changeArmed ? "Change emoji" : "Wait…"}</span>
          </button>
        )}
      </div>
    </div>
  );
}

/* =====================================================================
   NoMatch / Paused — both use the same sticker card language.
   ===================================================================== */

function NoMatchOverlay({ onRetry }: { onRetry: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      // z-60 sits above the camera score-bar (z-40) and the header
      // (z-30). The background is fully opaque so the underlying
      // camera controls don't bleed through and look like they're
      // overlapping the modal. `env(safe-area-inset-*)` is
      // applied via the padding so notch devices have room.
      className="absolute inset-0 z-[60] flex items-center justify-center p-4 sm:p-6"
      style={{
        backgroundColor: "var(--off-white)",
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
      }}
    >
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl border-[4px] border-[var(--charcoal)] bg-[var(--off-white-2)] p-6 text-center shadow-[8px_8px_0_0_var(--charcoal)] tilt-l-1 sm:p-8">
        <span className="font-display text-5xl" aria-hidden>👀</span>
        <h2 className="font-display text-2xl font-bold tracking-tight text-[var(--charcoal)] sm:text-3xl">
          No rivals around
        </h2>
        <p className="text-sm leading-relaxed text-[var(--on-surface-variant)]">
          No one&apos;s online right now. We&apos;ll keep trying — or you can retry now.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={onRetry} iconLeft={<Refresh size={16} />}>Try again</Button>
        </div>
      </div>
    </motion.div>
  );
}

function PausedOverlay({ onStart }: { onStart: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[60] flex items-center justify-center p-4 sm:p-6"
      style={{
        backgroundColor: "var(--off-white)",
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
      }}
    >
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl border-[4px] border-[var(--charcoal)] bg-[var(--off-white-2)] p-6 text-center shadow-[8px_8px_0_0_var(--charcoal)] tilt-r-1 sm:p-8">
        <h2 className="font-display text-2xl font-bold tracking-tight text-[var(--charcoal)] sm:text-3xl">
          Matching paused
        </h2>
        <p className="text-sm leading-relaxed text-[var(--on-surface-variant)]">
          You stopped looking for a rival. Start again when you&apos;re ready.
        </p>
        <div className="mt-2 flex justify-center">
          <Button onClick={onStart} iconLeft={<Sparkle size={16} />}>Start matching</Button>
        </div>
      </div>
    </motion.div>
  );
}

/* =====================================================================
   Countdown
   ===================================================================== */

function Countdown({ count }: { count: number }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
      <AnimatePresence mode="wait">
        {count > 0 && (
          <motion.div
            key={count}
            initial={{ scale: 1.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="font-display text-[clamp(8rem,18vw,14rem)] font-bold leading-none text-[var(--charcoal)]"
          >
            {count}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
