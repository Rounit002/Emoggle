"use client";

import { motion, AnimatePresence, useAnimationFrame } from "framer-motion";
import { useRef, useState } from "react";

/* Outfit landmark positions as % of panel width/height.
   Mapped to: collar, L-shoulder, R-shoulder, L-chest, R-chest,
              L-sleeve, R-sleeve, waist-L, waist-R, hem */
const LANDMARKS = [
  { id: "collar",    x: 50,  y: 18 },
  { id: "l-should",  x: 28,  y: 24 },
  { id: "r-should",  x: 72,  y: 24 },
  { id: "l-chest",   x: 36,  y: 38 },
  { id: "r-chest",   x: 64,  y: 38 },
  { id: "l-sleeve",  x: 18,  y: 46 },
  { id: "r-sleeve",  x: 82,  y: 46 },
  { id: "waist-l",   x: 38,  y: 60 },
  { id: "waist-r",   x: 62,  y: 60 },
  { id: "hem",       x: 50,  y: 74 },
];

const LABELS: Record<string, string> = {
  "collar":   "collar",
  "l-should": "shoulder",
  "r-should": "shoulder",
  "l-chest":  "chest",
  "r-chest":  "chest",
  "l-sleeve": "sleeve",
  "r-sleeve": "sleeve",
  "waist-l":  "waist",
  "waist-r":  "waist",
  "hem":      "hem",
};

const THOUGHTS = [
  "Checking collar & neckline…",
  "Shoulder fit looks…",
  "Reading the chest piece…",
  "Sleeve game assessment…",
  "Waist silhouette locked in…",
  "Colour palette cross-check…",
  "Fabric quality noted…",
  "Finalising verdict…",
];

export default function AnalyzingOverlay() {
  const [scanY, setScanY] = useState(0);
  const [visibleDots, setVisibleDots] = useState<Set<string>>(new Set());
  const [thoughtIndex, setThoughtIndex] = useState(0);
  const elapsed = useRef(0);
  const thoughtTimer = useRef(0);
  const dotTimer = useRef(0);
  const dotQueue = useRef([...LANDMARKS].sort(() => Math.random() - 0.5));
  const dotCursor = useRef(0);

  /* Scan line + dot reveal driven by animation frame */
  useAnimationFrame((_, delta) => {
    elapsed.current += delta;
    thoughtTimer.current += delta;
    dotTimer.current += delta;

    /* Scan line: sweeps top → bottom over 2.4 s, then resets */
    const period = 2400;
    const t = (elapsed.current % period) / period;
    setScanY(t * 100);

    /* Reveal a new dot every ~220 ms */
    if (dotTimer.current > 220) {
      dotTimer.current = 0;
      const next = dotQueue.current[dotCursor.current % dotQueue.current.length];
      dotCursor.current += 1;
      setVisibleDots((prev) => new Set([...prev, next.id]));
    }

    /* Cycle thought text every ~1.8 s */
    if (thoughtTimer.current > 1800) {
      thoughtTimer.current = 0;
      setThoughtIndex((i) => (i + 1) % THOUGHTS.length);
    }
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="absolute inset-0 z-40 rounded-2xl overflow-hidden"
    >
      {/* Very light dark tint — video stays clearly visible */}
      <div className="absolute inset-0 bg-black/30" />

      {/* ── Horizontal scan line ── */}
      <motion.div
        className="absolute left-0 right-0 pointer-events-none"
        style={{ top: `${scanY}%` }}
      >
        {/* Glow beam */}
        <div className="w-full h-[2px] bg-gradient-to-r from-transparent via-green-400 to-transparent opacity-90" />
        {/* Soft spread below */}
        <div className="w-full h-8 bg-gradient-to-b from-green-400/20 to-transparent -mt-1" />
      </motion.div>

      {/* ── Landmark dots ── */}
      {LANDMARKS.map((lm) => (
        <LandmarkDot
          key={lm.id}
          x={lm.x}
          y={lm.y}
          label={LABELS[lm.id]}
          visible={visibleDots.has(lm.id)}
        />
      ))}

      {/* ── Corner brackets (like reference) ── */}
      <CornerBrackets />


      {/* ── Bottom thought bubble ── */}
      <div className="absolute bottom-4 left-3 right-3 z-10">
        <div className="bg-black/65 backdrop-blur-md rounded-xl px-3 py-2 border border-white/10">
          <AnimatePresence mode="wait">
            <motion.p
              key={thoughtIndex}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.3 }}
              className="text-xs text-white/90 font-medium"
            >
              {THOUGHTS[thoughtIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Single landmark dot — clean crosshair style ── */
function LandmarkDot({
  x, y, visible,
}: {
  x: number; y: number; label: string; visible: boolean;
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute pointer-events-none"
          style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.4 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {/* Crosshair ticks */}
          <div className="absolute left-1/2 -translate-x-1/2" style={{ top: "-8px", width: "1px", height: "5px", background: "rgba(74,222,128,0.8)" }} />
          <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: "-8px", width: "1px", height: "5px", background: "rgba(74,222,128,0.8)" }} />
          <div className="absolute top-1/2 -translate-y-1/2" style={{ left: "-8px", height: "1px", width: "5px", background: "rgba(74,222,128,0.8)" }} />
          <div className="absolute top-1/2 -translate-y-1/2" style={{ right: "-8px", height: "1px", width: "5px", background: "rgba(74,222,128,0.8)" }} />
          {/* Core dot — slow, calm pulse, well under the 3 Hz safety threshold. */}
          <motion.div
            className="w-2 h-2 rounded-full bg-green-400"
            style={{ boxShadow: "0 0 6px 2px rgba(74,222,128,0.6)" }}
            animate={{ opacity: [1, 0.7, 1] }}
            transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Corner brackets matching the reference screenshot ── */
function CornerBrackets() {
  const cls = "absolute w-7 h-7 border-green-400/70";
  return (
    <>
      <div className={`${cls} top-3 left-3 border-t-2 border-l-2`} />
      <div className={`${cls} top-3 right-3 border-t-2 border-r-2`} />
      <div className={`${cls} bottom-3 left-3 border-b-2 border-l-2`} />
      <div className={`${cls} bottom-3 right-3 border-b-2 border-r-2`} />
    </>
  );
}
