/**
 * geo
 * ---
 * Client-side IP-based country detection.
 *
 * Strategy
 *  - Try `ipapi.co/json/` first. Free, no API key, ~1k req/day per
 *    IP which is fine for the "once per session per user" pattern.
 *  - Fall back to `ip-api.com` if the primary call fails, is
 *    rate-limited, or is blocked by an ad blocker.
 *  - Cache the detected country in localStorage for 24h, with a
 *    timestamp, so we don't hit the network on every page load.
 *  - Return `null` on every failure. The UI is expected to
 *    gracefully omit the flag/country rather than show an error.
 *
 * Privacy
 *  - The call reveals the user's public IP to the geo provider
 *    and to anyone watching this page's network traffic. That's
 *    the same surface as loading any third-party widget. The
 *    browser does not include cookies or other Emoggle state in
 *    the request — both providers respond on the `ip` field alone.
 *  - We never send the resolved country (or any other user data)
 *    to our own backend. It stays in this tab.
 */

import {
  COUNTRY_CACHE_TTL_MS,
  getCountryCache,
  isCountryCacheFresh,
  setCountryCache,
  type CountryCache,
} from "./storage";
import { countryLabelFromCode, isoFlag } from "./country";

export interface DetectedCountry {
  countryCode: string;
  display: string; // "🇮🇳 India"
  flag: string; // "🇮🇳"
}

/* ─── Response shapes ──────────────────────────────────────────────── */

interface IpapiResponse {
  country?: string;
  country_name?: string;
  // The free ipapi.co endpoint uses "country" (2-letter) and
  // "country_name" (full name). Both may be missing on error.
  error?: boolean;
  reason?: string;
}

interface IpApiResponse {
  status?: string;
  countryCode?: string;
  country?: string;
}

/* ─── Providers ───────────────────────────────────────────────────── */

async function fetchFromIpapi(timeoutMs = 4000): Promise<DetectedCountry | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://ipapi.co/json/", {
      method: "GET",
      signal: controller.signal,
      // No credentials, no cookies. The endpoint is unauthenticated.
      credentials: "omit",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as IpapiResponse;
    if (data.error || !data.country) return null;
    const code = data.country.toUpperCase();
    const flag = isoFlag(code);
    if (!flag) return null;
    const name = typeof data.country_name === "string" ? data.country_name : null;
    const display = name ? `${flag} ${name}` : countryLabelFromCode(code) || flag;
    return { countryCode: code, display, flag };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchFromIpApiCom(timeoutMs = 4000): Promise<DetectedCountry | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("http://ip-api.com/json/?fields=status,country,countryCode", {
      method: "GET",
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as IpApiResponse;
    if (data.status !== "success" || !data.countryCode) return null;
    const code = data.countryCode.toUpperCase();
    const flag = isoFlag(code);
    if (!flag) return null;
    const name = typeof data.country === "string" ? data.country : null;
    const display = name ? `${flag} ${name}` : countryLabelFromCode(code) || flag;
    return { countryCode: code, display, flag };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/* ─── Public API ──────────────────────────────────────────────────── */

export interface DetectCountryOptions {
  /** Skip the localStorage cache and force a fresh network call. */
  bypassCache?: boolean;
}

/**
 * Detect the user's country. Always resolves to either a populated
 * `DetectedCountry` or `null` — never throws.
 *
 * Cache: the cached value (if any) is returned synchronously. If
 * the cache is missing or stale, the function fetches a fresh value
 * in the background and the caller is expected to read the result
 * via the returned promise. The fresh value is written to cache
 * automatically.
 */
export function detectCountry(options: DetectCountryOptions = {}): Promise<DetectedCountry | null> {
  return (async () => {
    if (typeof window === "undefined") return null;

    // Serve from cache if it's still fresh.
    if (!options.bypassCache) {
      const cached = getCountryCache();
      if (cached && isCountryCacheFresh(cached)) {
        return { countryCode: cached.countryCode, display: cached.display, flag: cached.flag };
      }
    }

    // Try the primary provider, then the fallback. The two
    // endpoints are tried in parallel only on the first attempt;
    // if both fail we just return null.
    const detected =
      (await fetchFromIpapi()) ?? (await fetchFromIpApiCom());
    if (!detected) return null;

    // Persist to cache. 24h TTL is the standard — the user's IP
    // can change, but the same VPN exit will often resolve to
    // the same country for days.
    const entry: CountryCache = {
      countryCode: detected.countryCode,
      display: detected.display,
      flag: detected.flag,
      fetchedAt: Date.now(),
    };
    setCountryCache(entry);
    return detected;
  })();
}

/** Returns the cached country synchronously, or null. Useful for
 *  first-paint rendering of the flag — the network call can fill
 *  in the real value later. */
export function readCachedCountry(): DetectedCountry | null {
  const cached = getCountryCache();
  if (!cached) return null;
  if (!isCountryCacheFresh(cached)) return null;
  return { countryCode: cached.countryCode, display: cached.display, flag: cached.flag };
}

/** Helper used by the time-to-live constant. */
export { COUNTRY_CACHE_TTL_MS };
