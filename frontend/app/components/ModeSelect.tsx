"use client";

import { motion } from "framer-motion";

interface ModeSelectProps {
  onSelect: (mode: "camera" | "solo") => void;
}

export default function ModeSelect({ onSelect }: ModeSelectProps) {
  return (
    <div className="relative w-screen h-screen bg-black flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-yellow-500/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-700/15 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="text-center mb-16"
      >
        <h1 className="text-6xl font-black tracking-tighter text-white">
          Emoggle
        </h1>
        <p className="text-zinc-400 mt-3 text-lg tracking-wide">
          Two strangers. One emoji. Best expression wins.
        </p>
      </motion.div>

      <div className="grid w-full max-w-3xl grid-cols-1 gap-6 px-6 sm:grid-cols-2">
        <motion.button
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
          whileHover={{ scale: 1.03, y: -4 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onSelect("camera")}
          className="flex-1 group relative flex flex-col items-center justify-center gap-5 p-10 bg-zinc-900 border border-zinc-700 hover:border-yellow-400/60 rounded-3xl cursor-pointer transition-colors overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

          <div className="w-20 h-20 rounded-2xl bg-yellow-500/15 border border-yellow-400/30 flex items-center justify-center group-hover:bg-yellow-500/25 transition-colors">
            <svg className="w-10 h-10 text-yellow-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-2.796A.75.75 0 0121 8.374v7.252a.75.75 0 01-1.03.696L15.75 13.5M3.375 7.5h10.5A1.875 1.875 0 0115.75 9.375v5.25A1.875 1.875 0 0113.875 16.5H3.375A1.875 1.875 0 011.5 14.625v-5.25A1.875 1.875 0 013.375 7.5z" />
            </svg>
          </div>

          <div className="text-center z-10">
            <p className="text-2xl font-black text-white tracking-tight">Live Face Duel</p>
            <p className="text-zinc-400 text-sm mt-2 leading-relaxed max-w-[200px]">
              Match the shared emoji while both scores update live.
            </p>
          </div>

          <div className="flex items-center gap-2 z-10">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-xs font-semibold text-yellow-300 uppercase tracking-widest">Live Match</span>
          </div>
        </motion.button>

        <motion.button
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
          whileHover={{ scale: 1.03, y: -4 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onSelect("solo")}
          className="group relative flex flex-col items-center justify-center gap-5 overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-900 p-10 transition-colors hover:border-cyan-400/60"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

          <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-500/15 text-4xl transition-colors group-hover:bg-cyan-500/25">
            🤳
          </div>

          <div className="z-10 text-center">
            <p className="text-2xl font-black tracking-tight text-white">Solo Emoji Scan</p>
            <p className="mt-2 max-w-[220px] text-sm leading-relaxed text-zinc-400">
              Practice the emoji face alone and get your score instantly.
            </p>
          </div>

          <div className="z-10 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Solo Scan</span>
          </div>
        </motion.button>
      </div>
    </div>
  );
}
