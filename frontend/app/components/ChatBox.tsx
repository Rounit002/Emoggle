"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ChatMessage } from "../hooks/useMatchmaking";

interface ChatBoxProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onSkip?: () => void;
  disabled?: boolean;
}

export default function ChatBox({ messages, onSend, onSkip, disabled = false }: ChatBoxProps) {
  const [open, setOpen] = useState(true);
  const [input, setInput] = useState("");
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Auto-scroll to bottom on new message */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* Track unread when closed */
  useEffect(() => {
    if (!open && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (!last.fromSelf) setUnread((u) => u + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const handleOpen = () => {
    setOpen(true);
    setUnread(0);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput("");
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSend();
    if (e.key === "Escape") setOpen(false);
  };

  return (
    <>
      {/* ── Toggle button (bottom-center) ── */}
      <motion.button
        onClick={open ? () => setOpen(false) : handleOpen}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="absolute bottom-3 right-3 z-50 flex items-center gap-2 px-4 py-2 bg-zinc-900/90 backdrop-blur-md border border-zinc-700 hover:border-zinc-500 text-white text-sm font-semibold rounded-full transition-colors shadow-lg"
        disabled={disabled}
      >
        <svg className="w-4 h-4 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        {open ? "Close" : "Chat"}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">
            {unread}
          </span>
        )}
      </motion.button>

      {/* ── Chat panel ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="chatbox"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="absolute bottom-14 left-3 right-3 z-50 mx-auto flex max-w-5xl flex-col items-center gap-3 sm:left-6 sm:right-6 lg:bottom-4 lg:left-1/2 lg:right-auto lg:w-[min(760px,calc(100vw-2rem))] lg:-translate-x-1/2"
          >
            {onSkip && (
              <motion.button
                onClick={onSkip}
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className="w-full max-w-xs rounded-full border-2 border-red-400/70 bg-red-600 px-10 py-4 text-base font-black uppercase tracking-[0.22em] text-white shadow-2xl shadow-red-950/40 transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={disabled}
              >
                Skip
              </motion.button>
            )}

            <div className="flex max-h-[30vh] min-h-[140px] w-full flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950/95 shadow-2xl backdrop-blur-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Live Chat</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
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
        )}
      </AnimatePresence>
    </>
  );
}
