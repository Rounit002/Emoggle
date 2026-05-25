"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AnalyzingOverlay from "./AnalyzingOverlay";

const AI_JUDGE_URL =
  process.env.NEXT_PUBLIC_AI_JUDGE_URL ?? "http://localhost:8000";

interface JudgeResult {
  score: number;
  verdict: string;
  roast: string;
  items: { name: string; status: string; reason: string }[];
}

type Phase = "idle" | "analyzing" | "revealed";

interface UploadJudgeProps {
  onBack: () => void;
}

export default function UploadJudge({ onBack }: UploadJudgeProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<JudgeResult | null>(null);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setPreview(dataUrl);
      setPhase("idle");
      setResult(null);
      setJudgeError(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleAnalyze = async () => {
    if (!preview) return;
    const base64 = preview.replace(/^data:image\/\w+;base64,/, "");
    setPhase("analyzing");
    setJudgeError(null);

    try {
      const res = await fetch(`${AI_JUDGE_URL}/judge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.detail ?? "AI judge could not analyze this outfit.");
      }
      const data: JudgeResult = await res.json();
      setResult(data);
      setPhase("revealed");
    } catch (err) {
      console.error("[Judge]", err);
      setJudgeError(err instanceof Error ? err.message : "AI judge could not analyze this outfit.");
      setPhase("idle");
    }
  };

  const handleReset = () => {
    setPreview(null);
    setResult(null);
    setJudgeError(null);
    setPhase("idle");
  };

  const isDrip = result?.verdict === "Drip";

  return (
    <div className="relative w-screen h-screen bg-black flex flex-col overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-cyan-900/15 rounded-full blur-[140px] pointer-events-none" />

      {/* Header */}
      <header className="flex-none flex items-center gap-4 px-6 py-4 border-b border-zinc-800 bg-zinc-950 z-10">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm font-semibold transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <span className="text-xl font-black tracking-tight text-white">
          Emoggle
          <span className="text-zinc-500 font-normal text-base ml-2">— Solo Judge</span>
        </span>
      </header>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-6 min-h-0">
        <div className="w-full max-w-lg flex flex-col gap-5">

          {/* Drop zone / preview */}
          <div className="relative aspect-[3/4] max-h-[60vh] rounded-2xl overflow-hidden bg-zinc-900 border-2 border-dashed border-zinc-700 flex items-center justify-center">

            {/* Upload prompt */}
            {!preview && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`absolute inset-0 flex flex-col items-center justify-center gap-4 cursor-pointer transition-colors ${dragOver ? "bg-cyan-900/20 border-cyan-500" : ""}`}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <motion.div
                  animate={dragOver ? { scale: 1.15 } : { scale: 1 }}
                  className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-600 flex items-center justify-center"
                >
                  <svg className="w-8 h-8 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </motion.div>
                <div className="text-center">
                  <p className="text-white font-bold">Drop your fit here</p>
                  <p className="text-zinc-500 text-sm mt-1">or click to browse</p>
                </div>
                <p className="text-xs text-zinc-600">JPG, PNG, WEBP supported</p>
              </motion.div>
            )}

            {/* Preview image */}
            {preview && (
              <img
                src={preview}
                alt="outfit preview"
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}

            {/* Analyzing overlay on top of preview */}
            <AnimatePresence>
              {phase === "analyzing" && preview && <AnalyzingOverlay />}
            </AnimatePresence>

            {/* Reveal overlay on top of preview */}
            <AnimatePresence>
              {phase === "revealed" && result && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 flex flex-col items-end justify-between p-5 bg-gradient-to-t from-black/95 via-black/40 to-transparent"
                >
                  {/* Score badge top-right */}
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.1 }}
                    className="w-20 h-20 rounded-full border-4 border-white/20 bg-black/70 flex flex-col items-center justify-center"
                  >
                    <span className={`text-2xl font-black ${isDrip ? "text-emerald-400" : "text-red-500"}`}>
                      {result.score}
                    </span>
                    <span className="text-[9px] text-zinc-400 uppercase tracking-widest">/10</span>
                  </motion.div>

                  {/* Bottom verdict + roast */}
                  <div className="w-full">
                    <motion.span
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className={`block text-5xl font-black uppercase tracking-tighter mb-2 ${isDrip ? "text-emerald-400" : "text-red-500"}`}
                    >
                      {result.verdict}
                    </motion.span>
                    <motion.p
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.35 }}
                      className="text-sm text-zinc-200 leading-snug"
                    >
                      {result.roast}
                    </motion.p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Item breakdown */}
          <AnimatePresence>
            {phase === "revealed" && result && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 space-y-2"
              >
                {result.items.map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ x: -16, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.55 + i * 0.08 }}
                    className="flex items-start gap-3 bg-zinc-800 rounded-xl px-3 py-2"
                  >
                    <span className={`text-xs font-bold uppercase mt-0.5 px-2 py-0.5 rounded-full shrink-0 ${item.status === "Drip" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                      {item.status}
                    </span>
                    <div>
                      <span className="text-xs font-semibold text-zinc-200 capitalize">{item.name}</span>
                      <p className="text-xs text-zinc-500 leading-snug">{item.reason}</p>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {judgeError && (
            <div className="rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm font-semibold text-red-200">
              {judgeError}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {preview && phase === "idle" && (
              <>
                <button
                  onClick={handleReset}
                  className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-2xl text-sm transition-colors"
                >
                  Change Photo
                </button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleAnalyze}
                  className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-lg shadow-cyan-900/40 transition-colors"
                >
                  ⚡ Judge My Fit
                </motion.button>
              </>
            )}

            {phase === "revealed" && (
              <>
                <button
                  onClick={handleReset}
                  className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-2xl text-sm transition-colors"
                >
                  Try Another
                </button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleAnalyze}
                  className="flex-1 py-3 bg-zinc-700 hover:bg-zinc-600 text-white font-bold text-sm rounded-2xl transition-colors"
                >
                  🔁 Re-Judge
                </motion.button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
