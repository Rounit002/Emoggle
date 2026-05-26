"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Webcam from "react-webcam";
import VideoPanel from "./VideoPanel";
import Countdown from "./Countdown";
import ChatBox from "./ChatBox";
import { useMatchmaking } from "../hooks/useMatchmaking";
import { useExpressionScorer } from "../hooks/useExpressionScorer";

const ROUND_SECONDS = 10;

type AppPhase =
  | "lobby"
  | "dueling"
  | "countdown"
  | "playing"
  | "results";

interface DuelArenaProps {
  onBack: () => void;
}

function toTenPoint(rawScore: number | null) {
  if (rawScore === null) return null;
  return Math.max(0, Math.min(10, Number((rawScore / 10).toFixed(1))));
}

function formatScore(score: number | null) {
  return score === null ? "--" : score.toFixed(1);
}

function resultCopy(myScore: number | null, rivalScore: number | null) {
  if (myScore === null || rivalScore === null) {
    return {
      label: "Hold Up",
      tone: "text-yellow-300",
      sub: "Waiting for rival score...",
    };
  }

  const diff = myScore - rivalScore;
  if (Math.abs(diff) <= 1) {
    return {
      label: "Twin Energy",
      tone: "text-yellow-300",
      sub: "That face match is basically a tie.",
    };
  }
  if (diff > 0) {
    return {
      label: myScore >= 8 ? "Ate That" : "Face Card Won",
      tone: "text-emerald-300",
      sub: "Your emoji impression cleared the room.",
    };
  }
  return {
    label: rivalScore >= 8 ? "Got Cooked" : "Almost Ate",
    tone: "text-red-300",
    sub: "Rival got closer to the emoji this round.",
  };
}

export default function DuelArena({ onBack }: DuelArenaProps) {
  const webcamRef = useRef<Webcam>(null);
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

  useEffect(() => {
    const codeToFlag = (code: string) =>
      code.toUpperCase().replace(/./g, (c: string) =>
        String.fromCodePoint(127462 + c.charCodeAt(0) - 65)
      );

    const tryIpWhoIs = () =>
      fetch("https://ipwho.is/")
        .then((r) => r.json())
        .then((d) => {
          if (d.success && d.country_code && d.country) {
            setMyCountry(`${codeToFlag(d.country_code)} ${d.country}`);
            return true;
          }
          return false;
        })
        .catch(() => false);

    const tryIpApiCo = () =>
      fetch("https://ipapi.co/json/")
        .then((r) => r.json())
        .then((d) => {
          if (d.country_code && d.country_name) {
            setMyCountry(`${codeToFlag(d.country_code)} ${d.country_name}`);
            return true;
          }
          return false;
        })
        .catch(() => false);

    tryIpWhoIs().then((ok) => {
      if (!ok) tryIpApiCo();
    });
  }, []);

  const {
    status,
    remoteStream,
    countdown,
    partnerScore,
    partnerLiveScore,
    emojiPrompt,
    submitScore,
    submitLiveScore,
    skipUser,
    stopMatching,
    startMatching,
    messages,
    sendChat,
    rivalTyping,
    sendTyping,
    partnerCountry,
  } = useMatchmaking(localStream, myCountry);

  const publishLiveScore = useCallback(
    (rawScore: number) => {
      const tenPointScore = toTenPoint(rawScore);
      if (tenPointScore !== null) submitLiveScore(tenPointScore);
    },
    [submitLiveScore]
  );

  const expression = useExpressionScorer(
    webcamRef,
    emojiPrompt,
    phase === "playing",
    publishLiveScore
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

  const currentLeader = useMemo(() => {
    if (phase !== "playing" || liveScore === null || partnerLiveScore === null) return null;
    if (Math.abs(liveScore - partnerLiveScore) <= 1) return "Tie";
    return liveScore > partnerLiveScore ? "You lead" : "Rival leads";
  }, [phase, liveScore, partnerLiveScore]);

  const scorerStatus = useMemo(() => {
    if (phase !== "playing") return null;
    if (expression.status === "loading") return "Loading face tracker...";
    if (expression.status === "no-face") return "Face not found";
    if (expression.status === "error") return "Face tracker unavailable";
    return "10-second face check";
  }, [expression.status, phase]);

  const handleRetry = useCallback(() => {
    setSearchSession((s) => s + 1);
    startMatching();
  }, [startMatching]);

  const handleStartMatching = useCallback(() => {
    startMatching();
  }, [startMatching]);

  const toggleMic = useCallback(() => {
    if (!localStream) return;
    const next = !isMicMuted;
    localStream.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setIsMicMuted(next);
  }, [localStream, isMicMuted]);

  const finalResult = resultCopy(finalScore, partnerScore);

  return (
    <div className="relative w-screen h-screen bg-black flex flex-col overflow-hidden">
      <header className="flex-none flex flex-col gap-2 px-4 py-3 bg-zinc-950 border-b border-zinc-800 z-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-xs font-semibold transition-colors mr-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <span className="truncate text-lg font-black tracking-tight text-white sm:text-xl">
            Emoggle
          </span>
          <StatusBadge status={status} />
        </div>

        <div className="flex items-center gap-4 text-xs font-bold sm:text-sm">
          {scorerStatus && (
            <span className={expression.status === "ready" ? "text-emerald-300" : "text-yellow-300"}>
              {scorerStatus}
            </span>
          )}
          {currentLeader && (
            <span className={currentLeader === "You lead" ? "text-emerald-300" : currentLeader === "Rival leads" ? "text-red-300" : "text-zinc-300"}>
              {currentLeader}
            </span>
          )}
        </div>
      </header>

      <div className="relative flex-1 grid min-h-0 grid-cols-1 gap-2 p-2 pb-52 xs:pb-56 sm:grid-cols-2 sm:gap-3 sm:p-3 sm:pb-48 lg:pb-40 xl:pb-36">
        <div className="flex flex-col min-h-0 gap-1.5">
          <div className="relative flex-1 min-h-0">
            <VideoPanel
              ref={webcamRef}
              label="YOU"
              isLocal={true}
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
            />
          </div>
          {myCountry && (
            <div className="flex items-center gap-2 px-1 py-0.5">
              <span className="text-3xl leading-none">{myCountry.split(" ")[0]}</span>
              <span className="text-base font-bold text-white tracking-wide">{myCountry.split(" ").slice(1).join(" ")}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col min-h-0 gap-1.5">
          <div className="relative flex-1 min-h-0">
            <VideoPanel
              label="STRANGER"
              isLocal={false}
              remoteStream={remoteDisplayStream}
              frozenFrame={null}
              liveScore={phase === "results" ? partnerScore : partnerLiveScore}
              score={partnerScore}
              verdict={null}
              roast={null}
              isRevealing={false}
              isPlaying={phase === "playing" || phase === "results"}
              isJudging={false}
              scoreAlign="right"
            />
          </div>
          {partnerCountry && (
            <div className="flex items-center justify-end gap-2 px-1 py-0.5">
              <span className="text-base font-bold text-white tracking-wide">{partnerCountry.split(" ").slice(1).join(" ")}</span>
              <span className="text-3xl leading-none">{partnerCountry.split(" ")[0]}</span>
            </div>
          )}
        </div>

        {status === "matched" && emojiPrompt && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute top-5 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
          >
            <div className="flex flex-col items-center gap-1.5 sm:gap-2 rounded-2xl border border-yellow-400/40 bg-black/75 px-4 py-2 sm:px-7 sm:py-3 shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-4">
                <span className="text-xs font-black uppercase tracking-[0.25em] text-yellow-300">Match</span>
                <motion.span
                  className="text-4xl sm:text-6xl leading-none"
                  animate={
                    phase === "playing"
                      ? { scale: [1, 1.12, 1], rotate: [-4, 4, -4] }
                      : { scale: 1, rotate: 0 }
                  }
                  transition={{ repeat: phase === "playing" ? Infinity : 0, duration: 1.1, ease: "easeInOut" }}
                >
                  {emojiPrompt}
                </motion.span>
              </div>
              {phase === "playing" && (
                <div className="flex items-center gap-2 text-yellow-200">
                  <span className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em]">Timer</span>
                  <span className="text-xl sm:text-2xl font-black tabular-nums">{roundSeconds}s</span>
                </div>
              )}
              {phase === "playing" && bestScore !== null && (
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Best {formatScore(bestScore)}/10
                </span>
              )}
            </div>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {phase === "results" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-sm pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.78, opacity: 0, y: 18 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className="flex flex-col items-center text-center gap-3 sm:gap-4 px-4 sm:px-8"
            >
              <span className={`text-[clamp(2.8rem,10vw,8rem)] font-black uppercase leading-none tracking-tight drop-shadow-2xl ${finalResult.tone}`}>
                {finalResult.label}
              </span>
              <div className="flex items-end gap-6 sm:gap-8">
                <ScoreReadout label="You" score={finalScore} highlight />
                <ScoreReadout label="Rival" score={partnerScore} />
              </div>
              <p className="max-w-md text-zinc-200 text-sm sm:text-base font-semibold">
                {finalResult.sub}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {status === "matched" && (
        <>
          <MicButton isMuted={isMicMuted} onToggle={toggleMic} />
          <ChatBox
            messages={messages}
            onSend={sendChat}
            onSkip={skipUser}
            onStop={stopMatching}
            disabled={phase === "lobby"}
            rivalTyping={rivalTyping}
            onTyping={sendTyping}
          />
        </>
      )}

      {(phase === "lobby" || status === "waiting") && !remoteStream && !noOneFound && (
        <LobbyOverlay status={status} />
      )}

      {status === "waiting" && noOneFound && (
        <NoMatchOverlay onRetry={handleRetry} />
      )}

      {status === "stopped" && (
        <PausedOverlay onStart={handleStartMatching} />
      )}

      {phase === "countdown" && <Countdown count={countdown} />}
    </div>
  );
}

function ScoreReadout({ label, score, highlight = false }: { label: string; score: number | null; highlight?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">{label}</span>
      <div className="flex items-end gap-1">
        <span className={`text-3xl sm:text-5xl font-black tabular-nums ${highlight ? "text-white" : "text-zinc-300"}`}>
          {formatScore(score)}
        </span>
        <span className="text-base sm:text-xl text-zinc-500 font-bold mb-1">/10</span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    idle: { label: "Offline", color: "bg-zinc-600" },
    connecting: { label: "Connecting...", color: "bg-yellow-500 animate-pulse" },
    waiting: { label: "In Queue...", color: "bg-blue-500 animate-pulse" },
    matched: { label: "Live", color: "bg-emerald-500" },
    error: { label: "Error", color: "bg-red-600" },
  };
  const info = map[status] ?? map.idle;

  return (
    <span
      className={`flex items-center gap-1.5 text-xs font-semibold text-white px-2.5 py-1 rounded-full ${info.color}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-white/70 inline-block" />
      {info.label}
    </span>
  );
}

function MicButton({ isMuted, onToggle }: { isMuted: boolean; onToggle: () => void }) {
  return (
    <motion.button
      onClick={onToggle}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.93 }}
      className={`absolute bottom-3 left-3 z-50 flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 backdrop-blur-md border text-white text-xs sm:text-sm font-semibold rounded-full transition-colors shadow-lg ${
        isMuted
          ? "bg-red-700/90 border-red-500 hover:bg-red-600"
          : "bg-zinc-900/90 border-zinc-700 hover:border-zinc-500"
      }`}
      title={isMuted ? "Unmute mic" : "Mute mic"}
    >
      {isMuted ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 19L5 5M12 18.75a6.75 6.75 0 006.74-6.4M5.268 5.268A6.75 6.75 0 0012 18.75m0 0v3m-3 0h6M12 3a3 3 0 013 3v5.25M9.75 9.75L9 12a3 3 0 005.657 1.958M12 3a3 3 0 00-3 3v3" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6.75 6.75 0 006.75-6.75v-1.5m-6.75 8.25v3m-3 0h6M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3z" />
        </svg>
      )}
      {isMuted ? "Muted" : "Mic On"}
    </motion.button>
  );
}

function LobbyOverlay({ status }: { status: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm gap-6 pointer-events-none"
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
        className="w-14 h-14 rounded-full border-4 border-zinc-700 border-t-yellow-400"
      />
      <div className="text-center">
        <p className="text-xl sm:text-2xl font-black text-white tracking-tight">
          {status === "connecting" ? "Getting camera..." : "Finding your rival..."}
        </p>
        <p className="text-zinc-400 text-xs sm:text-sm mt-1">
          Open a second tab to test locally
        </p>
      </div>
    </motion.div>
  );
}

function NoMatchOverlay({ onRetry }: { onRetry: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm gap-5"
    >
      <span className="text-6xl">👀</span>
      <div className="text-center">
        <p className="text-xl sm:text-2xl font-black text-white tracking-tight">No rivals around</p>
        <p className="text-zinc-400 text-xs sm:text-sm mt-1">Looks like no one&apos;s online right now</p>
      </div>
      <motion.button
        onClick={onRetry}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        className="pointer-events-auto rounded-full bg-violet-600 hover:bg-violet-500 px-10 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-2xl transition-colors"
      >
        Try Again
      </motion.button>
    </motion.div>
  );
}

function PausedOverlay({ onStart }: { onStart: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm gap-5"
    >
      <span className="text-6xl">⏸️</span>
      <div className="text-center">
        <p className="text-xl sm:text-2xl font-black text-white tracking-tight">Matching Paused</p>
        <p className="text-zinc-400 text-xs sm:text-sm mt-1">Click Start when you&apos;re ready to find a rival</p>
      </div>
      <motion.button
        onClick={onStart}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        className="pointer-events-auto rounded-full bg-emerald-600 hover:bg-emerald-500 px-10 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-2xl transition-colors"
      >
        Start Matching
      </motion.button>
    </motion.div>
  );
}
