"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
} from "react";

const SmoothScrollControllerContext = createContext<
  ((enabled: boolean) => void) | null
>(null);

export function SmoothScroll({ children }: { children: ReactNode }) {
  // Native scrolling avoids a permanent requestAnimationFrame loop and keeps
  // the main thread available for input, face tracking, and page hydration.
  // Preserve the controller API so game views can still express their intent.
  const setSmoothScrollEnabled = useCallback((enabled: boolean) => {
    void enabled;
  }, []);

  return (
    <SmoothScrollControllerContext.Provider value={setSmoothScrollEnabled}>
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
