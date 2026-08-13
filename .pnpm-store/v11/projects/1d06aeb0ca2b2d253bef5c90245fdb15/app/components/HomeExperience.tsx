"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import CelebrityDuelArena from "./CelebrityDuelArena";
import DuelArena from "./DuelArena";
import ModeSelect from "./ModeSelect";
import SoloFaceJudge from "./SoloFaceJudge";
import { MediaPipeFaceProvider } from "../context/MediaPipeFaceContext";
import { UserProfileProvider } from "../context/UserProfileContext";
import { RevenueCatProvider } from "../context/RevenueCatContext";
import { useSmoothScrollController } from "./SmoothScroll";

type View = "home" | "arena" | "solo" | "celebrity";
type ModeId = "camera" | "solo" | "celebrity";

const VIEW_BY_MODE: Record<ModeId, View> = {
  camera: "arena",
  solo: "solo",
  celebrity: "celebrity",
};

export default function HomeExperience() {
  return (
    <MediaPipeFaceProvider>
      <UserProfileProvider>
        <RevenueCatProvider>
          <HomeContent />
        </RevenueCatProvider>
      </UserProfileProvider>
    </MediaPipeFaceProvider>
  );
}

function HomeContent() {
  const [view, setView] = useState<View>("home");
  const setSmoothScrollEnabled = useSmoothScrollController();

  /* Pin the page scroll position across view transitions.

     The user has been reading the landing page (which includes
     the long "How Emoggle works" / FAQ / nav sections below the
     mode select). When they hit "Play now" the view swaps from
     ModeSelect to DuelArena — the new content tree has a
     different intrinsic height, and the browser's default
     "preserve scroll offset" behavior can drag the viewport to
     the bottom of the new content.

     To make the page stay exactly where the user left it, we
     snapshot window.scrollY at the moment the user picks a mode
     (or hits Back), then re-apply it in a layout effect after
     React has committed the new tree. The effect runs before
     the browser paints, so the user never sees the jump. */
  const pendingScrollY = useRef<number | null>(null);

  const goTo = useCallback((next: View) => {
    if (typeof window !== "undefined") {
      pendingScrollY.current = window.scrollY;
    }
    // Live camera modes already run animation and face-tracking loops.
    // Remove Lenis before those trees mount so its global RAF does not
    // compete for the same frame budget.
    setSmoothScrollEnabled(next === "home");
    setView(next);
  }, [setSmoothScrollEnabled]);

  useEffect(
    () => () => {
      // Route navigation can unmount this experience from any view.
      // Restore the layout-level default for the next page.
      setSmoothScrollEnabled(true);
    },
    [setSmoothScrollEnabled],
  );

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

  return <ModeSelect onSelect={handleSelect} />;
}
