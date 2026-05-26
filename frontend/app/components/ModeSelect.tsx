"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ModeSelectProps {
  onSelect: (mode: "camera" | "solo") => void;
}

const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL ?? "http://localhost:3001";

export default function ModeSelect({ onSelect }: ModeSelectProps) {
  const [showModes, setShowModes] = useState(false);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchCount = async () => {
      try {
        const res = await fetch(`${SIGNALING_URL}/online`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.count === "number") {
          setOnlineCount(data.count);
        }
      } catch {
        /* ignore — server may be offline */
      }
    };
    fetchCount();
    const interval = setInterval(fetchCount, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="relative w-screen min-h-screen bg-[#0b0c14] flex flex-col items-center overflow-x-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[320px] bg-violet-700/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-indigo-900/20 rounded-full blur-[80px] pointer-events-none" />

      <div className="w-full max-w-sm sm:max-w-md lg:max-w-lg px-5 sm:px-8 py-8 sm:py-12 lg:py-16 flex flex-col items-center gap-4 sm:gap-5 z-10">

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="text-center"
        >
          <h1 className="text-[3rem] sm:text-[4.5rem] lg:text-[6rem] font-black tracking-[-0.03em] text-white uppercase leading-none">
            Emoggle
          </h1>
        </motion.div>

        {/* Privacy notice */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="text-center text-xs sm:text-sm text-zinc-400 leading-snug max-w-[260px] sm:max-w-sm"
        >
          <span className="text-yellow-400 mr-1">⚠</span>
          Emoggle does not sell, store, or use your face to train AI models.
        </motion.div>

        {/* Online badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25, duration: 0.4 }}
          className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-zinc-900 border border-zinc-700"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          {onlineCount !== null ? (
            <span className="text-xs font-bold text-zinc-200 uppercase tracking-widest">
              ~{onlineCount < 10 ? onlineCount : Math.round(onlineCount / 5) * 5} Online Now
            </span>
          ) : (
            <span className="text-xs font-bold text-zinc-200 uppercase tracking-widest">Online Now</span>
          )}
        </motion.div>

        {/* Main action card */}
        <AnimatePresence mode="wait">
          {!showModes ? (
            <motion.div
              key="arena-card"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, scale: 0.96 }}
              transition={{ delay: 0.35, duration: 0.5, ease: "easeOut" }}
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/70 backdrop-blur-sm px-6 py-8 sm:py-10 flex flex-col items-center gap-4 text-center"
            >
              {/* Swords icon */}
              <div className="relative w-16 h-16 flex items-center justify-center">
                <span className="text-5xl">⚔️</span>
              </div>

              <div>
                <h2 className="text-xl sm:text-2xl font-black uppercase tracking-[0.06em] text-white">
                  Enter the Arena
                </h2>
                <button
                  onClick={() => setShowModes(true)}
                  className="mt-2 text-sm font-bold text-violet-400 hover:text-violet-300 uppercase tracking-[0.12em] transition-colors"
                >
                  Choose your mode →
                </button>
              </div>

              <p className="text-[11px] text-zinc-500 leading-relaxed max-w-[220px]">
                By entering the arena you agree to fair play and emoji expression rules.
              </p>

              <motion.button
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setShowModes(true)}
                className="w-full mt-1 py-3 sm:py-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black uppercase tracking-[0.12em] text-sm transition-colors shadow-lg shadow-violet-900/40"
              >
                Enter the Arena
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="mode-cards"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.42, ease: "easeOut" }}
              className="w-full flex flex-col gap-3 sm:gap-4"
            >
              <div className="flex items-center justify-between mb-1">
                <button
                  onClick={() => setShowModes(false)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Pick your mode</span>
              </div>

              {/* Live Duel card */}
              <motion.button
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05, duration: 0.38 }}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSelect("camera")}
                className="group relative w-full flex items-center gap-4 sm:gap-5 p-4 sm:p-5 rounded-2xl bg-zinc-900 border border-zinc-700 hover:border-yellow-400/60 text-left transition-colors overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex-none w-14 h-14 rounded-xl bg-yellow-500/15 border border-yellow-400/30 flex items-center justify-center group-hover:bg-yellow-500/25 transition-colors">
                  <svg className="w-7 h-7 text-yellow-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-2.796A.75.75 0 0121 8.374v7.252a.75.75 0 01-1.03.696L15.75 13.5M3.375 7.5h10.5A1.875 1.875 0 0115.75 9.375v5.25A1.875 1.875 0 0113.875 16.5H3.375A1.875 1.875 0 011.5 14.625v-5.25A1.875 1.875 0 013.375 7.5z" />
                  </svg>
                </div>
                <div className="flex-1 z-10">
                  <p className="text-base font-black text-white tracking-tight">Live Face Duel</p>
                  <p className="text-zinc-400 text-xs mt-0.5 leading-snug">Match the emoji vs a random stranger. Mic + cam.</p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                    <span className="text-[10px] font-bold text-yellow-300 uppercase tracking-widest">Live Match</span>
                  </div>
                </div>
                <svg className="w-4 h-4 text-zinc-600 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </motion.button>

              {/* Solo card */}
              <motion.button
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.12, duration: 0.38 }}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSelect("solo")}
                className="group relative w-full flex items-center gap-4 sm:gap-5 p-4 sm:p-5 rounded-2xl bg-zinc-900 border border-zinc-700 hover:border-cyan-400/60 text-left transition-colors overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex-none w-14 h-14 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-2xl group-hover:bg-cyan-500/25 transition-colors">
                  🤳
                </div>
                <div className="flex-1 z-10">
                  <p className="text-base font-black text-white tracking-tight">Solo Emoji Scan</p>
                  <p className="text-zinc-400 text-xs mt-0.5 leading-snug">Practice the emoji face and get an instant score.</p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="text-[10px] font-bold text-cyan-300 uppercase tracking-widest">Solo Scan</span>
                  </div>
                </div>
                <svg className="w-4 h-4 text-zinc-600 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom feature links (always visible on landing) */}
        <AnimatePresence>
          {!showModes && (
            <motion.div
              key="bottom-links"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ delay: 0.55, duration: 0.45 }}
              className="w-full flex flex-col gap-3 mt-1 sm:grid sm:grid-cols-2"
            >
              <div className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 cursor-default">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/15 flex items-center justify-center text-lg flex-none">🏆</div>
                <div className="flex-1">
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-zinc-200">Leaderboard</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">See top players and rankings.</p>
                </div>
                <svg className="w-4 h-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>

              <div className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-indigo-950/50 border border-indigo-800/40 cursor-default">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-lg flex-none">💬</div>
                <div className="flex-1">
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-zinc-200">Join Discord</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Chat, events &amp; updates.</p>
                </div>
                <svg className="w-4 h-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          className="text-[10px] text-zinc-600 uppercase tracking-widest text-center mt-2 pb-6"
        >
          Fair play · Expression only · No ID verification
        </motion.p>
      </div>
    </div>
  );
}
