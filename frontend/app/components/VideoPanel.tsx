"use client";

import { motion } from "framer-motion";
import { forwardRef, useEffect, useRef, type RefObject } from "react";
import AnalyzingOverlay from "./AnalyzingOverlay";
import type { FaceBox, FaceLandmark } from "../hooks/useExpressionScorer";
import { useMediaPipeFace, type MeshConnection } from "../context/MediaPipeFaceContext";

interface VideoPanelProps {
  label: string;
  isLocal: boolean;
  playerName?: string;
  country?: string | null;
  rankLabel?: string;
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  frozenFrame?: string | null;
  score?: number | null;
  liveScore?: number | null;
  opponentLiveScore?: number | null;
  verdict?: string | null;
  roast?: string | null;
  isRevealing: boolean;
  isPlaying?: boolean;
  isJudging?: boolean;
  scoreAlign?: "left" | "right";
  scanBox?: FaceBox | null;
  faceLandmarks?: FaceLandmark[] | null;
}

const VideoPanel = forwardRef<HTMLVideoElement, VideoPanelProps>(
  (
    {
      label,
      isLocal,
      playerName,
      country,
      rankLabel = "UNRANKED | 400 ELO",
      localStream,
      remoteStream,
      frozenFrame,
      score,
      liveScore,
      opponentLiveScore,
      verdict,
      roast,
      isRevealing,
      isPlaying = false,
      isJudging = false,
      scoreAlign = "right",
      scanBox = null,
      faceLandmarks = null,
    },
    ref
  ) => {
    const localVideoRef = useRef<HTMLVideoElement | null>(null);
    const panelBorder = isJudging
      ? "border-2 border-white/30 shadow-[0_0_0_3px_rgba(255,255,255,0.07),0_0_40px_8px_rgba(255,255,255,0.06)]"
      : "border border-zinc-700";

    return (
      <div className={`relative w-full h-full rounded-2xl overflow-hidden bg-zinc-900 transition-shadow duration-700 ${panelBorder}`}>
        <div className="pointer-events-none absolute inset-0 z-20 border border-white/10 shadow-[inset_0_0_80px_rgba(0,0,0,0.65)]" />
        <div className="pointer-events-none absolute inset-0 z-20 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[length:100%_4px] opacity-35 mix-blend-screen" />

        {!isRevealing && !isJudging && (
          <>
            <div className="absolute top-3 left-3 z-30 rounded-full border border-white/15 bg-black/65 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-zinc-200 backdrop-blur-md">
              {label}
            </div>
            <div className="absolute top-3 right-3 z-30 rounded-full border border-violet-300/30 bg-zinc-950/75 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-[0_0_22px_rgba(168,85,247,0.22)] backdrop-blur-md">
              {rankLabel.replace("|", " | ")}
            </div>
            <div className="absolute bottom-3 left-3 z-30 flex items-center gap-2 rounded-full border border-white/15 bg-black/65 px-3 py-1.5 backdrop-blur-md">
              {country && <span className="text-lg leading-none">{country.split(" ")[0]}</span>}
              <span className="text-xs font-black uppercase tracking-[0.16em] text-white">{playerName ?? label}</span>
            </div>
          </>
        )}

        {isPlaying && liveScore != null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`absolute top-14 ${scoreAlign === "left" ? "left-3" : "right-3"} z-30 w-32 rounded-xl border border-emerald-300/25 bg-zinc-950/80 px-3 py-2 shadow-[0_0_26px_rgba(57,255,20,0.14)] backdrop-blur-md sm:w-36`}
          >
            <div className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Overall Score</div>
            <div className="flex items-end gap-1">
              <span className="text-3xl font-black leading-none text-white tabular-nums">{liveScore.toFixed(1)}</span>
              <span className="mb-0.5 text-xs font-bold text-zinc-500">/10</span>
            </div>
            <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[9px] font-bold uppercase tracking-[0.12em]">
              <span className="text-zinc-500">Geo</span>
              <span className="truncate text-emerald-300">Live Mesh</span>
              <span className="text-zinc-500">Rival</span>
              <span className="truncate text-cyan-300">{opponentLiveScore == null ? "Syncing" : opponentLiveScore.toFixed(1)}</span>
            </div>
          </motion.div>
        )}

        {isLocal && (
          <FaceScanOverlay
            faceBox={scanBox}
            landmarks={faceLandmarks}
            mirrored={isLocal}
            videoRef={localVideoRef}
          />
        )}

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
          <LocalVideo
            ref={(node) => {
              localVideoRef.current = node;
              if (typeof ref === "function") ref(node);
              else if (ref) ref.current = node;
            }}
            stream={localStream ?? undefined}
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
              className="w-10 h-10 sm:w-16 sm:h-16 opacity-30"
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
            <span className="text-xs sm:text-sm tracking-wide">Waiting for match...</span>
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
    const video = videoRef.current;
    if (!video) return;

    if (!stream) {
      video.srcObject = null;
      return;
    }

    video.srcObject = stream;

    /* Clear the video element the instant any received track ends.
       This fires synchronously when either RTCPeerConnection is closed,
       so the partner's face disappears immediately without a frozen frame. */
    const clearOnEnd = () => {
      if (videoRef.current && videoRef.current.srcObject === stream) {
        videoRef.current.srcObject = null;
      }
    };

    stream.getTracks().forEach((track) => {
      track.addEventListener("ended", clearOnEnd);
    });

    return () => {
      stream.getTracks().forEach((track) => {
        track.removeEventListener("ended", clearOnEnd);
      });
    };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className="w-full h-full object-cover"
    />
  );
}

function getConnectionEnds(connection: MeshConnection) {
  return Array.isArray(connection)
    ? { start: connection[0], end: connection[1] }
    : connection;
}

const LocalVideo = forwardRef<HTMLVideoElement, { stream?: MediaStream }>(
  ({ stream }, ref) => {
    const localRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
      const video = localRef.current;
      if (!video) return;

      let ownedStream: MediaStream | null = null;
      let cancelled = false;

      const setVideoStream = (mediaStream: MediaStream) => {
        if (cancelled) return;
        video.srcObject = mediaStream;
        video.play().catch(() => {});
      };

      if (stream) {
        setVideoStream(stream);
      } else {
        navigator.mediaDevices
          .getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
            audio: false,
          })
          .then((mediaStream) => {
            ownedStream = mediaStream;
            setVideoStream(mediaStream);
          })
          .catch((err) => console.error("[Camera]", err));
      }

      return () => {
        cancelled = true;
        if (!stream) ownedStream?.getTracks().forEach((track) => track.stop());
        if (video.srcObject === ownedStream) video.srcObject = null;
      };
    }, [stream]);

    return (
      <video
        ref={(node) => {
          localRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        autoPlay
        playsInline
        muted
        className="h-full w-full scale-x-[-1] object-cover"
      />
    );
  }
);

LocalVideo.displayName = "LocalVideo";

function FaceScanOverlay({
  faceBox,
  landmarks,
  mirrored,
  videoRef,
}: {
  faceBox: FaceBox | null;
  landmarks: FaceLandmark[] | null;
  mirrored: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { contourConnections } = useMediaPipeFace();
  const box = landmarks?.length ? faceBox : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const video = videoRef.current;
    const syncCanvasResolution = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, video?.videoWidth || Math.floor(rect.width));
      const height = Math.max(1, video?.videoHeight || Math.floor(rect.height));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    };

    syncCanvasResolution();
    video?.addEventListener("loadeddata", syncCanvasResolution);
    window.addEventListener("resize", syncCanvasResolution);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      video?.removeEventListener("loadeddata", syncCanvasResolution);
      window.removeEventListener("resize", syncCanvasResolution);
      return;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!landmarks?.length) {
      video?.removeEventListener("loadeddata", syncCanvasResolution);
      window.removeEventListener("resize", syncCanvasResolution);
      return;
    }

    const toCanvas = (landmark: FaceLandmark) => ({
      x: (mirrored ? 1 - landmark.x : landmark.x) * canvas.width,
      y: landmark.y * canvas.height,
      z: landmark.z ?? 0,
    });

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#39ff14";
    ctx.lineWidth = 1;
    ctx.shadowColor = "#39ff14";
    ctx.shadowBlur = 4;

    const pointIndexes = new Set<number>();
    ctx.globalAlpha = 0.78;
    for (const connection of contourConnections) {
      const { start, end } = getConnectionEnds(connection);
      const a = landmarks[start];
      const b = landmarks[end];
      if (!a || !b) continue;
      pointIndexes.add(start);
      pointIndexes.add(end);
      const pa = toCanvas(a);
      const pb = toCanvas(b);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 4;
    ctx.fillStyle = "#39ff14";
    for (const index of pointIndexes) {
      const landmark = landmarks[index];
      if (!landmark) continue;
      const p = toCanvas(landmark);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return () => {
      video?.removeEventListener("loadeddata", syncCanvasResolution);
      window.removeEventListener("resize", syncCanvasResolution);
    };
  }, [contourConnections, landmarks, mirrored, videoRef]);

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover" />
      {box && (
        <>
          <div
            className="absolute h-7 w-7 border-l border-t border-emerald-300/75 shadow-[0_0_10px_rgba(57,255,20,0.5)]"
            style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%` }}
          />
          <div
            className="absolute h-7 w-7 border-r border-t border-emerald-300/75 shadow-[0_0_10px_rgba(57,255,20,0.5)]"
            style={{ left: `${(box.x + box.width) * 100}%`, top: `${box.y * 100}%`, transform: "translateX(-100%)" }}
          />
          <div
            className="absolute h-7 w-7 border-b border-l border-emerald-300/75 shadow-[0_0_10px_rgba(57,255,20,0.5)]"
            style={{ left: `${box.x * 100}%`, top: `${(box.y + box.height) * 100}%`, transform: "translateY(-100%)" }}
          />
          <div
            className="absolute h-7 w-7 border-b border-r border-emerald-300/75 shadow-[0_0_10px_rgba(57,255,20,0.5)]"
            style={{
              left: `${(box.x + box.width) * 100}%`,
              top: `${(box.y + box.height) * 100}%`,
              transform: "translate(-100%, -100%)",
            }}
          />
        </>
      )}
    </div>
  );
}
