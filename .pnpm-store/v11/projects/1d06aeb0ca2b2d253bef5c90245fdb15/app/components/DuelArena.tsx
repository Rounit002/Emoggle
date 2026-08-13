"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import VideoPanel from "./VideoPanel";
import ChatBox from "./ChatBox";
import { useMatchmaking } from "../hooks/useMatchmaking";
import { useExpressionScorer } from "../hooks/useExpressionScorer";
import { useUserProfile } from "../context/UserProfileContext";
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

function resultCopy(
  myScore: number | null,
  rivalScore: number | null,
  winner?: "you" | "rival" | "tie",
) {
  if (myScore === null || rivalScore === null) {
    return { label: "Hold up", tone: "var(--yellow-deep)" as const, sub: "Waiting for rival score..." };
  }
  if (winner === "tie") {
    return { label: "Twin energy", tone: "var(--yellow-deep)" as const, sub: "Same score. Clean tie." };
  }
  if (winner === "you") {
    return {
      label: myScore >= 8 ? "Ate that" : "Face card won",
      tone: "var(--purple-deep)" as const,
      sub: "Your face matched the emoji closer this round.",
    };
  }
  if (winner === "rival") {
    return {
      label: rivalScore >= 8 ? "Got cooked" : "Almost ate",
      tone: "var(--pink-deep)" as const,
      sub: "Rival's face geometry landed closer to the emoji.",
    };
  }
  const diff = myScore - rivalScore;
  if (Math.abs(diff) <= 1) {
    return { label: "Twin energy", tone: "var(--yellow-deep)" as const, sub: "Basically a tie." };
  }
  if (diff > 0) {
    return {
      label: myScore >= 8 ? "Ate that" : "Face card won",
      tone: "var(--purple-deep)" as const,
      sub: "Your emoji impression cleared the room.",
    };
  }
  return {
    label: rivalScore >= 8 ? "Got cooked" : "Almost ate",
    tone: "var(--pink-deep)" as const,
    sub: "Rival got closer to the emoji this round.",
  };
}

export default function DuelArena({ onBack }: DuelArenaProps) {
  const webcamRef = useRef<HTMLVideoElement>(null);
  const bestScoreRef = useRef(0);
  const scoreSamplesRef = useRef<number[]>([]);
  const submittedRef = useRef(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [phase, setPhase] = useState<AppPhase>("lobby");
  const [roundSeconds, setRoundSeconds] = useState(ROUND_SECONDS);
  const [bestScore, setBestScore] = useState<number | null>(null);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [searchSession, setSearchSession] = useState(0);
  const [noOneFound, setNoOneFound] = useState(false);
  const [myCountry, setMyCountry] = useState<string | null>(null);
  const [myRank, setMyRank] = useState<RankSnapshot>(DEFAULT_RANK);
  const [partnerRank, setPartnerRank] = useState<RankSnapshot>(DEFAULT_RANK);
  const { profile, saveProfile, sessionToken } = useUserProfile();

  // Geo lookup — same logic as before, just refreshed for the new design.
  useEffect(() => {
    let isCancelled = false;
    const base = process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL ?? "http://localhost:3001";
    fetch(`${base}/api/geo`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || isCancelled) return;
        if (typeof data.country === "string" && data.country) {
          setMyCountry(data.country);
          return;
        }
        const code: string | null = typeof data?.countryCode === "string" ? data.countryCode.toUpperCase() : null;
        if (code && code.length === 2) {
          const flag = code.replace(/./g, (c: string) => String.fromCodePoint(127462 + c.charCodeAt(0) - 65));
          const name = new Intl.DisplayNames(["en"], { type: "region" }).of(code);
          setMyCountry(name ? `${flag} ${name}` : flag);
          return;
        }
      })
      .catch(() => undefined);
    return () => {
      isCancelled = true;
    };
  }, []);

  const {
    status,
    remoteStream,
    countdown,
    partnerScore,
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
    partnerCountry,
    localPeerId,
    partnerPeerId,
    messages,
    sendChat,
    rivalTyping,
    sendTyping,
    reportPartner,
    currentMatchId,
  } = useMatchmaking(localStream, myCountry, profile, saveProfile, sessionToken);

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

  const liveScore = toTenPoint(expression.score);

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
      setBestScore(null);
      setFinalScore(null);
      setPartnerRank(DEFAULT_RANK);
      bestScoreRef.current = 0;
      scoreSamplesRef.current = [];
      submittedRef.current = false;
    }
  }, [status, emojiPrompt]);

  useEffect(() => {
    if (status === "waiting" || status === "idle" || status === "connecting" || status === "stopped") {
      setPhase("lobby");
      setRoundSeconds(ROUND_SECONDS);
      setBestScore(null);
      setFinalScore(null);
      bestScoreRef.current = 0;
      scoreSamplesRef.current = [];
      submittedRef.current = false;
    }
  }, [status]);

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
      setBestScore(null);
      setFinalScore(null);
      bestScoreRef.current = 0;
      scoreSamplesRef.current = [];
      submittedRef.current = false;
      setPhase("playing");
    }
  }, [countdown]);

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
  useEffect(() => {
    if (!matchResult) return;
    if (typeof window === "undefined") return;
    try {
      const key = "emoggle:duel-history";
      const raw = window.localStorage.getItem(key);
      const list: Array<Record<string, unknown>> = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return;
      if (list.some((entry) => entry && entry.id === matchResult.matchId)) return;
      const next = [
        {
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
        },
        ...list,
      ].slice(0, 50);
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, [matchResult, mySeat]);

  useEffect(() => {
    if (phase !== "playing" || liveScore === null) return;
    scoreSamplesRef.current.push(liveScore);
    if (liveScore > bestScoreRef.current) {
      bestScoreRef.current = liveScore;
      setBestScore(liveScore);
    }
  }, [liveScore, phase]);

  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(() => {
      setRoundSeconds((seconds) => {
        if (seconds <= 1) {
          window.clearInterval(timer);
          const samples = scoreSamplesRef.current;
          const averageScore = samples.length
            ? samples.reduce((sum, sample) => sum + sample, 0) / samples.length
            : bestScoreRef.current;
          const score = Number(averageScore.toFixed(1));
          if (!submittedRef.current) {
            submittedRef.current = true;
            setFinalScore(score);
            submitScore(score);
            submitLiveScore(score);
          }
          setPhase("results");
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, submitScore, submitLiveScore]);

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

  const finalResult = resultCopy(finalScore, partnerScore, matchResult?.winner);
  const myScore = mySeat === "a" ? (phase === "results" ? finalScore : liveScore) : (phase === "results" ? partnerScore : partnerLiveScore);
  const rivalScore = mySeat === "a" ? (phase === "results" ? partnerScore : partnerLiveScore) : (phase === "results" ? finalScore : liveScore);

  const seamState: "idle" | "playing" | "revealing" =
    phase === "playing" ? "playing" : phase === "results" ? "revealing" : "idle";

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

      {/* The face-off: cameras on top, chat directly underneath.
          Mobile uses two full-bleed rows with the seam floating at
          their shared boundary. At sm+ the existing padded,
          side-by-side layout is restored. */}
      <main
        className="flex min-h-0 flex-1 flex-col gap-0 p-0 sm:gap-4 sm:p-4 lg:gap-6 lg:p-6"
        aria-label="Duel arena"
      >
        {/* Cameras + seam. Equal mobile rows split the usable camera
            height; the minimum keeps both feeds usable on short
            phones while the separate chat slot remains below. */}
        <div className="relative grid min-h-[560px] flex-1 grid-cols-1 grid-rows-2 gap-0 sm:min-h-[480px] sm:grid-cols-[1fr_auto_1fr] sm:grid-rows-1 sm:gap-4 lg:min-h-[520px]">
          {/* Player A column */}
          <DuelColumn
            seat="a"
            playerName="You"
            country={mySeat === "a" ? myCountry : partnerCountry}
            rankLabel={mySeat === "a" ? formatRank(myRank) : formatRank(partnerRank)}
            score={mySeat === "a" ? myScore : rivalScore}
            liveScore={mySeat === "a" ? liveScore : partnerLiveScore}
            finalScore={mySeat === "a" ? finalScore : partnerScore}
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
            scoreA={mySeat === "a" ? (phase === "results" ? finalScore : liveScore) : (phase === "results" ? partnerScore : partnerLiveScore)}
            scoreB={mySeat === "a" ? (phase === "results" ? partnerScore : partnerLiveScore) : (phase === "results" ? finalScore : liveScore)}
            secondsLeft={phase === "playing" ? roundSeconds : null}
            emojiLocked={emojiLocked}
            onRequestChangeEmoji={requestChangeEmoji}
          />

          {/* Player B column */}
          <DuelColumn
            seat="b"
            playerName={rivalSeat === "a" ? "You" : "Rival"}
            country={rivalSeat === "a" ? myCountry : partnerCountry}
            rankLabel={rivalSeat === "a" ? formatRank(myRank) : formatRank(partnerRank)}
            score={rivalSeat === "a" ? myScore : rivalScore}
            liveScore={rivalSeat === "a" ? liveScore : partnerLiveScore}
            finalScore={rivalSeat === "a" ? finalScore : partnerScore}
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
          <div className="flex-none w-full h-[300px]">
            <ChatBox
              messages={messages}
              onSend={sendChat}
              onTyping={sendTyping}
              rivalTyping={rivalTyping}
              partnerLabel="Stranger"
              matchId={currentMatchId}
              onReport={handleReportPartner}
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
          <ScoreReveal
            result={finalResult}
            scoreA={mySeat === "a" ? finalScore : partnerScore}
            scoreB={mySeat === "a" ? partnerScore : finalScore}
            myRank={myRank}
            partnerRank={partnerRank}
            mySeat={mySeat}
            onPlayAgain={handleRetry}
            onLeave={onBack}
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
  rankLabel: string;
  score: number | null;
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
  rankLabel,
  score,
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
  const accentDeep = isA ? "var(--purple-deep)" : "var(--pink-deep)";
  const accentText = isA ? "var(--purple-deep)" : "var(--pink-deep)";

  const isPlaying = phase === "playing" || phase === "results";
  const displayScore = phase === "results" ? finalScore : liveScore;
  const barValue = displayScore === null ? 0 : Math.max(0, Math.min(1, displayScore / 10));

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-0 sm:gap-3">
      {/* Full-bleed pane on mobile; the framed, tilted 16:9 card is
          restored at sm+. VideoPanel keeps the stream absolutely
          positioned so its intrinsic resolution cannot affect the
          grid geometry. */}
      <div
        className={cn(
          "relative min-h-0 w-full flex-1 overflow-hidden bg-[var(--off-white-2)]",
          "rounded-none border-0 shadow-none",
          "sm:aspect-video sm:flex-none sm:rounded-3xl sm:border-[4px] sm:shadow-[8px_8px_0_0_var(--charcoal)]",
          isA
            ? "sm:-rotate-[1.5deg] sm:border-[var(--purple-deep)]"
            : "sm:rotate-[1.5deg] sm:border-[var(--pink-deep)]",
        )}
      >
        <VideoPanel
          ref={webcamRef}
          label={isA ? "YOU" : "STRANGER"}
          playerName={playerName}
          country={country}
          rankLabel={rankLabel}
          isLocal={isLocal}
          localStream={localStream ?? null}
          remoteStream={remoteStream ?? null}
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

        {/* Seat color tag in the bottom corner */}
        <span
          aria-hidden
          className={cn(
            "absolute bottom-[4.75rem] right-3 z-30 flex items-center gap-1.5 rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--off-white)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] shadow-[2px_2px_0_0_var(--charcoal)] sm:bottom-3",
            isA
              ? "text-[var(--purple-deep)] sm:left-3 sm:right-auto"
              : "text-[var(--pink-deep)] sm:right-3",
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
          {isA ? "Violet" : "Pink"}
        </span>
      </div>

      {/* Existing score controls overlay the mobile feed, then return
          to their original below-camera position at sm+. */}
      <div className="absolute inset-x-3 bottom-3 z-40 flex flex-none items-center gap-3 rounded-2xl border-[3px] border-[var(--charcoal)] bg-[var(--off-white-2)] px-3 py-2 shadow-[4px_4px_0_0_var(--charcoal)] sm:static">
        <IconButton
          size="sm"
          variant={isMicMuted ? "default" : isA ? "purple" : "pink"}
          label={isMicMuted ? "Unmute microphone" : "Mute microphone"}
          onClick={onToggleMic}
        >
          {isMicMuted ? <MicOff size={16} /> : <Mic size={16} />}
        </IconButton>
        <div className="flex-1">
          <div className="flex items-center justify-between font-mono text-[10px] tabular font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
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
      className="absolute inset-x-0 top-1/2 z-50 flex -translate-y-1/2 items-stretch justify-center sm:relative sm:inset-auto sm:top-auto sm:z-auto sm:translate-y-0"
      aria-hidden={state === "idle"}
    >
      <div
        className="absolute left-3 right-3 top-1/2 h-px -translate-y-1/2 sm:left-1/2 sm:right-auto sm:top-3 sm:bottom-3 sm:h-auto sm:w-1 sm:-translate-x-1/2 sm:translate-y-0 bg-[var(--charcoal)]"
      />
      <div className="relative z-10 flex w-full flex-row items-center justify-center px-3 py-3 sm:w-auto sm:flex-col sm:gap-0 sm:px-0 sm:py-0">
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
              "absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center justify-center gap-1.5 rounded-full sm:static sm:mt-2 sm:translate-y-0",
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
      className="absolute inset-0 z-30 flex items-center justify-center bg-[var(--ink-overlay)] p-4"
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
      className="absolute inset-0 z-30 flex items-center justify-center bg-[var(--ink-overlay)] p-4"
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

/* =====================================================================
   ScoreReveal — the signature moment.
   --------------------------------------------------------------------
   The card is a sticker: chunky 4px charcoal border, 8px hard
   offset shadow, slight tilt. The two player scores are mounted
   on colored sub-cards (purple for A, pink for B) with their own
   sticker shadows. The center column has a "vs" mark on yellow
   (the energy color, used here as a single static element — no
   pulsing, no looping). The whole card springs in from the seam
   in a single satisfying moment.
   ===================================================================== */

interface ScoreRevealProps {
  result: ReturnType<typeof resultCopy>;
  scoreA: number | null;
  scoreB: number | null;
  myRank: RankSnapshot;
  partnerRank: RankSnapshot;
  mySeat: Seat;
  onPlayAgain: () => void;
  onLeave: () => void;
}

function ScoreReveal({
  result,
  scoreA,
  scoreB,
  myRank,
  partnerRank,
  mySeat,
  onPlayAgain,
  onLeave,
}: ScoreRevealProps) {
  const winner: Seat | "tie" | null =
    scoreA === null || scoreB === null
      ? null
      : Math.abs(scoreA - scoreB) < 0.05
        ? "tie"
        : scoreA > scoreB
          ? "a"
          : "b";

  const iWon = winner === "tie" ? null : winner === mySeat;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 z-40 flex items-center justify-center bg-[var(--ink-overlay)] p-4"
    >
      <motion.div
        initial={{ y: 24, opacity: 0, scale: 0.92, rotate: -1.5 }}
        animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 22, delay: 0.05 }}
        className="flex w-full max-w-xl flex-col items-stretch gap-5 rounded-3xl border-[4px] border-[var(--charcoal)] bg-[var(--off-white-2)] p-6 text-center shadow-[10px_10px_0_0_var(--charcoal)] sm:p-9"
      >
        {/* Headline area */}
        <div className="flex flex-col items-center gap-2">
          <span className="eyebrow">Round result</span>
          <motion.h2
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 360, damping: 18, delay: 0.18 }}
            className="font-display text-[clamp(2.5rem,7vw,4rem)] font-bold leading-[1.05] tracking-tight"
            style={{ color: result.tone }}
          >
            {result.label}
          </motion.h2>
          <p className="max-w-md text-sm leading-relaxed text-[var(--on-surface-variant)]">
            {result.sub}
          </p>
        </div>

        {/* Two score blocks with a yellow VS divider */}
        <div className="mt-2 flex items-stretch justify-center gap-3 sm:gap-4">
          <RevealScoreCard
            seat="a"
            score={scoreA}
            tier={mySeat === "a" ? myRank.tier : partnerRank.tier}
            elo={mySeat === "a" ? myRank.elo : partnerRank.elo}
            winner={winner === "a"}
            delay={0.18}
          />

          {/* The "vs" mark — yellow circle, sticker shadow, the energy color. */}
          <motion.div
            initial={{ scale: 0.6, opacity: 0, rotate: -10 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 18, delay: 0.32 }}
            className="flex h-14 w-14 flex-none items-center justify-center rounded-full border-[3px] border-[var(--charcoal)] bg-[var(--yellow)] font-display text-lg font-bold text-[var(--charcoal)] shadow-[4px_4px_0_0_var(--charcoal)]"
            aria-hidden
          >
            vs
          </motion.div>

          <RevealScoreCard
            seat="b"
            score={scoreB}
            tier={mySeat === "b" ? myRank.tier : partnerRank.tier}
            elo={mySeat === "b" ? myRank.elo : partnerRank.elo}
            winner={winner === "b"}
            delay={0.24}
          />
        </div>

        {/* The single celebratory banner — only if you actually won. */}
        {iWon && (
          <motion.div
            initial={{ y: 8, opacity: 0, scale: 0.95, rotate: -1 }}
            animate={{ y: 0, opacity: 1, scale: 1, rotate: -1 }}
            transition={{ type: "spring", stiffness: 320, damping: 22, delay: 0.45 }}
            className="rounded-full border-[3px] border-[var(--charcoal)] bg-[var(--pink)] px-4 py-1.5 text-sm font-bold text-[var(--charcoal)] shadow-[4px_4px_0_0_var(--charcoal)]"
          >
            🏆 You won this round
          </motion.div>
        )}

        <motion.div
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.25, delay: 0.5 }}
          className="mt-2 flex flex-wrap items-center justify-center gap-3"
        >
          <Button onClick={onPlayAgain} iconLeft={<Refresh size={16} />}>Play again</Button>
          <Button variant="secondary" onClick={onLeave}>Back to home</Button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function RevealScoreCard({
  seat,
  score,
  tier,
  elo,
  winner,
  delay,
}: {
  seat: Seat;
  score: number | null;
  tier: string;
  elo: number;
  winner: boolean;
  delay: number;
}) {
  const isA = seat === "a";
  const fill = isA ? "bg-[var(--purple)] text-[var(--off-white)]" : "bg-[var(--pink)] text-[var(--charcoal)]";
  const align = isA ? "items-end text-right" : "items-start text-left";
  return (
    <motion.div
      initial={{ x: isA ? -16 : 16, opacity: 0, rotate: isA ? -2 : 2 }}
      animate={{ x: 0, opacity: 1, rotate: isA ? -1 : 1 }}
      transition={{ type: "spring", stiffness: 280, damping: 24, delay }}
      className={cn(
        "flex flex-1 flex-col gap-2 rounded-2xl border-[3px] border-[var(--charcoal)] p-4",
        "shadow-[6px_6px_0_0_var(--charcoal)]",
        fill,
      )}
    >
      <span
        className="font-display text-[clamp(2.5rem,7vw,4rem)] font-bold leading-none tabular tracking-tight"
        style={{ color: isA ? "var(--off-white)" : "var(--charcoal)" }}
      >
        {score === null ? "--" : score.toFixed(1)}
      </span>
      <span
        className="font-mono text-[10px] uppercase tracking-[0.18em] opacity-80"
      >
        {isA ? "Violet" : "Pink"} · {tier} {elo}
      </span>
      {winner && (
        <Pill tone={isA ? "purple" : "pink"}>Winner</Pill>
      )}
    </motion.div>
  );
}
