"use client";

/**
 * GameOptionsMenu
 * ---------------
 * The "⋯" control in a live game. One trigger, one sheet, three views:
 *
 *   options  Find a new opponent · Report · Support · Leave
 *   modes    every game mode (+ How it works) — picking the mode you
 *            are already in just finds a new opponent
 *   report   confirm before anything is sent
 *
 * Phones get a bottom sheet (thumb reach, like the chat sheet); from
 * `sm` up the same panel drops from the top-right, under the header
 * trigger. It is a modal dialog: focus moves in on open, Tab is
 * trapped, Escape or the backdrop closes it, and focus returns to
 * the trigger.
 *
 * Colours come only from the app's tokens.
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useSupportPrompt } from "../context/SupportPromptContext";
import { SIGNALING_URL } from "../lib/signaling";
import type { GameMode } from "./ChooseGameMode";
import { ArrowLeft, X, cn } from "../ui";

type View = "options" | "modes" | "report" | "reported";

const MODES: Array<{ id: GameMode; glyph: string; title: string; hint: string }> = [
  { id: "camera", glyph: "😎", title: "Duel", hint: "Copy the emoji against a stranger" },
  { id: "facesync", glyph: "⚡", title: "FaceSync", hint: "How alike do you two look?" },
  { id: "celebrity", glyph: "🏆", title: "Celebrity Face", hint: "Imitate a famous face" },
  { id: "solo", glyph: "🤪", title: "Solo practice", hint: "Just you and the emoji" },
];

interface GameOptionsMenuProps {
  /** The mode this arena is running, highlighted in the mode list. */
  currentMode: GameMode;
  /** Opponent's display name, for the report row. */
  partnerLabel: string;
  /** Skip to a new opponent in the current mode. Omit to hide (private rooms). */
  onFindNew?: () => void;
  /** Leave this arena for another mode. Omit to hide other modes. */
  onSelectMode?: (mode: GameMode) => void;
  /** Report the current opponent. Omit when nobody is matched. */
  onReport?: () => void;
  onLeave: () => void;
  leaveLabel: string;
  /** Extra classes for the trigger, e.g. sizing or responsive visibility. */
  triggerClassName?: string;
}

export default function GameOptionsMenu({
  currentMode,
  partnerLabel,
  onFindNew,
  onSelectMode,
  onReport,
  onLeave,
  leaveLabel,
  triggerClassName,
}: GameOptionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("options");
  const [online, setOnline] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const reduceMotion = useReducedMotion();
  const { show: showSupport } = useSupportPrompt();

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const openMenu = () => {
    setView("options");
    setOpen(true);
  };

  // Focus the first control on open and whenever the view changes.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, view]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const items = panelRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]");
      if (!items?.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Presence count for the mode list; supplemental, so failures are silent.
  useEffect(() => {
    if (!open || view !== "modes") return;
    let cancelled = false;
    fetch(`${SIGNALING_URL}/online`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.count === "number") setOnline(data.count);
      })
      .catch(() => { /* server may be offline */ });
    return () => { cancelled = true; };
  }, [open, view]);

  const pickMode = (mode: GameMode) => {
    setOpen(false);
    if (mode === currentMode && onFindNew) onFindNew();
    else onSelectMode?.(mode);
  };

  const canFindNew = Boolean(onFindNew || onSelectMode);
  const title = view === "modes" ? "Menu" : view === "options" ? "Options" : `Report ${partnerLabel}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openMenu}
        aria-label="More options"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "inline-flex min-h-11 min-w-11 flex-none items-center justify-center rounded-xl border-[2px] border-[var(--charcoal)] bg-[var(--off-white)] text-[var(--charcoal)] shadow-[2px_2px_0_0_var(--charcoal)] transition-transform active:translate-y-[2px] active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--charcoal)]",
          triggerClassName,
        )}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
          <circle cx="5" cy="12" r="2.2" />
          <circle cx="12" cy="12" r="2.2" />
          <circle cx="19" cy="12" r="2.2" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="game-options"
            className="fixed inset-0 z-[90]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.15 }}
          >
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              onClick={close}
              className="absolute inset-0 h-full w-full cursor-default bg-[var(--ink-overlay)]"
            />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              initial={reduceMotion ? false : { y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { y: 24, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className={cn(
                "absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-[3px] border-b-0 border-[var(--charcoal)] bg-[var(--off-white)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-[var(--charcoal)]",
                "sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-20 sm:w-[380px] sm:rounded-3xl sm:border-b-[3px] sm:shadow-[6px_6px_0_0_var(--charcoal)]",
              )}
            >
              {/* Grab handle: a phone-sheet cue only. */}
              <span aria-hidden className="mx-auto mb-3 block h-1.5 w-10 rounded-full bg-[var(--ink-soft)] sm:hidden" />

              <div className="mb-3 flex items-center gap-2">
                {view !== "options" && view !== "reported" && (
                  <button
                    type="button"
                    onClick={() => setView("options")}
                    aria-label="Back to options"
                    className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--off-white)]"
                  >
                    <ArrowLeft size={16} />
                  </button>
                )}
                <h2 id={titleId} className="min-w-0 flex-1 truncate font-display text-lg font-black uppercase tracking-[0.12em]">
                  {view === "reported" ? "Reported" : title}
                </h2>
                {view === "modes" && online !== null && (
                  <span className="inline-flex flex-none items-center gap-1.5 rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--off-white-2)] px-2.5 py-0.5 text-[11px] font-bold">
                    <span className="h-2 w-2 rounded-full bg-[var(--purple)]" />
                    {online.toLocaleString()} online
                  </span>
                )}
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full border-[2px] border-[var(--charcoal)] bg-[var(--off-white)]"
                >
                  <X size={16} />
                </button>
              </div>

              {view === "options" && (
                <div className="grid gap-2.5">
                  {canFindNew && (
                    <Row glyph="🔀" onClick={() => setView("modes")}>Find a new opponent</Row>
                  )}
                  {onReport && (
                    <Row glyph="🚩" onClick={() => setView("report")}>
                      Report <span className="truncate font-black">{partnerLabel}</span>
                    </Row>
                  )}
                  <Row glyph="💛" onClick={() => { setOpen(false); showSupport(); }}>Support Emoggle</Row>
                  <Row glyph="🚪" tone="danger" onClick={() => { setOpen(false); onLeave(); }}>{leaveLabel}</Row>
                </div>
              )}

              {view === "modes" && (
                <div className="grid gap-2.5">
                  {MODES.filter((m) => m.id === currentMode ? Boolean(onFindNew) : Boolean(onSelectMode)).map((m) => (
                    <Row
                      key={m.id}
                      glyph={m.glyph}
                      tone={m.id === currentMode ? "current" : "plain"}
                      hint={m.id === currentMode ? "New opponent, same game" : m.hint}
                      onClick={() => pickMode(m.id)}
                    >
                      {m.title}
                    </Row>
                  ))}
                  {/* Opens in a new tab so the current game survives. */}
                  <a
                    href="/how-it-works"
                    target="_blank"
                    rel="noopener"
                    className={rowClass("plain")}
                  >
                    <span aria-hidden className="text-lg leading-none">💡</span>
                    <span className="min-w-0 flex-1 truncate">How it works</span>
                  </a>
                </div>
              )}

              {view === "report" && (
                <div className="grid gap-3">
                  <p className="text-sm leading-snug text-[var(--on-surface-variant)]">
                    We&apos;ll log this session for review. {partnerLabel} isn&apos;t
                    told, and you can keep playing.
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setView("options")} className={cn(rowClass("plain"), "flex-1 justify-center")}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => { onReport?.(); setView("reported"); }}
                      className={cn(rowClass("danger"), "flex-1 justify-center")}
                    >
                      Report
                    </button>
                  </div>
                </div>
              )}

              {view === "reported" && (
                <div className="grid gap-3">
                  <p className="text-sm leading-snug text-[var(--on-surface-variant)]">
                    Thanks. {partnerLabel} has been reported. Want to move on?
                  </p>
                  {onFindNew && (
                    <Row glyph="🔀" tone="current" onClick={() => { setOpen(false); onFindNew(); }}>
                      Find a new opponent
                    </Row>
                  )}
                  <Row glyph="▶️" onClick={close}>Keep playing</Row>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function rowClass(tone: "plain" | "current" | "danger") {
  return cn(
    "flex min-h-12 w-full items-center gap-3 rounded-2xl border-[3px] border-[var(--charcoal)] px-4 py-2 text-left text-[15px] font-bold shadow-[3px_3px_0_0_var(--charcoal)] transition-transform active:translate-y-[2px] active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--charcoal)]",
    tone === "current" && "on-accent-inverse bg-[var(--purple)] text-[var(--ink)]",
    tone === "danger" && "on-accent bg-[var(--pink)] text-[var(--ink)]",
    tone === "plain" && "bg-[var(--off-white)] text-[var(--charcoal)] hover:bg-[var(--off-white-2)]",
  );
}

function Row({
  glyph,
  tone = "plain",
  hint,
  onClick,
  children,
}: {
  glyph: string;
  tone?: "plain" | "current" | "danger";
  hint?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={rowClass(tone)}>
      <span aria-hidden className="text-lg leading-none">{glyph}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1">{children}</span>
        {hint && <span className="truncate text-[11px] font-semibold opacity-75">{hint}</span>}
      </span>
    </button>
  );
}
