"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Webcam from "react-webcam";
import VideoPanel from "./VideoPanel";
import { useExpressionScorer } from "../hooks/useExpressionScorer";

const ROUND_SECONDS = 10;
const EMOJI_PROMPTS = [
  "\u{1F600}",
  "\u{1F601}",
  "\u{1F602}",
  "\u{1F62E}",
  "\u{1F632}",
  "\u{1F609}",
  "\u{1F61C}",
  "\u{1F621}",
  "\u{1F624}",
  "\u{1F622}",
  "\u{1F62D}",
  "\u{1F60E}",
  "\u{1F928}",
  "\u{1F610}",
  "\u{1F611}",
  "\u{1F633}",
  "\u{1F62C}",
  "\u{1F60F}",
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
  return Math.max(0, Math.min(10, Number((rawScore / 10).toFixed(1))));
}

function formatScore(score: number | null) {
  return score === null ? "--" : score.toFixed(1);
}

function soloResult(score: number | null) {
  if (score === null) {
    return { label: "No Face Card", tone: "text-yellow-300", sub: "Could not lock a face score this round." };
  }
  if (score >= 8.5) return { label: "Ate That", tone: "text-emerald-300", sub: "That emoji impression had main-character accuracy." };
  if (score >= 7) return { label: "Face Card Valid", tone: "text-emerald-300", sub: "Solid match. The face was facing." };
  if (score >= 5) return { label: "Kinda Cooked", tone: "text-yellow-300", sub: "Close enough to count, but there is room to mog harder." };
  return { label: "Try Again Bestie", tone: "text-red-300", sub: "The emoji did not feel seen this time." };
}

export default function SoloFaceJudge({ onBack }: SoloFaceJudgeProps) {
  const webcamRef = useRef<Webcam>(null);
  const samplesRef = useRef<number[]>([]);
  const [phase, setPhase] = useState<SoloPhase>("ready");
  const [emojiPrompt, setEmojiPrompt] = useState(() => pickEmoji());
  const [roundSeconds, setRoundSeconds] = useState(ROUND_SECONDS);
  const [bestScore, setBestScore] = useState<number | null>(null);
  const [finalScore, setFinalScore] = useState<number | null>(null);

  const noopScore = useCallback(() => {}, []);
  const expression = useExpressionScorer(
    webcamRef,
    emojiPrompt,
    phase === "playing",
    noopScore
  );

  const liveScore = toTenPoint(expression.score);

  useEffect(() => {
    if (phase !== "playing" || liveScore === null) return;
    samplesRef.current.push(liveScore);
    setBestScore((current) => (current === null || liveScore > current ? liveScore : current));
  }, [liveScore, phase]);

  useEffect(() => {
    if (phase !== "playing") return;

    const timer = window.setInterval(() => {
      setRoundSeconds((seconds) => {
        if (seconds <= 1) {
          window.clearInterval(timer);
          const samples = samplesRef.current;
          const score = samples.length
            ? Number((samples.reduce((sum, sample) => sum + sample, 0) / samples.length).toFixed(1))
            : 0;
          setFinalScore(score);
          setPhase("results");
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [phase]);

  const statusText = useMemo(() => {
    if (phase !== "playing") return "Solo scan";
    if (expression.status === "loading") return "Loading face tracker...";
    if (expression.status === "no-face") return "Face not found";
    if (expression.status === "error") return "Face tracker unavailable";
    return "Scanning your face";
  }, [expression.status, phase]);

  const result = soloResult(finalScore);

  const startRound = () => {
    samplesRef.current = [];
    setBestScore(null);
    setFinalScore(null);
    setRoundSeconds(ROUND_SECONDS);
    setPhase("playing");
  };

  const nextEmoji = () => {
    setEmojiPrompt((current) => pickEmoji(current));
    samplesRef.current = [];
    setBestScore(null);
    setFinalScore(null);
    setRoundSeconds(ROUND_SECONDS);
    setPhase("ready");
  };

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-black">
      <header className="z-10 flex flex-none flex-col gap-2 border-b border-zinc-800 bg-zinc-950 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 transition-colors hover:text-white"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <span className="text-lg font-black tracking-tight text-white sm:text-xl">Emoggle</span>
          <span className="rounded-full bg-cyan-500 px-2.5 py-1 text-xs font-semibold text-white">Solo</span>
        </div>
        <span className={expression.status === "ready" ? "text-sm font-bold text-emerald-300" : "text-sm font-bold text-yellow-300"}>
          {statusText}
        </span>
      </header>

      <main className="relative grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="relative min-h-[42vh] lg:min-h-0">
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

        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="flex min-h-[260px] flex-col overflow-hidden rounded-2xl border border-cyan-400/30 bg-zinc-950 shadow-2xl shadow-cyan-950/30"
        >
          <div className="flex flex-none items-center justify-between border-b border-zinc-800 px-4 py-3">
            <span className="text-xs font-black uppercase tracking-[0.25em] text-cyan-300">Emoji Target</span>
            {phase === "playing" && (
              <div className="flex items-center gap-2 text-cyan-100">
                <span className="text-xs font-black uppercase tracking-[0.2em]">Timer</span>
                <span className="text-2xl font-black tabular-nums">{roundSeconds}s</span>
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-5 py-6 text-center">
            <AnimatedEmojiTarget emoji={emojiPrompt} active={phase === "playing"} />

            <div className="flex flex-col items-center gap-2">
              <span className={phase === "playing" ? "text-sm font-black uppercase tracking-[0.22em] text-cyan-200" : "text-sm font-black uppercase tracking-[0.22em] text-zinc-400"}>
                {phase === "playing" ? "Match this face" : "Ready when you are"}
              </span>
              <div className="flex items-end gap-1">
                <span className="text-5xl font-black tabular-nums text-white">{formatScore(phase === "results" ? finalScore : liveScore)}</span>
                <span className="mb-1 text-xl font-bold text-zinc-500">/10</span>
              </div>
            </div>

            {phase === "playing" && bestScore !== null && (
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Best {formatScore(bestScore)}/10
              </span>
            )}

            {phase !== "playing" && (
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  onClick={startRound}
                  className="rounded-full bg-cyan-500 px-7 py-3 text-sm font-black uppercase tracking-widest text-black shadow-lg shadow-cyan-900/30 transition-colors hover:bg-cyan-400"
                >
                  {phase === "results" ? "Try Again" : "Start Scan"}
                </button>
                <button
                  onClick={nextEmoji}
                  className="rounded-full border border-zinc-600 bg-zinc-900/90 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-zinc-800"
                >
                  New Emoji
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </main>

      <AnimatePresence>
        {phase === "results" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.78, opacity: 0, y: 18 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className="flex flex-col items-center gap-4 px-8 text-center"
            >
              <span className={`text-[clamp(4rem,11vw,8rem)] font-black uppercase leading-none tracking-tight drop-shadow-2xl ${result.tone}`}>
                {result.label}
              </span>
              <div className="flex items-end gap-1">
                <span className="text-6xl font-black tabular-nums text-white">{formatScore(finalScore)}</span>
                <span className="mb-2 text-2xl font-bold text-zinc-400">/10</span>
              </div>
              <p className="max-w-md text-base font-semibold text-zinc-200">{result.sub}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AnimatedEmojiTarget({ emoji, active }: { emoji: string; active: boolean }) {
  return (
    <motion.div
      className="relative flex h-48 w-48 items-center justify-center overflow-hidden rounded-[2rem] border border-cyan-400/30 bg-cyan-400/10 shadow-[inset_0_0_44px_rgba(34,211,238,0.1),0_0_38px_rgba(34,211,238,0.12)] sm:h-60 sm:w-60"
      animate={
        active
          ? {
              scale: [1, 1.025, 1],
              boxShadow: [
                "inset 0 0 44px rgba(34,211,238,0.10), 0 0 30px rgba(34,211,238,0.12)",
                "inset 0 0 58px rgba(34,211,238,0.18), 0 0 56px rgba(34,211,238,0.22)",
                "inset 0 0 44px rgba(34,211,238,0.10), 0 0 30px rgba(34,211,238,0.12)",
              ],
            }
          : { scale: 1 }
      }
      transition={{ repeat: active ? Infinity : 0, duration: 1.25, ease: "easeInOut" }}
    >
      <motion.div
        className="absolute inset-4 rounded-[1.5rem] border border-cyan-200/15"
        animate={active ? { scale: [0.96, 1.04, 0.96], opacity: [0.35, 0.8, 0.35] } : { scale: 1, opacity: 0.35 }}
        transition={{ repeat: active ? Infinity : 0, duration: 1.4, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute inset-9 rounded-full border border-cyan-300/20"
        animate={active ? { rotate: 360, opacity: [0.2, 0.55, 0.2] } : { rotate: 0, opacity: 0.25 }}
        transition={{ repeat: active ? Infinity : 0, duration: 3.8, ease: "linear" }}
      />
      {active && (
        <motion.div
          className="absolute -left-1/3 top-0 h-full w-1/3 skew-x-[-18deg] bg-cyan-200/10"
          animate={{ x: ["0%", "430%"] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        />
      )}

      <AnimatePresence mode="wait">
        <motion.span
          key={emoji}
          className="relative z-10 select-none text-8xl leading-none drop-shadow-[0_18px_26px_rgba(0,0,0,0.45)] sm:text-9xl"
          initial={{ opacity: 0, y: 18, rotate: -10, scale: 0.68 }}
          animate={
            active
              ? {
                  opacity: 1,
                  y: [0, -9, 0, 5, 0],
                  rotate: [-3, 4, -2, 3, -3],
                  scaleX: [1, 1.08, 0.96, 1.04, 1],
                  scaleY: [1, 0.94, 1.08, 0.98, 1],
                  filter: [
                    "saturate(1)",
                    "saturate(1.22)",
                    "saturate(1)",
                  ],
                }
              : { opacity: 1, y: 0, rotate: 0, scale: 1, scaleX: 1, scaleY: 1, filter: "saturate(1)" }
          }
          exit={{ opacity: 0, y: -18, rotate: 10, scale: 0.72 }}
          transition={
            active
              ? { repeat: Infinity, duration: 1.15, ease: "easeInOut" }
              : { type: "spring", stiffness: 360, damping: 20 }
          }
        >
          {emoji}
        </motion.span>
      </AnimatePresence>

      <div className="absolute bottom-4 flex items-end gap-1.5">
        {[0, 1, 2, 3, 4].map((bar) => (
          <motion.span
            key={bar}
            className="h-2 w-1 rounded-full bg-cyan-300/70"
            animate={active ? { height: [7, 18 + (bar % 3) * 5, 7], opacity: [0.35, 0.9, 0.35] } : { height: 7, opacity: 0.35 }}
            transition={{ repeat: active ? Infinity : 0, duration: 0.75, delay: bar * 0.08, ease: "easeInOut" }}
          />
        ))}
      </div>
    </motion.div>
  );
}
