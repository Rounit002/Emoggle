"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import ModeSelect from "./ModeSelect";
import { MediaPipeFaceProvider } from "../context/MediaPipeFaceContext";
import ExperienceProviders from "./ExperienceProviders";
import { useSupportPrompt } from "../context/SupportPromptContext";
import { useSmoothScrollController } from "./SmoothScroll";
import { useCoveredView } from "./home/useCoveredView";
import type { MatchGameMode } from "../hooks/useMatchmaking";

const DuelArena = dynamic(() => import("./DuelArena"), { loading: GameLoading });
const SoloFaceJudge = dynamic(() => import("./SoloFaceJudge"), { loading: GameLoading });
const CelebrityDuelArena = dynamic(() => import("./CelebrityDuelArena"), { loading: GameLoading });
const FaceSyncArena = dynamic(() => import("./FaceSyncArena"), { loading: GameLoading });

function GameLoading() {
  return (
    <div className="grid min-h-screen place-items-center px-4" role="status">
      <p className="rounded-full border-[3px] border-[var(--charcoal)] bg-[var(--yellow)] px-5 py-3 font-bold text-[var(--on-accent)] shadow-[4px_4px_0_0_var(--charcoal)]">
        Loading game…
      </p>
    </div>
  );
}

type View = "home" | "arena" | "solo" | "celebrity" | "facesync";
type ModeId = "camera" | "solo" | "celebrity" | "facesync";

const VIEW_BY_MODE: Record<ModeId, View> = {
  camera: "arena",
  solo: "solo",
  celebrity: "celebrity",
  facesync: "facesync",
};
const VIEW_BY_MATCH_MODE: Record<MatchGameMode, View> = {
  emoji: "arena",
  celebrity: "celebrity",
  facesync: "facesync",
};

export default function HomeExperience() {
  return (
    <ExperienceProviders><MotionConfig reducedMotion="user"><HomeContent /></MotionConfig></ExperienceProviders>
  );
}

function HomeContent() {
  const reduceMotion = useReducedMotion();
  const [view, setView] = useState<View>("home");
  const [modeSwitchTicket, setModeSwitchTicket] = useState<string | null>(null);
  const { open: supportOpen, close: dismissSupport, show: openSupport } = useSupportPrompt();
  const setSmoothScrollEnabled = useSmoothScrollController();

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("support")) return;
    const timer = window.setTimeout(() => {
      dismissSupport();
      for (const key of ["support", "payment_id", "status", "email"]) url.searchParams.delete(key);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [dismissSupport]);

  /* Games always open at their beginning. When the player returns,
     restore the landing-page position they came from. */
  const pendingScrollY = useRef<number | null>(null);
  const homeScrollY = useRef(0);

  const goTo = useCallback((next: View) => {
    if (typeof window !== "undefined") {
      if (view === "home" && next !== "home") {
        homeScrollY.current = window.scrollY;
        pendingScrollY.current = 0;
      } else if (next === "home") {
        pendingScrollY.current = homeScrollY.current;
      }
    }
    // Live camera modes already run animation and face-tracking loops.
    // Remove Lenis before those trees mount so its global RAF does not
    // compete for the same frame budget.
    setSmoothScrollEnabled(next === "home");
    setView(next);
  }, [setSmoothScrollEnabled, view]);

  useEffect(
    () => () => {
      // Route navigation can unmount this experience from any view.
      // Restore the layout-level default for the next page.
      setSmoothScrollEnabled(true);
    },
    [setSmoothScrollEnabled],
  );

  // Same reasoning one layer up: an arena covers the landing page's
  // doodle wallpaper completely, so there is nothing to gain from
  // compositing it behind one.
  useCoveredView(view !== "home");

  const handleSelect = useCallback(
    (mode: ModeId) => {
      setModeSwitchTicket(null);
      goTo(VIEW_BY_MODE[mode]);
    },
    [goTo],
  );

  const handleBack = useCallback(() => {
    setModeSwitchTicket(null);
    goTo("home");
  }, [goTo]);

  const handleModeSwitch = useCallback((mode: MatchGameMode, ticket: string) => {
    setModeSwitchTicket(ticket);
    goTo(VIEW_BY_MATCH_MODE[mode]);
  }, [goTo]);

  useLayoutEffect(() => {
    if (pendingScrollY.current === null) return;
    const y = pendingScrollY.current;
    pendingScrollY.current = null;
    if (typeof window !== "undefined") {
      window.scrollTo(0, y);
    }
  }, [view]);

  const game = view === "arena"
    ? <DuelArena onBack={handleBack} modeSwitchTicket={modeSwitchTicket} onModeSwitch={handleModeSwitch} />
    : view === "solo"
      ? <SoloFaceJudge onBack={handleBack} />
      : view === "celebrity"
        ? <CelebrityDuelArena onBack={handleBack} modeSwitchTicket={modeSwitchTicket} onModeSwitch={handleModeSwitch} />
        : <FaceSyncArena onBack={handleBack} modeSwitchTicket={modeSwitchTicket} onModeSwitch={handleModeSwitch} />;

  const content = view === "home"
    ? <ModeSelect onSelect={handleSelect} supportOpen={supportOpen} onDismissSupport={dismissSupport} onOpenSupport={openSupport} />
    : <MediaPipeFaceProvider>{game}</MediaPipeFaceProvider>;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={view}
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
        className="flex min-h-0 flex-1 flex-col"
      >
        {content}
      </motion.div>
    </AnimatePresence>
  );
}
