"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ChatMessage } from "../hooks/useMatchmaking";

/* =====================================================================
   ChatBox — in-duel chat, docked in the arena layout.

   Layout contract (set by the parent in DuelArena):
   - Sits in its own full-width section directly below the
     camera feeds, on every viewport. Never beside the cameras
     and never on top of them. The cameras row is always
     rendered above; the chat is always rendered below.
   - Fixed height (~300px) set by the parent — enough for the
     header, a handful of recent message bubbles, the input
     row, and the ephemeral-hint footer. Any overflow
     messages scroll inside the panel.
   - The component itself is just a regular block that fills
     its flex slot. No fixed positioning, no FAB, no slide-in
     animation. The reserved space is always there; the user
     always sees the chat header.

   Minimize/expand:
   - Default state on mount and on every new match: NOT minimized.
   - User can click the chevron in the header to collapse the
     message list and input down to just the header. The header
     itself stays visible so the user can still tell chat is
     available.
   - Minimize state resets to false whenever a new match id
     arrives — fresh connection, fresh default of "fully open".

   Labeling: "You" (own) / "Stranger" (partner). The actual
   sender identity never leaves the client.
   ===================================================================== */

interface ChatBoxProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onTyping?: (isTyping: boolean) => void;
  rivalTyping?: boolean;
  /** Anonymous label for the rival. Defaults to "Stranger". */
  partnerLabel?: string;
  /**
   * Identifier for the current match. Used as the auto-reset
   * trigger — every new match id flips the minimized state back
   * to false so the chat reopens fully. Also forwarded with
   * reports so the server can log context.
   */
  matchId?: string | null;
  /**
   * Called when the user confirms a report against the partner.
   * The transport details (socket event, payload shape) live
   * inside the matchmaking hook; the view just calls this when
   * the user taps the confirm button.
   */
  onReport?: () => void;
}

/* Tiny inline profanity list for the local preview. The
   authoritative scrub is on the server (so a tampered client
   can't bypass it). Keeping a small list here just means the
   sender sees a censored preview of their own bubble if the
   server replaces their text — otherwise the two bubbles would
   disagree and the user wouldn't know why. */
const BANNED_WORDS = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "cunt",
  "dick",
  "piss",
  "slut",
  "whore",
  "nigger",
  "faggot",
];

function censor(text: string): string {
  if (!text) return text;
  const pattern = new RegExp(
    `\\b(${BANNED_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
    "gi",
  );
  return text.replace(pattern, (match) =>
    match.length <= 2
      ? "*".repeat(match.length)
      : `${match[0]}${"*".repeat(match.length - 1)}`,
  );
}

const MAX_LENGTH = 200;
const TYPING_IDLE_MS = 1500;

export default function ChatBox({
  messages,
  onSend,
  onTyping,
  rivalTyping = false,
  partnerLabel = "Stranger",
  matchId,
  onReport,
}: ChatBoxProps) {
  const [input, setInput] = useState("");
  const [isMinimized, setIsMinimized] = useState(false);
  const [showReportConfirm, setShowReportConfirm] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  /* Scroll target for the message list. The page-level scroll
     must not move when a new message lands (or when the panel
     expands), so we scroll THIS container directly instead of
     calling scrollIntoView on bottomRef — scrollIntoView walks
     all ancestors and can drag the whole viewport down when the
     chat sits at the bottom of the page. */
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeenIndexRef = useRef(0);
  const initialMatchIdRef = useRef<string | null | undefined>(matchId);

  /* Default-on-connect: every new match id flips the panel back to
     its fully-open state. The ref captures the value on first
     render only, so a re-render with the same id doesn't trigger
     a re-open mid-match (e.g. after the user manually minimizes). */
  useEffect(() => {
    if (!matchId) return;
    if (matchId === initialMatchIdRef.current) return;
    setIsMinimized(false);
    lastSeenIndexRef.current = 0;
  }, [matchId]);

  /* Auto-scroll the message list to the newest entry. Skip when
     minimized — the body is hidden so there's nothing to scroll,
     and we don't want to reflow on hidden content.

     We scroll the messages container directly rather than calling
     scrollIntoView on bottomRef. scrollIntoView walks all the
     element's ancestors and would drag the page-level scroll
     position down to keep the chat in view whenever the chat
     mounts (i.e. when a new match starts). Scoping the scroll to
     this one container keeps the page exactly where the user left
     it. */
  useEffect(() => {
    if (isMinimized) return;
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, rivalTyping, isMinimized]);

  /* Focus the input when the panel expands. We focus manually
     because the input is unmounted while minimized.

     preventScroll keeps the page-level scroll position locked:
     without it the browser scrolls the focused input into view,
     which — since the chat is mounted at the bottom of the page
     on match — would yank the viewport down to the chat. */
  useEffect(() => {
    if (isMinimized) return;
    const t = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 80);
    return () => window.clearTimeout(t);
  }, [isMinimized]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value.slice(0, MAX_LENGTH);
      setInput(next);
      if (!onTyping) return;
      onTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => onTyping(false), TYPING_IDLE_MS);
    },
    [onTyping],
  );

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    onTyping?.(false);
    /* Send the original text — the server applies the authoritative
       profanity filter. Sending already-censored text would mean the
       user sees what they typed stripped in their own bubble, which
       is more confusing than the server's clean replacement. */
    onSend(trimmed);
    setInput("");
  }, [input, onSend, onTyping]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleReport = useCallback(() => {
    onReport?.();
    setShowReportConfirm(false);
  }, [onReport]);

  const placeholder = useMemo(
    () => `Message ${partnerLabel}…`,
    [partnerLabel],
  );

  return (
    <div
      className="relative flex h-full w-full min-h-0 flex-col overflow-hidden rounded-2xl border-[3px] border-[var(--charcoal)] bg-[var(--off-white)] shadow-[4px_4px_0_0_var(--charcoal)]"
      aria-label="In-duel chat"
    >
      {/* Header — always visible, even when minimized. This is the
          chat's "always there" affordance: the user always knows
          chat is available, and can tap the header to expand. */}
      <header className="flex-none flex items-center justify-between gap-2 px-3 py-2.5 border-b-[2px] border-[var(--ink-faint)] bg-[var(--off-white)]">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--purple)] text-[10px] font-black uppercase tracking-[0.18em] text-white">
            {partnerLabel.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-extrabold uppercase tracking-[0.16em] text-[var(--charcoal)]">
              Live chat
            </p>
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
              with {partnerLabel}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {!isMinimized && (
            <button
              type="button"
              onClick={() => setShowReportConfirm(true)}
              aria-label="Report this player"
              title="Report player"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--off-white)] text-[var(--charcoal)] transition-transform duration-100 hover:bg-[var(--pink)] active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--charcoal)]"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 21V4l16 4-3 4 3 4-16 0" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsMinimized((m) => !m)}
            aria-label={isMinimized ? "Expand chat" : "Minimize chat"}
            title={isMinimized ? "Expand chat" : "Minimize chat"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--off-white)] text-[var(--charcoal)] transition-transform duration-100 hover:bg-[var(--off-white-2)] active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--charcoal)]"
          >
            {isMinimized ? (
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 15l7-7 7 7" />
              </svg>
            ) : (
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 9l7 7 7-7" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Body — hidden when minimized. AnimatePresence gives a
          tiny spring on the height transition so the layout reflow
          feels intentional rather than abrupt. */}
      <AnimatePresence initial={false}>
        {!isMinimized && (
          <motion.div
            key="chat-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {/* Messages */}
            <div
              ref={messagesRef}
              data-lenis-prevent
              className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2 bg-[var(--surface-container-low)]"
            >
              {messages.length === 0 && !rivalTyping && (
                <p className="mt-6 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                  Say hi to {partnerLabel}
                </p>
              )}
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.ts}
                  text={msg.text}
                  fromSelf={msg.fromSelf}
                  partnerLabel={partnerLabel}
                />
              ))}
              {rivalTyping && (
                <motion.div
                  key="typing"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="flex justify-start"
                >
                  <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-sm border-[2px] border-[var(--charcoal)] bg-[var(--off-white)] px-3 py-2 shadow-[2px_2px_0_0_var(--charcoal)]">
                    <span className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                      {partnerLabel} typing
                    </span>
                    <TypingDots />
                  </div>
                </motion.div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input row */}
            <div className="flex-none flex items-center gap-2 px-3 py-2.5 border-t-[2px] border-[var(--ink-faint)] bg-[var(--off-white)]">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKey}
                maxLength={MAX_LENGTH}
                placeholder={placeholder}
                aria-label="Chat message"
                className="flex-1 rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--off-white)] px-4 py-2 text-[13px] text-[var(--charcoal)] outline-none placeholder:text-[var(--ink-muted)] focus-visible:border-[var(--purple-deep)]"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim()}
                aria-label="Send message"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--yellow)] text-[var(--yellow-deep)] shadow-[2px_2px_0_0_var(--charcoal)] transition-transform duration-100 active:translate-y-[1px] active:shadow-[0_0_0_0_var(--charcoal)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--charcoal)]"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12l14-7-5 14-2-6-7-1z" />
                </svg>
              </button>
            </div>

            {/* Footer hint — ephemeral / no-history. */}
            <p className="flex-none px-3 pb-2 pt-1 text-center text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
              Session-only · no history · be cool
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* When minimized, the body slot collapses but we leave a
          small affordance: a thin "tap to expand" hint under the
          header so the user knows chat is still there. Tap targets
          the whole hint bar. */}
      {isMinimized && (
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="flex-1 min-h-0 flex items-center justify-center px-3 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)] hover:bg-[var(--surface-container-low)] transition-colors"
          aria-label="Expand chat"
        >
          Chat minimized · tap to expand
        </button>
      )}

      {/* Report confirmation overlay */}
      <AnimatePresence>
        {showReportConfirm && (
          <motion.div
            key="report-confirm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--ink-overlay)] p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 8 }}
              className="w-full max-w-xs rounded-2xl border-[3px] border-[var(--charcoal)] bg-[var(--off-white)] p-4 shadow-[4px_4px_0_0_var(--charcoal)]"
            >
              <h3 className="text-[14px] font-extrabold uppercase tracking-[0.14em] text-[var(--charcoal)]">
                Report {partnerLabel}?
              </h3>
              <p className="mt-1 text-[12px] leading-snug text-[var(--ink-muted)]">
                We&apos;ll log this session for review. Nothing is sent
                to the other player, and you can keep playing.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowReportConfirm(false)}
                  className="flex-1 rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--off-white)] px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[var(--charcoal)] transition-transform duration-100 active:translate-y-[1px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReport}
                  className="flex-1 rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--pink)] px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[var(--pink-deep)] shadow-[2px_2px_0_0_var(--charcoal)] transition-transform duration-100 active:translate-y-[1px] active:shadow-[0_0_0_0_var(--charcoal)]"
                >
                  Report
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* =====================================================================
   MessageBubble — one row in the message list. Censored preview
   is rendered for self-sent messages that contained banned words
   so the user sees what the server actually relayed (and the
   partner received).
   ===================================================================== */

function MessageBubble({
  text,
  fromSelf,
  partnerLabel,
}: {
  text: string;
  fromSelf: boolean;
  partnerLabel: string;
}) {
  const label = fromSelf ? "You" : partnerLabel;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${fromSelf ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`flex max-w-[80%] flex-col gap-0.5 ${
          fromSelf ? "items-end" : "items-start"
        }`}
      >
        <span
          className={`px-1 text-[9px] font-black uppercase tracking-[0.2em] ${
            fromSelf ? "text-[var(--purple-deep)]" : "text-[var(--pink-deep)]"
          }`}
        >
          {label}
        </span>
        <div
          className={`px-3 py-1.5 text-[13px] leading-snug break-words rounded-2xl border-[2px] border-[var(--charcoal)] shadow-[2px_2px_0_0_var(--charcoal)] ${
            fromSelf
              ? "bg-[var(--yellow)] text-[var(--yellow-deep)] rounded-br-sm"
              : "bg-[var(--off-white)] text-[var(--charcoal)] rounded-bl-sm"
          }`}
        >
          {text}
        </div>
      </div>
    </motion.div>
  );
}

/* =====================================================================
   TypingDots — three little staggered dots. Pure CSS so the
   indicator never depends on the framer-motion render cycle.
   ===================================================================== */

function TypingDots() {
  return (
    <span aria-hidden className="inline-flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--ink-muted)]"
          style={{
            animation: "emoggle-dot 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes emoggle-dot {
          0%, 60%, 100% {
            opacity: 0.3;
            transform: translateY(0);
          }
          30% {
            opacity: 1;
            transform: translateY(-2px);
          }
        }
      `}</style>
    </span>
  );
}
