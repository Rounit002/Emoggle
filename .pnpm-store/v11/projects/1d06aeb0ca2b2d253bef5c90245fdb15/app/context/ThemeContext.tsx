"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "light" | "dark";
export type ThemeSource = "system" | "manual";

interface ThemeContextValue {
  /** The mode currently applied to <html data-theme=...>. */
  mode: ThemeMode;
  /**
   * Where the mode is coming from. "system" means we follow
   * `prefers-color-scheme`; "manual" means the user explicitly
   * chose via the toggle and the choice is persisted.
   */
  source: ThemeSource;
  /** True when resolved mode is dark, regardless of source. */
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
  resetToSystem: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "emoggle:theme";
const HTML_DATA_ATTR = "data-theme";

function readStored(): { mode: ThemeMode; source: ThemeSource } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark") {
      return { mode: raw, source: "manual" };
    }
  } catch {
    /* storage blocked — fall through */
  }
  return null;
}

function getSystemMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyToDom(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute(HTML_DATA_ATTR, mode);
  // Keep the iOS / Android status bar in sync with the theme.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      "content",
      mode === "dark" ? "#1c1a18" : "#f9f9f9",
    );
  }
}

/**
 * Wraps the app and exposes the active theme.
 *
 * The first paint uses the value pre-computed by the inline boot
 * script in layout.tsx (so there's no light/dark flash). This
 * provider then takes over and keeps React state in sync with
 * system preference changes (when source === "system") and with
 * explicit user toggles (when source === "manual").
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("light");
  const [source, setSource] = useState<ThemeSource>("system");

  // Read whatever the inline boot script decided, so React state
  // matches the DOM on first hydration. This is the no-flash bridge.
  useEffect(() => {
    const stored = readStored();
    if (stored) {
      setModeState(stored.mode);
      setSource(stored.source);
      applyToDom(stored.mode);
    } else {
      const sys = getSystemMode();
      setModeState(sys);
      setSource("system");
      applyToDom(sys);
    }
  }, []);

  // Follow the OS when source === "system".
  useEffect(() => {
    if (source !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      const next: ThemeMode = e.matches ? "dark" : "light";
      setModeState(next);
      applyToDom(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [source]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    setSource("manual");
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage blocked */
    }
    applyToDom(next);
  }, []);

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next: ThemeMode = prev === "dark" ? "light" : "dark";
      setSource("manual");
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* storage blocked */
      }
      applyToDom(next);
      return next;
    });
  }, []);

  const resetToSystem = useCallback(() => {
    setSource("system");
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage blocked */
    }
    const sys = getSystemMode();
    setModeState(sys);
    applyToDom(sys);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      source,
      isDark: mode === "dark",
      setMode,
      toggle,
      resetToSystem,
    }),
    [mode, source, setMode, toggle, resetToSystem],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return ctx;
}
