"use client";

import type { LenisOptions } from "lenis";
import { ReactLenis } from "lenis/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const options = {
  anchors: true,
  autoRaf: true,
  smoothWheel: true,
} satisfies LenisOptions;

const SmoothScrollControllerContext = createContext<
  ((enabled: boolean) => void) | null
>(null);

function subscribeToReducedMotion(onChange: () => void) {
  const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  mediaQuery.addEventListener("change", onChange);

  return () => mediaQuery.removeEventListener("change", onChange);
}

function getReducedMotionPreference() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getServerReducedMotionPreference() {
  // Keep native scrolling until the client preference is known.
  return true;
}

export function SmoothScroll({ children }: { children: ReactNode }) {
  const [isEnabled, setIsEnabled] = useState(true);
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionPreference,
    getServerReducedMotionPreference,
  );
  const setSmoothScrollEnabled = useCallback((enabled: boolean) => {
    setIsEnabled(enabled);
  }, []);

  const shouldRun = isEnabled && !prefersReducedMotion;

  return (
    <SmoothScrollControllerContext.Provider value={setSmoothScrollEnabled}>
      {shouldRun ? <ReactLenis root options={options} /> : null}
      {children}
    </SmoothScrollControllerContext.Provider>
  );
}

export function useSmoothScrollController() {
  const controller = useContext(SmoothScrollControllerContext);

  if (!controller) {
    throw new Error(
      "useSmoothScrollController must be used inside SmoothScroll",
    );
  }

  return controller;
}
