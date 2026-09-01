"use client";

import { motion, AnimatePresence } from "framer-motion";

interface CountdownProps {
  count: number | null;
}

export default function Countdown({ count }: CountdownProps) {
  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
      <AnimatePresence mode="wait">
        {count !== null && count > 0 && (
          <motion.div
            key={count}
            initial={{ scale: 1.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="text-[12rem] font-black text-white leading-none drop-shadow-[0_0_60px_rgba(255,255,255,0.6)]"
            style={{ textShadow: "0 0 80px rgba(255,80,80,0.8)" }}
          >
            {count}
          </motion.div>
        )}
        {count === 0 && (
          <motion.div
            key="snap"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1.1, opacity: 1 }}
            exit={{ scale: 1.4, opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="text-6xl font-black uppercase tracking-widest text-red-500"
            style={{ textShadow: "0 0 60px rgba(255,50,50,0.9)" }}
          >
            SNAP!
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
