"use client";

import { motion } from "framer-motion";
import Webcam from "react-webcam";
import { forwardRef, useEffect, useRef } from "react";
import AnalyzingOverlay from "./AnalyzingOverlay";
import type { FaceBox } from "../hooks/useExpressionScorer";

interface VideoPanelProps {
  label: string;
  isLocal: boolean;
  remoteStream?: MediaStream | null;
  frozenFrame?: string | null;
  score?: number | null;
  liveScore?: number | null;
  verdict?: string | null;
  roast?: string | null;
  isRevealing: boolean;
  isPlaying?: boolean;
  isJudging?: boolean;
  scoreAlign?: "left" | "right";
  scanBox?: FaceBox | null;
}

const VideoPanel = forwardRef<Webcam, VideoPanelProps>(
  (
    {
      label,
      isLocal,
      remoteStream,
      frozenFrame,
      score,
      liveScore,
      verdict,
      roast,
      isRevealing,
      isPlaying = false,
      isJudging = false,
      scoreAlign = "right",
      scanBox = null,
    },
    ref
  ) => {
    const panelBorder = isJudging
      ? "border-2 border-white/30 shadow-[0_0_0_3px_rgba(255,255,255,0.07),0_0_40px_8px_rgba(255,255,255,0.06)]"
      : "border border-zinc-700";

    return (
      <div className={`relative w-full h-full rounded-2xl overflow-hidden bg-zinc-900 transition-shadow duration-700 ${panelBorder}`}>
        {!isRevealing && !isJudging && (
          <div className="absolute top-3 left-3 z-10 bg-black/60 backdrop-blur-sm text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full text-zinc-300 border border-zinc-600">
            {label}
          </div>
        )}

        {isPlaying && liveScore != null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`absolute top-3 ${scoreAlign === "left" ? "left-3" : "right-3"} z-20 flex flex-col items-center justify-center w-16 h-16 rounded-2xl border-2 border-yellow-400/60 bg-black/75 backdrop-blur-sm`}
          >
            <span className="text-2xl font-black leading-none text-yellow-300 tabular-nums">
              {liveScore.toFixed(1)}
            </span>
            <span className="text-[8px] text-zinc-400 uppercase tracking-widest">/10</span>
          </motion.div>
        )}

        {isPlaying && <FaceScanOverlay faceBox={scanBox} />}

        {isRevealing && score !== null && verdict && (
          <motion.div
            initial={{ opacity: 0, scale: 0.7, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 22, delay: 0.1 }}
            className={`absolute top-3 ${scoreAlign === "left" ? "left-3 flex-row" : "right-3 flex-row-reverse"} z-20 flex items-center gap-2`}
          >
            <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl border-2 bg-black/80 backdrop-blur-sm ${
              verdict === "Drip" ? "border-emerald-400/60" : "border-red-500/60"
            }`}>
              <span className={`text-xl font-black leading-none ${
                verdict === "Drip" ? "text-emerald-400" : "text-red-500"
              }`}>{score}</span>
              <span className="text-[8px] text-zinc-500 uppercase tracking-widest">/10</span>
            </div>
            <span className={`text-2xl font-black uppercase tracking-tight drop-shadow-lg ${
              verdict === "Drip" ? "text-emerald-400" : "text-red-500"
            }`}>{verdict}</span>
          </motion.div>
        )}

        {isLocal && !frozenFrame && (
          <Webcam
            ref={ref}
            audio={false}
            mirrored={true}
            videoConstraints={{ width: 1280, height: 720, facingMode: "user" }}
            className="w-full h-full object-cover"
          />
        )}

        {!isLocal && !frozenFrame && (
          <RemoteVideo stream={remoteStream ?? null} />
        )}

        {frozenFrame && (
          <img
            src={frozenFrame}
            alt="frozen frame"
            className="w-full h-full object-cover"
          />
        )}

        {!isLocal && !remoteStream && !frozenFrame && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 gap-2">
            <svg
              className="w-16 h-16 opacity-30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"
              />
            </svg>
            <span className="text-sm tracking-wide">Waiting for match...</span>
          </div>
        )}

        {isJudging && <AnalyzingOverlay />}

        {isRevealing && verdict && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none"
          />
        )}

        {isRevealing && roast && (
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="absolute bottom-5 left-4 right-4 z-10 text-center text-sm text-zinc-200 leading-snug drop-shadow"
          >
            {roast}
          </motion.p>
        )}
      </div>
    );
  }
);

VideoPanel.displayName = "VideoPanel";
export default VideoPanel;

function RemoteVideo({ stream }: { stream: MediaStream | null }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="w-full h-full object-cover"
    />
  );
}

function FaceScanOverlay({ faceBox }: { faceBox: FaceBox | null }) {
  const box = faceBox ?? { x: 0.34, y: 0.2, width: 0.32, height: 0.5 };

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      <motion.div
        className="absolute rounded-[46%] border border-emerald-300/80 bg-emerald-400/[0.03] shadow-[0_0_24px_rgba(52,211,153,0.45)]"
        style={{
          left: `${box.x * 100}%`,
          top: `${box.y * 100}%`,
          width: `${box.width * 100}%`,
          height: `${box.height * 100}%`,
        }}
        animate={{ scale: [0.98, 1.03, 0.98], opacity: [0.7, 1, 0.7] }}
        transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
      >
        <div className="absolute inset-0 rounded-[46%] bg-[linear-gradient(rgba(52,211,153,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(52,211,153,0.22)_1px,transparent_1px)] bg-[length:16px_16px]" />
        <div className="absolute -left-2 -top-2 h-6 w-6 border-l-2 border-t-2 border-emerald-300" />
        <div className="absolute -right-2 -top-2 h-6 w-6 border-r-2 border-t-2 border-emerald-300" />
        <div className="absolute -bottom-2 -left-2 h-6 w-6 border-b-2 border-l-2 border-emerald-300" />
        <div className="absolute -bottom-2 -right-2 h-6 w-6 border-b-2 border-r-2 border-emerald-300" />
        <motion.div
          className="absolute left-[12%] right-[12%] top-1/2 h-px bg-emerald-200/90 shadow-[0_0_12px_rgba(167,243,208,0.9)]"
          animate={{ y: ["-220%", "220%", "-220%"] }}
          transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
        />
      </motion.div>
    </div>
  );
}
