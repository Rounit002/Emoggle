"use client";

/**
 * CountryContext
 * --------------
 * Single source of truth for the locally-detected country.
 *
 * Why a context?
 *  - Multiple components (homepage, duel arena, solo screen) want
 *    to display the flag. Without a shared source, every component
 *    would issue its own fetch to ipapi.co / ip-api.com and we'd
 *    burn the free-tier rate limit on the first page load.
 *  - The duel arena also has a server-detected partner country
 *    (passed via the signaling channel). That is a *separate* value
 *    and stays in the matchmaking hook — the context only covers
 *    the local user.
 *
 * Privacy contract
 *  - The context never exposes the user's IP. It only exposes the
 *    resolved country code + display string.
 *  - On first mount the context may briefly be `null` while the
 *    provider awaits the network call. UI consumers should treat
 *    `null` as "no flag" and render gracefully.
 */

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { detectCountry, type DetectedCountry } from "../lib/geo";

interface CountryContextValue {
  country: DetectedCountry | null;
  /** True once we've either resolved a value or exhausted the
   *  network providers. Useful to avoid showing a spinner
   *  indefinitely when the call is blocked. */
  isResolved: boolean;
  /** Force a fresh fetch (e.g. on user demand). */
  refresh: () => void;
}

const CountryContext = createContext<CountryContextValue | null>(null);

export function CountryProvider({ children }: { children: ReactNode }) {
  const [country, setCountry] = useState<DetectedCountry | null>(null);
  const [isResolved, setIsResolved] = useState(false);
  // Bump to trigger a refetch; mounted components re-render but
  // the in-flight promise itself can't be cancelled from here.
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsResolved(false);
    detectCountry()
      .then((value) => {
        if (cancelled) return;
        setCountry(value);
        setIsResolved(true);
      })
      .catch(() => {
        if (cancelled) return;
        setIsResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const value = useMemo<CountryContextValue>(
    () => ({
      country,
      isResolved,
      refresh: () => setRefreshTick((tick) => tick + 1),
    }),
    [country, isResolved],
  );

  return <CountryContext.Provider value={value}>{children}</CountryContext.Provider>;
}

export function useCountry(): CountryContextValue {
  const ctx = useContext(CountryContext);
  if (!ctx) {
    throw new Error("useCountry must be used inside CountryProvider");
  }
  return ctx;
}
