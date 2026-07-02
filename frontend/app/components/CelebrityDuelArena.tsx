"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import VideoPanel from "./VideoPanel";
import Countdown from "./Countdown";
import ChatBox from "./ChatBox";
import { useMatchmaking } from "../hooks/useMatchmaking";
import { useExpressionScorer } from "../hooks/useExpressionScorer";
import { useUserProfile } from "../context/UserProfileContext";
import type { MatchSeeking } from "../context/UserProfileContext";

const ROUND_SECONDS = 10;
const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL ?? "http://localhost:3001";

type AppPhase = "lobby" | "dueling" | "countdown" | "playing" | "results";

interface CelebrityDuelArenaProps {
  onBack: () => void;
  initialSeeking?: MatchSeeking;
}

interface CelebrityFace {
  id: number;
  name: string;
  category: string;
  imageUrl: string;
  difficulty: string;
  facialLandmarks?: any;
}

interface RankSnapshot {
  tier: string;
  elo: number;
  delta: number | null;
}

const DEFAULT_RANK: RankSnapshot = { tier: "Statue", elo: 400, delta: null };

function formatScore(score: number | null) {
  return score === null ? "--" : score.toFixed(1);
}

function resultCopy(myScore: number | null, rivalScore: number | null, winner?: "you" | "rival" | "tie") {
  if (myScore === null || rivalScore === null) {
    return {
      label: "Hold Up",
      tone: "text-yellow-300",
      sub: "Waiting for rival score...",
    };
  }

  if (winner === "tie") {
    return {
      label: "Perfect Match",
      tone: "text-yellow-300",
      sub: "Both nailed the celebrity face equally!",
    };
  }
  if (winner === "you") {
    return {
      label: myScore >= 8 ? "Spot On!" : "You Win",
      tone: "text-emerald-300",
      sub: "Your celebrity impression was closer!",
    };
  }
  if (winner === "rival") {
    return {
      label: rivalScore >= 8 ? "Crushed It" : "Close Call",
      tone: "text-red-300",
      sub: "Rival matched the celebrity better this round.",
    };
  }

  const diff = myScore - rivalScore;
  if (Math.abs(diff) <= 1) {
    return {
      label: "Perfect Match",
      tone: "text-yellow-300",
      sub: "That's basically a tie!",
    };
  }
  if (diff > 0) {
    return {
      label: "You Win",
      tone: "text-emerald-300",
      sub: "Your celebrity mimicry was on point!",
    };
  }
  return {
    label: "Close Call",
    tone: "text-red-300",
    sub: "Rival captured that celebrity face better.",
  };
}

export default function CelebrityDuelArena({ onBack, initialSeeking = "Anyone" }: CelebrityDuelArenaProps) {
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
  const [celebrityFace, setCelebrityFace] = useState<CelebrityFace | null>(null);
  const [searchSession, setSearchSession] = useState(0);
  const [noOneFound, setNoOneFound] = useState(false);
  const [myCountry, setMyCountry] = useState<string | null>(null);
  const [myRank, setMyRank] = useState<RankSnapshot>(DEFAULT_RANK);
  const [partnerRank, setPartnerRank] = useState<RankSnapshot>(DEFAULT_RANK);
  
  const { profile, saveProfile } = useUserProfile();

  // Fetch random celebrity face
  const fetchCelebrityFace = useCallback(async () => {
    try {
      const res = await fetch(`${SIGNALING_URL}/api/celebrity/random`);
      if (!res.ok) throw new Error('Failed to fetch celebrity face');
      const data = await res.json();
      setCelebrityFace(data);
      return data;
    } catch (error) {
      console.error('[Celebrity] Error fetching face:', error);
      // Fallback to a default or show error
      return null;
    }
  }, []);

  const {
    status,
    remoteStream,
    partnerPeerId,
    partnerUsername,
    partnerCountry,
    partnerGender,
    partnerScore,
    messages: chat,
    rivalTyping: typingIndicator,
    countdown,
    matchResult,
    submitScore: sendScore,
    sendChat: sendChatMessage,
    sendTyping: setTypingIndicator,
    skipUser: skipMatch,
    stopMatching: stopMatchmaking,
    startMatching,
  } = useMatchmaking(
    localStream,
    null,
    profile,
    initialSeeking || "Anyone",
    saveProfile
  );

  const expression = useExpressionScorer(webcamRef, "\u{1F600}", phase === "playing", () => {});
  const currentScore = expression.score;

  // Webcam setup
  useEffect(() => {
    let cancelled = false;
    const initMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setLocalStream(stream);
        if (webcamRef.current) {
          webcamRef.current.srcObject = stream;
          await webcamRef.current.play();
        }
      } catch (err) {
        console.error("[Webcam] Error:", err);
      }
    };
    initMedia();
    return () => {
      cancelled = true;
      localStream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Score tracking
  useEffect(() => {
    if (phase === "playing" && currentScore !== null) {
      const clamped = Math.max(0, Math.min(10, currentScore));
      if (clamped > bestScoreRef.current) {
        bestScoreRef.current = clamped;
        setBestScore(clamped);
      }
      scoreSamplesRef.current.push(clamped);
    }
  }, [currentScore, phase]);

  useEffect(() => {
    if (status === "matched") {
      setPhase("dueling");
      setRoundSeconds(ROUND_SECONDS);
      setBestScore(null);
      setFinalScore(null);
      bestScoreRef.current = 0;
      scoreSamplesRef.current = [];
      submittedRef.current = false;
      fetchCelebrityFace();
    }
    if (status === "waiting" || status === "idle" || status === "connecting" || status === "stopped") {
      setPhase("lobby");
    }
  }, [fetchCelebrityFace, status]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      setPhase("countdown");
    } else {
      setRoundSeconds(ROUND_SECONDS);
      bestScoreRef.current = 0;
      scoreSamplesRef.current = [];
      submittedRef.current = false;
      setPhase("playing");
    }
  }, [countdown]);

  useEffect(() => {
    if (!matchResult) return;
    setFinalScore(matchResult.myScore);
    setPhase("results");
  }, [matchResult]);

  // Round timer
  useEffect(() => {
    if (phase !== "playing") return;
    const timer = setInterval(() => {
      setRoundSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (!submittedRef.current) {
            submittedRef.current = true;
            const samples = scoreSamplesRef.current;
            const final = samples.length > 0
              ? samples.reduce((a, b) => a + b, 0) / samples.length
              : bestScoreRef.current;
            setFinalScore(final);
            sendScore(final);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, sendScore]);

  const handleSkip = useCallback(() => {
    skipMatch();
    setPhase("lobby");
    setBestScore(null);
    setFinalScore(null);
    setCelebrityFace(null);
    setSearchSession((s) => s + 1);
  }, [skipMatch]);

  const handlePlayAgain = useCallback(() => {
    setPhase("lobby");
    setBestScore(null);
    setFinalScore(null);
    setCelebrityFace(null);
    startMatching();
    setSearchSession((s) => s + 1);
  }, [startMatching]);

  const handleStop = useCallback(() => {
    stopMatchmaking();
    localStream?.getTracks().forEach((t) => t.stop());
    onBack();
  }, [stopMatchmaking, localStream, onBack]);

  const toggleMic = useCallback(() => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = isMicMuted;
    });
    setIsMicMuted(!isMicMuted);
  }, [localStream, isMicMuted]);

  const finalMyScore = finalScore ?? bestScore;
  const rivalScore = matchResult?.partnerScore ?? partnerScore;
  const winner = matchResult?.winner ?? (
    finalMyScore !== null && rivalScore !== null
      ? finalMyScore > rivalScore ? "you" : finalMyScore < rivalScore ? "rival" : "tie"
      : undefined
  );
  const resultData = resultCopy(finalMyScore, rivalScore, winner);

  return (
    <div className="relative w-screen min-h-screen bg-[#0b0c14] flex items-center justify-center overflow-hidden">
      {/* Background effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[320px] bg-pink-700/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-purple-900/20 rounded-full blur-[80px] pointer-events-none" />

      {/* Header */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-20">
        <button
          onClick={handleStop}
          className="px-4 py-2 rounded-xl bg-zinc-900/80 border border-zinc-700 text-sm font-bold text-zinc-200 hover:text-white hover:border-zinc-500 transition-colors"
        >
          ← Stop
        </button>
        <div className="text-center">
          <h1 className="text-xl font-black text-white uppercase tracking-wider">Celebrity Mimic</h1>
          <p className="text-xs text-pink-300 uppercase tracking-widest">Match the famous face</p>
        </div>
        <div className="w-20" />
      </div>

      {/* Main content */}
      <div className="w-full max-w-6xl px-4 py-20 z-10">
        <AnimatePresence mode="wait">
          {/* Lobby - Searching */}
          {phase === "lobby" && (
            <motion.div
              key="lobby"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center gap-6"
            >
              <div className="text-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="w-16 h-16 mx-auto mb-4 rounded-full border-4 border-pink-500/30 border-t-pink-500"
                />
                <h2 className="text-2xl font-black text-white">Finding a celebrity face mimicker...</h2>
                <p className="text-sm text-zinc-400 mt-2">Matching you with another player</p>
              </div>
            </motion.div>
          )}

          {/* Countdown */}
          {phase === "countdown" && (
            <Countdown count={countdown} />
          )}

          {/* Playing */}
          {phase === "playing" && (
            <motion.div
              key="playing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col lg:flex-row items-start justify-center gap-6"
            >
              {/* My video */}
              <div className="flex-1">
                <VideoPanel
                  ref={webcamRef}
                  label="YOU"
                  playerName={profile?.username ?? "You"}
                  country={myCountry}
                  isLocal={true}
                  localStream={localStream}
                  frozenFrame={null}
                  score={bestScore}
                  liveScore={bestScore}
                  verdict={null}
                  roast={null}
                  isRevealing={false}
                  isPlaying={phase === "playing"}
                  scanBox={expression.faceBox}
                  faceLandmarks={expression.faceLandmarks}
                />
              </div>

              {/* Celebrity face in center */}
              <div className="flex-none w-80">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="relative rounded-2xl border-4 border-pink-500 bg-zinc-900 p-6 text-center"
                >
                  {celebrityFace ? (
                    <>
                      <img
                        src={celebrityFace.imageUrl}
                        alt={celebrityFace.name}
                        className="w-full h-64 object-cover rounded-xl mb-4"
                      />
                      <h3 className="text-xl font-black text-white uppercase">{celebrityFace.name}</h3>
                      <p className="text-xs text-pink-300 uppercase tracking-widest mt-1">{celebrityFace.category}</p>
                      <div className="mt-4 text-4xl font-black text-pink-400">{roundSeconds}s</div>
                    </>
                  ) : (
                    <div className="w-full h-64 flex items-center justify-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-4 border-pink-500/30 border-t-pink-500" />
                    </div>
                  )}
                </motion.div>
              </div>

              {/* Partner video */}
              <div className="flex-1">
                <VideoPanel
                  label="RIVAL"
                  playerName={partnerUsername ?? "Opponent"}
                  country={partnerGender ? `${partnerGender}${partnerCountry ? ` | ${partnerCountry}` : ""}` : partnerCountry}
                  isLocal={false}
                  remoteStream={remoteStream}
                  frozenFrame={null}
                  score={null}
                  liveScore={partnerScore}
                  verdict={null}
                  roast={null}
                  isRevealing={false}
                  isPlaying={phase === "playing"}
                />
              </div>
            </motion.div>
          )}

          {/* Results */}
          {phase === "results" && (
            <motion.div
              key="results"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-2xl mx-auto"
            >
              <div className="rounded-2xl border border-pink-500/30 bg-zinc-900/90 p-8 text-center">
                <motion.h2
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className={`text-4xl font-black uppercase ${resultData.tone}`}
                >
                  {resultData.label}
                </motion.h2>
                <motion.p
                  initial={{ y: -10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-sm text-zinc-400 mt-2"
                >
                  {resultData.sub}
                </motion.p>

                <div className="grid grid-cols-2 gap-6 mt-8">
                  <div className="text-center">
                    <p className="text-xs text-zinc-500 uppercase tracking-widest">Your Score</p>
                    <p className="text-5xl font-black text-white mt-2">{formatScore(finalMyScore)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-zinc-500 uppercase tracking-widest">Rival Score</p>
                    <p className="text-5xl font-black text-white mt-2">{formatScore(rivalScore)}</p>
                  </div>
                </div>

                {celebrityFace && (
                  <div className="mt-6 p-4 rounded-xl bg-pink-900/20 border border-pink-500/20">
                    <p className="text-xs text-pink-300 uppercase tracking-widest">Celebrity Face</p>
                    <p className="text-lg font-black text-white mt-1">{celebrityFace.name}</p>
                  </div>
                )}

                <div className="flex gap-4 mt-8">
                  <button
                    onClick={handlePlayAgain}
                    className="flex-1 py-3 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-black uppercase transition-colors"
                  >
                    Play Again
                  </button>
                  <button
                    onClick={handleSkip}
                    className="flex-1 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-black uppercase transition-colors"
                  >
                    New Partner
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Chat box */}
      {(phase === "playing" || phase === "results") && (
        <div className="absolute bottom-4 right-4 z-20">
          <ChatBox
            messages={chat}
            onSend={sendChatMessage}
            onTyping={setTypingIndicator}
            rivalTyping={typingIndicator}
            onSkip={handleSkip}
            onStop={handleStop}
          />
        </div>
      )}

      {/* Controls */}
      {(phase === "playing" || phase === "results") && (
        <div className="absolute bottom-4 left-4 flex gap-3 z-20">
          <button
            onClick={toggleMic}
            className={`px-4 py-2 rounded-xl border ${
              isMicMuted
                ? "bg-red-900/50 border-red-500 text-red-300"
                : "bg-zinc-900/80 border-zinc-700 text-zinc-200"
            } font-bold text-sm hover:scale-105 transition-all`}
          >
            {isMicMuted ? "🔇 Unmute" : "🎤 Mute"}
          </button>
          <button
            onClick={handleSkip}
            className="px-4 py-2 rounded-xl bg-zinc-900/80 border border-zinc-700 text-zinc-200 hover:text-white hover:border-zinc-500 font-bold text-sm transition-colors"
          >
            Skip Partner
          </button>
        </div>
      )}

      {/* Hidden webcam video element */}
      <video ref={webcamRef} className="hidden" playsInline />
    </div>
  );
}
