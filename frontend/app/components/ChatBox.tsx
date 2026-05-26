"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { ChatMessage } from "../hooks/useMatchmaking";

interface ChatBoxProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onSkip?: () => void;
  onStop?: () => void;
  disabled?: boolean;
}

export default function ChatBox({ messages, onSend, onSkip, onStop, disabled = false }: ChatBoxProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Auto-scroll to bottom on new message */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput("");
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSend();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className="absolute bottom-14 left-2 right-2 z-50 mx-auto flex max-w-5xl flex-col items-center gap-2 sm:gap-3 sm:left-4 sm:right-4 md:left-6 md:right-6 lg:bottom-4 lg:left-1/2 lg:right-auto lg:w-[min(760px,calc(100vw-2rem))] lg:-translate-x-1/2"
    >
      {(onSkip || onStop) && (
        <div className="flex items-center gap-3">
          {onSkip && (
            <motion.button
              onClick={onSkip}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="rounded-full border-2 border-red-400/70 bg-red-600 px-8 sm:px-10 py-3 sm:py-4 text-sm sm:text-base font-black uppercase tracking-[0.18em] sm:tracking-[0.22em] text-white shadow-2xl shadow-red-950/40 transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled}
            >
              Skip
            </motion.button>
          )}
          {onStop && (
            <motion.button
              onClick={onStop}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="rounded-full border-2 border-zinc-500/70 bg-zinc-800 px-8 sm:px-10 py-3 sm:py-4 text-sm sm:text-base font-black uppercase tracking-[0.18em] sm:tracking-[0.22em] text-white shadow-2xl shadow-zinc-950/40 transition-colors hover:bg-zinc-700"
            >
              Stop
            </motion.button>
          )}
        </div>
      )}

      <div className="flex max-h-[28vh] sm:max-h-[32vh] min-h-[120px] sm:min-h-[140px] w-full flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950/95 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center px-4 py-2.5 border-b border-zinc-800">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="ml-2 text-xs font-bold text-zinc-300 uppercase tracking-widest">Live Chat</span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[72px]">
          {messages.length === 0 && (
            <p className="text-center text-zinc-600 text-xs mt-4">
              Say something to your opponent…
            </p>
          )}
          {messages.map((msg) => (
            <motion.div
              key={msg.ts}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.fromSelf ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[75%] px-3 py-1.5 rounded-2xl text-sm leading-snug break-words ${
                msg.fromSelf
                  ? "bg-blue-600 text-white rounded-br-sm"
                  : "bg-zinc-800 text-zinc-100 rounded-bl-sm"
              }`}>
                {msg.text}
              </div>
            </motion.div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-t border-zinc-800">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            maxLength={200}
            placeholder="Type a message…"
            className="flex-1 bg-zinc-800 border border-zinc-700 focus:border-zinc-500 text-white text-sm rounded-full px-4 py-1.5 outline-none placeholder-zinc-500 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="flex-none w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
