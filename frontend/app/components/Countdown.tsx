"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

interface CountdownProps {
  count: number | null;
}

export default function Countdown({ count }: CountdownProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]"
      role="status"
      aria-live="assertive"
      aria-label={count && count > 0 ? `Round starts in ${count}` : "Round started"}
    >
      <AnimatePresence mode="wait">
        {count !== null && count > 0 && (
          <motion.div
            key={count}
            initial={reduceMotion ? { opacity: 0 } : { scale: 1.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { scale: 0.7, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.35, ease: "easeOut" }}
            className="font-display text-[clamp(7rem,38vw,12rem)] font-black leading-none text-white drop-shadow-[0_0_60px_rgba(255,255,255,0.6)]"
            style={{ textShadow: "0 0 80px rgba(255,80,80,0.8)" }}
            aria-hidden
          >
            {count}
          </motion.div>
        )}
        {count === 0 && (
          <motion.div
            key="snap"
            initial={reduceMotion ? { opacity: 0 } : { scale: 0.7, opacity: 0 }}
            animate={{ scale: 1.1, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { scale: 1.3, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.35, ease: "easeOut" }}
            className="font-display text-[clamp(3rem,16vw,6rem)] font-black uppercase tracking-[0.08em] text-red-400"
            style={{ textShadow: "0 0 60px rgba(255,50,50,0.9)" }}
            aria-hidden
          >
            SNAP!
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
