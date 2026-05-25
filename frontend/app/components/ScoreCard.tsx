"use client";

import { motion } from "framer-motion";

interface OutfitItem {
  name: string;
  status: string;
  reason: string;
}

interface ScoreCardProps {
  score: number;
  verdict: string;
  roast: string;
  items: OutfitItem[];
}

export default function ScoreCard({ score, verdict, roast, items }: ScoreCardProps) {
  const isDrip = verdict === "Drip";

  return (
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.5, type: "spring", stiffness: 200, damping: 22 }}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-md bg-zinc-900/95 backdrop-blur-md border border-zinc-700 rounded-2xl p-5 shadow-2xl"
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className={`text-3xl font-black uppercase tracking-tight ${
            isDrip ? "text-emerald-400" : "text-red-500"
          }`}
        >
          {verdict}
        </span>
        <span
          className={`text-5xl font-black ${
            isDrip ? "text-emerald-400" : "text-red-500"
          }`}
        >
          {score}
          <span className="text-xl text-zinc-500 font-normal">/10</span>
        </span>
      </div>

      <p className="text-zinc-300 text-sm italic mb-4 border-l-2 border-zinc-600 pl-3 leading-snug">
        "{roast}"
      </p>

      <div className="space-y-2">
        {items.map((item, i) => (
          <motion.div
            key={i}
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.6 + i * 0.1 }}
            className="flex items-start gap-3 bg-zinc-800 rounded-lg px-3 py-2"
          >
            <span
              className={`text-xs font-bold uppercase mt-0.5 px-2 py-0.5 rounded-full ${
                item.status === "Drip"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-red-500/20 text-red-400"
              }`}
            >
              {item.status}
            </span>
            <div>
              <span className="text-xs font-semibold text-zinc-200 capitalize">
                {item.name}
              </span>
              <p className="text-xs text-zinc-500 leading-snug">{item.reason}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
