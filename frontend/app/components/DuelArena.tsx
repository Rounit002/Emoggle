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
  const [phase, setPhase] = useState<AppPhase>("lobby");
  const [roundSeconds, setRoundSeconds] = useState(ROUND_SECONDS);
  const [bestScore, setBestScore] = useState<number | null>(null);
  const [finalScore, setFinalScore] = useState<number | null>(null);

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
    messages,
    sendChat,
  } = useMatchmaking(localStream);

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
      .getUserMedia({ video: { width: 1280, height: 720 }, audio: false })
      .then((mediaStream) => {
        stream = mediaStream;
        setLocalStream(mediaStream);
      })
      .catch((err) => console.error("[Camera]", err));

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
    if (status === "waiting" || status === "idle" || status === "connecting") {
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

      <div className="relative flex-1 grid min-h-0 grid-cols-1 gap-2 p-2 pb-64 sm:grid-cols-2 sm:gap-3 sm:p-3 sm:pb-56 lg:pb-52">
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

        {status === "matched" && emojiPrompt && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute top-5 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
          >
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-yellow-400/40 bg-black/75 px-7 py-3 shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-4">
                <span className="text-xs font-black uppercase tracking-[0.25em] text-yellow-300">Match</span>
                <motion.span
                  className="text-6xl leading-none"
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
                  <span className="text-xs font-black uppercase tracking-[0.2em]">Timer</span>
                  <span className="text-2xl font-black tabular-nums">{roundSeconds}s</span>
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
              className="flex flex-col items-center text-center gap-4 px-8"
            >
              <span className={`text-[clamp(4.5rem,12vw,9rem)] font-black uppercase leading-none tracking-tight drop-shadow-2xl ${finalResult.tone}`}>
                {finalResult.label}
              </span>
              <div className="flex items-end gap-8">
                <ScoreReadout label="You" score={finalScore} highlight />
                <ScoreReadout label="Rival" score={partnerScore} />
              </div>
              <p className="max-w-md text-zinc-200 text-base font-semibold">
                {finalResult.sub}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {status === "matched" && (
        <ChatBox
          messages={messages}
          onSend={sendChat}
          onSkip={skipUser}
          disabled={phase === "lobby"}
        />
      )}

      {(phase === "lobby" || status === "waiting") && !remoteStream && (
        <LobbyOverlay status={status} />
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
        <span className={`text-5xl font-black tabular-nums ${highlight ? "text-white" : "text-zinc-300"}`}>
          {formatScore(score)}
        </span>
        <span className="text-xl text-zinc-500 font-bold mb-1">/10</span>
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
        <p className="text-2xl font-black text-white tracking-tight">
          {status === "connecting" ? "Getting camera..." : "Finding your rival..."}
        </p>
        <p className="text-zinc-400 text-sm mt-1">
          Open a second tab to test locally
        </p>
      </div>
    </motion.div>
  );
}
