"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import VideoPanel from "./VideoPanel";
import ChatBox from "./ChatBox";
import { EmojiSkipDialog } from "./EmojiSkipDialog";
import { SeriesPanel } from "./SeriesPanel";
import { useRoundSupport } from "../context/SupportPromptContext";
import { useMatchmaking, type MatchGameMode } from "../hooks/useMatchmaking";
import { useFaceSync } from "../hooks/useFaceSync";
import FaceSync from "./FaceSync";
import { MIN_SAMPLES } from "../lib/faceSync/types";
import { useRoundClock } from "../hooks/useRoundClock";
import { useLocalCamera, type LocalCameraStatus } from "../hooks/useLocalCamera";
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
  ArrowLeft,
  Camera,
  Mic,
  MicOff,
  Refresh,
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
import GameOptionsMenu from "./GameOptionsMenu";
import type { GameMode } from "./ChooseGameMode";

const ROUND_SECONDS = 10;

type AppPhase = "lobby" | "dueling" | "countdown" | "playing" | "results";

interface DuelArenaProps {
  privateSeriesId?: string;
  privateRoomCode?: string | null;
  onBack: () => void;
  modeSwitchTicket?: string | null;
  onModeSwitch?: (mode: MatchGameMode, ticket: string) => void;
  /** Leave for another game mode from the options menu (public play only). */
  onSelectMode?: (mode: GameMode) => void;
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

export default function DuelArena({ onBack, modeSwitchTicket, onModeSwitch, onSelectMode, privateSeriesId, privateRoomCode }: DuelArenaProps) {
  const webcamRef = useRef<HTMLVideoElement>(null);
  const submittedRef = useRef(false);
  const {
    stream: localStream,
    status: localCameraStatus,
    error: localCameraError,
    retry: retryCamera,
  } = useLocalCamera({ audio: true });
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [phase, setPhase] = useState<AppPhase>("lobby");
  const [finalScore, setFinalScore] = useState<number | null>(null);
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
    resume: resumeScoreSampling,
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
    seriesState, skipProposal, roundError, readyPrivate, respondSkip, retryRound,
    status,
    remoteStream,
    roundSchedule,
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
    faceSyncResult,
    faceSyncSkippedFor,
    sendFaceSyncSample,
  } = useMatchmaking(
    localStream,
    myName,
    myCountry,
    myCountryCode,
    profile,
    saveProfile,
    // Establish the authenticated queue connection even while the browser is
    // still asking for camera access. The matchmaking hook defers the PeerJS
    // media call until `localStream` becomes available.
    sessionToken,
    "emoji",
    modeSwitchTicket,
    onModeSwitch,
    privateSeriesId,
  );

  useRoundSupport(matchResult?.matchId, phase === "results" && Boolean(matchResult) && (!privateSeriesId || !seriesState?.myReady && (seriesState?.state === "round_result" || seriesState?.state === "completed")));

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

  /*
   * FaceSync runs in the gap between the stranger connecting and
   * the countdown, on the same shared MediaPipe instance the
   * expression scorer uses. The two never overlap: the scorer only
   * infers while `phase === "playing"`, which is after the round
   * has started, and FaceSync has always submitted and gone
   * terminal by then.
   *
   * It reads the LOCAL webcam element, never the partner's tile.
   * See the hook's header for why that is the only way both
   * players can be shown the same number.
   */
  const faceSync = useFaceSync({
    videoRef: webcamRef,
    matchId: currentMatchId,
    partnerPresent: Boolean(remoteStream),
    result: faceSyncResult,
    skippedFor: faceSyncSkippedFor,
    onSubmit: sendFaceSyncSample,
  });

  // Which "scanning..." line to show. Derived from the match id so
  // it is fixed for the whole run — re-rolling it on a re-render
  // would make the card flicker between phrasings.
  const faceSyncSeed = useMemo(() => {
    if (!currentMatchId) return 0;
    let hash = 0;
    for (let i = 0; i < currentMatchId.length; i += 1) {
      hash = (hash * 31 + currentMatchId.charCodeAt(i)) >>> 0;
    }
    return hash;
  }, [currentMatchId]);

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
    if (phase === "playing") resumeScoreSampling(); else stopScoreSampling();
    return stopScoreSampling;
  }, [phase, resumeScoreSampling, stopScoreSampling]);

  useEffect(() => {
    if (status === "matched") {
      setPhase("dueling");
      setFinalScore(null);
      setPartnerRank(DEFAULT_RANK);
      resetScoreSampling();
      submittedRef.current = false;
    }
  }, [status, currentMatchId, resetScoreSampling]);

  useEffect(() => {
    if (status === "waiting" || status === "idle" || status === "connecting" || status === "stopped") {
      setPhase("lobby");
      setFinalScore(null);
      resetScoreSampling();
      submittedRef.current = false;
    }
  }, [status, resetScoreSampling]);

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

  /*
   * The round is timed against a deadline, not counted down.
   *
   * The window opens when this device receives the server's "go"
   * packet and closes `ROUND_SECONDS` later on the wall clock,
   * rechecked on every tick. A phone whose timers are throttled
   * therefore still stops ten real seconds after its own start,
   * rather than stretching ten 1-second ticks into twelve seconds
   * and leaving this screen mid-round while the opponent is already
   * looking at the final score.
   */
  const { phase: clockPhase, countdownValue, secondsLeft } = useRoundClock({
    schedule: roundSchedule,
    active: status === "matched",
    onScanEnd: finalizeLocalRound,
  });

  const roundSeconds = secondsLeft ?? ROUND_SECONDS;

  // Mirror the clock onto the arena's phase. The scan-window entry
  // is keyed on the match so the sampler resets exactly once per
  // round even though the clock re-evaluates ten times a second.
  const roundStartedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (matchResult) { setPhase("results"); return; }
    if (clockPhase === "countdown") {
      setPhase("countdown");
      return;
    }
    if (["preparing", "preview", "paused", "facesync"].includes(clockPhase)) { setPhase("dueling"); return; }
    if (clockPhase !== "playing" || !roundSchedule) return;
    const roundKey = currentMatchId ?? String(roundSchedule.scanStartsAt);
    if (roundStartedForRef.current === roundKey) { setPhase("playing"); return; }
    roundStartedForRef.current = roundKey;
    setFinalScore(null);
    resetScoreSampling();
    submittedRef.current = false;
    setPhase("playing");
  }, [clockPhase, currentMatchId, resetScoreSampling, roundSchedule, matchResult]);

  /*
   * The server has scored the round — both submissions arrived, or
   * its deadline passed and it scored from the live samples. There
   * is nothing left to play for, so close the local round now
   * instead of running on to the end of this device's own window.
   * Without this, a client whose "go" packet was badly delayed
   * would still be playing while its opponent already had the final
   * score on screen. Idempotent: a round that already finalized
   * locally is unaffected.
   */
  useEffect(() => {
    if (!matchResult) return;
    finalizeLocalRound();
  }, [finalizeLocalRound, matchResult]);

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
    startMatching();
  }, [startMatching]);

  const handleCancelSearch = useCallback(() => {
    stopMatching();
    onBack();
  }, [onBack, stopMatching]);

  const handleStopSearch = useCallback(() => {
    stopMatching();
  }, [stopMatching]);

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

  const handleLeave = useCallback(() => {
    if (privateSeriesId) stopMatching();
    onBack();
  }, [onBack, privateSeriesId, stopMatching]);

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
    phase === "playing" || ["target", "preview", "paused"].includes(roundSchedule?.serverPhase ?? "") ? "playing" : "idle";

  const inMatch = status === "matched";
  const canRequestSkip =
    roundSchedule?.skipEnabled !== false &&
    inMatch &&
    ["preview", "playing"].includes(roundSchedule?.serverPhase ?? "") &&
    phase !== "results";

  const optionsMenu = (triggerClassName: string) => (
    <GameOptionsMenu
      currentMode="camera"
      partnerLabel={partnerName ?? "Stranger"}
      onFindNew={privateSeriesId ? undefined : skipUser}
      onSelectMode={privateSeriesId ? undefined : onSelectMode}
      onReport={inMatch ? handleReportPartner : undefined}
      onLeave={handleLeave}
      leaveLabel={privateSeriesId ? "Leave 1v1" : "Leave duel"}
      triggerClassName={triggerClassName}
    />
  );

  return (
    <div className="relative flex h-[100dvh] w-screen flex-col overflow-hidden bg-[var(--off-white)] text-[var(--charcoal)] sm:h-auto sm:min-h-screen sm:overflow-visible">
      {privateSeriesId && phase !== "results" && <SeriesPanel roomCode={privateRoomCode} series={seriesState} ready={readyPrivate} leave={() => { stopMatching(); onBack(); }} />}
      {roundError && <div role="alert" className="m-3 rounded-xl bg-[var(--yellow)] p-3 text-center text-[var(--charcoal)]">{roundError} <button onClick={retryRound} className="min-h-11 underline">Retry connection</button></div>}
      <EmojiSkipDialog proposal={skipProposal} respond={respondSkip} />
      {canRequestSkip && <button type="button" onClick={requestChangeEmoji} className="fixed bottom-24 left-1/2 z-40 hidden min-h-11 -translate-x-1/2 rounded-full border-2 border-[var(--charcoal)] bg-[var(--yellow)] px-4 text-sm font-bold text-[var(--charcoal)] sm:block">Request emoji skip</button>}
      {/* Top bar */}
      <header className="z-30 flex flex-none items-center justify-between gap-2 border-b-[3px] border-[var(--charcoal)] bg-[var(--off-white)] px-3 py-2 sm:px-6 sm:py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={privateSeriesId ? () => { stopMatching(); onBack(); } : onBack}
            className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--charcoal)] transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--charcoal)]"
            aria-label="Back to home"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Back</span>
          </button>
          <span className="hidden h-5 w-px bg-[var(--ink-soft)] sm:inline-block" />
          <Logo size="sm" />
          {inMatch && (
            <span className="hidden sm:inline-flex">
              <Pill tone={mySeat === "a" ? "purple" : "pink"}>
                You are {mine.name}
              </Pill>
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs sm:text-sm">
          {inMatch && phase === "playing" && (
            <Pill tone="yellow">
              <Timer size={12} />
              {roundSeconds}s
            </Pill>
          )}
          {/* Desktop home of the options menu; phones get it in the
              chat bar beside Skip. */}
          {optionsMenu("hidden sm:inline-flex")}
        </div>
      </header>

      {/* Mobile: two inset camera cards with a dedicated emoji row.
          Desktop restores the side-by-side arena. */}
      <main
        className="flex min-h-0 flex-1 flex-col gap-2 p-3 pb-2 sm:gap-4 sm:p-4 lg:gap-6 lg:p-6"
        aria-label="Duel arena"
      >
        {/* Mobile: two stacked camera cards sharing the viewport height
            so the whole duel (and the chat dock) fits one screen. The
            seam floats over the gap between them: emoji circle on the
            left edge, "Skip emoji" beside it. */}
        <div className="relative grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3 sm:min-h-[480px] sm:flex-1 sm:grid-cols-[1fr_auto_1fr] sm:grid-rows-1 sm:gap-4 lg:min-h-[520px]">
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
            localCameraStatus={localCameraStatus}
            localCameraError={localCameraError}
            onRetryCamera={retryCamera}
          />

          {/* The seam */}
          <SeamColumn
            state={seamState}
            faceSync={faceSync}
            faceSyncSeed={faceSyncSeed}
            emoji={emojiPrompt}
            scoreA={mySeat === "a" ? (phase === "results" ? resolvedFinalScore : liveScore) : (phase === "results" ? resolvedPartnerScore : partnerLiveScore)}
            scoreB={mySeat === "a" ? (phase === "results" ? resolvedPartnerScore : partnerLiveScore) : (phase === "results" ? resolvedFinalScore : liveScore)}
            secondsLeft={phase === "playing" ? roundSeconds : null}
            emojiLocked={emojiLocked || clockPhase === "playing" || clockPhase === "ended"}
            onRequestChangeEmoji={requestChangeEmoji}
            canRequestSkip={canRequestSkip}
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
            localCameraStatus={localCameraStatus}
            localCameraError={localCameraError}
            onRetryCamera={retryCamera}
          />
        </div>

        {/* Chat panel — always below the cameras, full width, on
            every viewport. 300px is enough for the header +
            ~4 visible message rows + input + ephemeral-hint
            footer. Any overflow messages scroll inside the panel
            itself, so the section never grows. */}
        {inMatch && (
          <div className="h-[64px] w-full flex-none sm:h-[300px]">
            <ChatBox
              messages={messages}
              onSend={sendChat}
              onTyping={sendTyping}
              rivalTyping={rivalTyping}
              partnerLabel={partnerName ?? "Stranger"}
              matchId={currentMatchId}
              onReport={handleReportPartner}
              compactOnMobile
              mobileAction={<>{privateSeriesId ? null : (
                <button
                  type="button"
                  onClick={skipUser}
                  aria-label="Skip this player"
                  className="h-full min-h-11 flex-none rounded-xl border-[2px] border-[var(--charcoal)] bg-[var(--yellow)] px-5 text-sm font-extrabold uppercase tracking-[0.12em] text-[var(--ink)] shadow-[2px_2px_0_0_var(--charcoal)] transition-transform active:translate-y-[2px] active:shadow-none"
                >
                  Skip
                </button>
              )}{optionsMenu("h-full")}</>}
            />
          </div>
        )}
      </main>

      {/* Lobby — the cream waiting state */}
      <AnimatePresence>
        {(phase === "lobby" || status === "stopped" || status === "error" || (status === "waiting" && !inMatch)) && (
          <LobbyOverlay
            status={status}
            onCancel={handleCancelSearch}
            onStop={handleStopSearch}
            onRetry={handleRetry}
            cameraStatus={localCameraStatus}
            cameraError={localCameraError}
            onRetryCamera={retryCamera}
          />
        )}
      </AnimatePresence>

      {/* Countdown — full-bleed, single spring-in per digit */}
      <AnimatePresence>
        {phase === "countdown" && countdownValue !== null && (
          <Countdown count={countdownValue} />
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
            seriesContent={privateSeriesId ? <SeriesPanel roomCode={privateRoomCode} series={seriesState} ready={readyPrivate} leave={() => { stopMatching(); onBack(); }} /> : undefined}
            onPlayAgain={privateSeriesId ? readyPrivate : handleRetry}
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
  localCameraStatus: LocalCameraStatus;
  localCameraError: string | null;
  onRetryCamera: () => void;
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
  localCameraStatus,
  localCameraError,
  onRetryCamera,
}: DuelColumnProps) {
  const isA = seat === "a";
  const accent = isA ? "var(--purple)" : "var(--pink)";
  const accentText = isA ? "var(--purple-deep)" : "var(--pink-deep)";

  const isPlaying = phase === "playing" || phase === "results";
  const isFinal = phase === "results" && finalScore !== null;
  const displayScore = phase === "results" ? finalScore : liveScore;
  const flag = flagFromAnyOrFallback(country, countryCode);
  const barValue = displayScore === null ? 0 : Math.max(0, Math.min(1, displayScore / 10));

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col px-2.5 sm:gap-3 sm:px-0">
      {/* Mobile card fills its grid row, inset from the screen edges;
          the tilted 16:9 card returns at sm+. */}
      <div
        className={cn(
          "relative h-full min-h-0 w-full flex-none overflow-hidden rounded-[1.5rem] border-[3px] bg-[var(--off-white-2)] shadow-[4px_4px_0_0_var(--charcoal)]",
          "sm:aspect-video sm:h-auto sm:flex-none sm:rounded-3xl sm:border-[4px] sm:shadow-[8px_8px_0_0_var(--charcoal)]",
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
          minimalOnMobile
          localCameraStatus={isLocal ? localCameraStatus : undefined}
          localCameraError={isLocal ? localCameraError : undefined}
          onRetryCamera={isLocal ? onRetryCamera : undefined}
        />

        {/* Mobile chips sit on the card edge away from the seam, where
            the emoji circle and "Skip emoji" float: top card at its top,
            bottom card at its bottom. Score first (live during the
            round, then final in the same spot), then identity. The mic
            takes the opposite corner. Desktop keeps VideoPanel's richer
            overlays. */}
        <div className={cn(
          "absolute left-2.5 right-14 z-40 flex items-center gap-1.5 sm:hidden",
          isA ? "top-2.5" : "bottom-2.5",
        )}>
        <div
          className="inline-flex flex-none items-center gap-1.5 rounded-xl border-[2px] border-white/25 bg-black/70 px-2.5 py-1 text-white shadow-lg backdrop-blur-md sm:hidden"
          aria-label={`${isFinal ? "Final" : "Live"} score ${displayScore === null ? "pending" : displayScore.toFixed(1)} out of 10`}
        >
          <span className="font-mono text-lg font-black leading-none tabular-nums">
            {displayScore === null ? "--" : displayScore.toFixed(1)}
          </span>
          <span className="text-[10px] font-bold text-white/60">/10</span>
          {(phase === "playing" || isFinal) && (
            <span
              className={cn(
                "ml-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.14em]",
                isFinal ? "bg-[var(--yellow)] text-[var(--ink)]" : "bg-white/15 text-white",
              )}
            >
              {!isFinal && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#39ff14]" />}
              {isFinal ? "Final" : "Live"}
            </span>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-1.5 rounded-full border border-white/20 bg-black/65 py-1 pl-2 pr-2.5 text-white backdrop-blur-md sm:hidden">
          <span aria-hidden className="text-sm leading-none">{flag}</span>
          <span className="truncate text-xs font-bold">{playerName}</span>
          {isLocal && (
            <span
              className="flex-none rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-white"
              style={{ background: accentText }}
            >
              You
            </span>
          )}
        </div>
        </div>

        {isLocal && (
          <div className={cn("absolute right-2.5 z-40 sm:hidden", isA ? "bottom-2.5" : "top-2.5")}>
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
  /**
   * The FaceSync run for the current stranger. While it is visible
   * it takes over the seam: same slot, same footprint, so the
   * arena layout never reflows and neither face is covered.
   */
  faceSync: ReturnType<typeof useFaceSync>;
  /** Seeds which scanning line shows. Stable for the match. */
  faceSyncSeed: number;
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
  /** Mobile only: render the skip control beside the emoji. */
  canRequestSkip: boolean;
}

function SeamColumn({
  state,
  faceSync,
  faceSyncSeed,
  emoji,
  scoreA,
  scoreB,
  secondsLeft,
  onRequestChangeEmoji,
  canRequestSkip,
}: SeamColumnProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 top-1/2 z-50 flex h-0 items-center sm:pointer-events-auto sm:relative sm:inset-auto sm:top-auto sm:z-auto sm:h-auto sm:items-stretch sm:justify-center",
        faceSync.visible ? "justify-center px-3" : "justify-start pl-4",
      )}
      aria-hidden={state === "idle"}
    >
      <div
        className="absolute left-1/2 top-3 bottom-3 hidden w-1 -translate-x-1/2 bg-[var(--charcoal)] sm:block"
      />
      <div className={cn(
        "relative z-10 flex flex-row items-center gap-3 sm:w-auto sm:flex-col sm:justify-center sm:gap-0 [&>*]:pointer-events-auto",
        faceSync.visible ? "w-full justify-center" : "justify-start",
      )}>
        <AnimatePresence mode="wait" initial={false}>
          {faceSync.visible && (
            <FaceSync
              key="facesync"
              phase={faceSync.phase as "waiting_for_faces" | "scanning" | "calculating" | "showing_result"}
              result={faceSync.result}
              faceMissing={faceSync.localFaceMissing}
              sampleCount={faceSync.sampleCount}
              sampleTarget={MIN_SAMPLES}
              variantSeed={faceSyncSeed}
            />
          )}
        </AnimatePresence>
        {!faceSync.visible && (
        <Seam
          state={state}
          scoreA={scoreA ?? null}
          scoreB={scoreB ?? null}
          emoji={emoji}
          secondsLeft={secondsLeft}
          label={state === "playing" ? "Target" : undefined}
        />
        )}
        {canRequestSkip && !faceSync.visible && (
          <button
            type="button"
            onClick={onRequestChangeEmoji}
            className="min-h-10 rounded-full border-[3px] border-[var(--charcoal)] bg-[var(--off-white)] px-4 text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--charcoal)] shadow-[3px_3px_0_0_var(--charcoal)] transition-transform active:translate-y-[2px] active:shadow-none sm:hidden"
          >
            Skip emoji
          </button>
        )}

      </div>
    </div>
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
