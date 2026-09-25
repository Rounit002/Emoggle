"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MotionConfig } from "framer-motion";
import CelebrityDuelArena from "./CelebrityDuelArena";
import DuelArena from "./DuelArena";
import FaceSyncArena from "./FaceSyncArena";
import ModeSelect from "./ModeSelect";
import SoloFaceJudge from "./SoloFaceJudge";
import { MediaPipeFaceProvider } from "../context/MediaPipeFaceContext";
import { UserProfileProvider } from "../context/UserProfileContext";
import { PlayerNameProvider } from "../context/PlayerNameContext";
import { CountryProvider } from "../context/CountryContext";
import { useSmoothScrollController } from "./SmoothScroll";
import { useCoveredView } from "./home/useCoveredView";

type View = "home" | "arena" | "solo" | "celebrity" | "facesync";
type ModeId = "camera" | "solo" | "celebrity" | "facesync";

const VIEW_BY_MODE: Record<ModeId, View> = {
  camera: "arena",
  solo: "solo",
  celebrity: "celebrity",
  facesync: "facesync",
};

export default function HomeExperience() {
  return (
    <MediaPipeFaceProvider>
      <UserProfileProvider>
        <PlayerNameProvider>
          <CountryProvider>
            <MotionConfig reducedMotion="user">
              <HomeContent />
            </MotionConfig>
          </CountryProvider>
        </PlayerNameProvider>
      </UserProfileProvider>
    </MediaPipeFaceProvider>
  );
}

function HomeContent() {
  const [view, setView] = useState<View>("home");
  const [supportOpen, setSupportOpen] = useState(true);
  const setSmoothScrollEnabled = useSmoothScrollController();
  const dismissSupport = useCallback(() => setSupportOpen(false), []);
  const openSupport = useCallback(() => setSupportOpen(true), []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("support")) return;
    const timer = window.setTimeout(() => {
      setSupportOpen(false);
      for (const key of ["support", "payment_id", "status", "email"]) url.searchParams.delete(key);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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
      goTo(VIEW_BY_MODE[mode]);
    },
    [goTo],
  );

  const handleBack = useCallback(() => {
    goTo("home");
  }, [goTo]);

  useLayoutEffect(() => {
    if (pendingScrollY.current === null) return;
    const y = pendingScrollY.current;
    pendingScrollY.current = null;
    if (typeof window !== "undefined") {
      window.scrollTo(0, y);
    }
  }, [view]);

  if (view === "arena") {
    return <DuelArena onBack={handleBack} />;
  }

  if (view === "solo") {
    return <SoloFaceJudge onBack={handleBack} />;
  }

  if (view === "celebrity") {
    return <CelebrityDuelArena onBack={handleBack} />;
  }

  if (view === "facesync") {
    return <FaceSyncArena onBack={handleBack} />;
  }

  return <ModeSelect onSelect={handleSelect} supportOpen={supportOpen} onDismissSupport={dismissSupport} onOpenSupport={openSupport} />;
}
