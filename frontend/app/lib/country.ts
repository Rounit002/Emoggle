/**
 * country
 * -------
 * Small helpers for turning a 2-letter ISO country code into the
 * flag emoji + display label. Used by the geo-detection module, the
 * duel tile overlays, the solo screen, and the result screen.
 *
 * The server uses the same algorithm in `signaling-server/index.js`
 * (see `isoFlag` and `countryLabelFromCode`). Keep them in sync if
 * you tweak the formula.
 */

/** Convert a 2-letter ISO code ("IN") to a regional-indicator flag
 *  emoji ("🇮🇳"). Returns null for malformed input. */
export const UNKNOWN_COUNTRY_FLAG = "🌐";

export function isoFlag(code: string | null | undefined): string | null {
  if (typeof code !== "string") return null;
  const cc = code.trim().toUpperCase();
  if (cc.length !== 2) return null;
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  return cc.replace(
    /./g,
    (char) => String.fromCodePoint(127462 + char.charCodeAt(0) - 65),
  );
}

/** Return a "🇮🇳 India" style label, or just the flag if the
 *  Intl.DisplayNames lookup fails. Pure function — does not call
 *  any external API. */
export function countryLabelFromCode(code: string | null | undefined): string | null {
  const flag = isoFlag(code);
  if (!flag) return null;
  // isoFlag already validated the code shape; re-grab the
  // upper-cased form for the Intl lookup.
  const upper = (code ?? "").trim().toUpperCase();
  let name: string | undefined;
  try {
    name = new Intl.DisplayNames(["en"], { type: "region" }).of(upper);
  } catch {
    /* older browsers — fall back to the flag only */
  }
  return name ? `${flag} ${name}` : flag;
}

/** Short version used in tight UI like a single "🇮🇳". Returns the
 *  flag string or null when the code is unusable. */
export function countryFlag(code: string | null | undefined): string | null {
  return isoFlag(code);
}

/**
 * Best-effort flag extraction for whatever the wire / cache
 * might have handed us. The priority order matches the server
 * (see `extractCountryCode` in `signaling-server/index.js`):
 *
 *   1. `isoFlag(countryCode)` — the canonical 2-letter ISO code.
 *      Always preferred.
 *   2. Regional-indicator prefix in `country` — legacy display
 *      strings like "🇮🇳 India" already start with the flag.
 *   3. `isoFlag(country.split(" ")[0])` — handles a display
 *      string that turned out to be just the raw code ("IN").
 *
 * Returns null only when none of the candidates look like a flag.
 * This is the function renderers should use so a glitched
 * upstream value can never make the user see the bare ISO code
 * where they should see the emoji.
 */
export function flagFromAny(
  country: string | null | undefined,
  countryCode: string | null | undefined,
): string | null {
  const fromCode = isoFlag(countryCode ?? null);
  if (fromCode) return fromCode;

  if (country) {
    const firstToken = country.split(" ")[0];
    if (!firstToken) return null;

    // Regional-indicator prefix check. "🇮🇳 India" → firstToken
    // is "🇮🇳", which is two regional-indicator code points.
    const regionalIndicatorStart = 0x1f1e6;
    const regionalIndicatorEnd = 0x1f1ff;
    const codePoints = Array.from(firstToken);
    if (codePoints.length >= 2) {
      const c1 = codePoints[0].codePointAt(0) ?? 0;
      const c2 = codePoints[1].codePointAt(0) ?? 0;
      if (
        c1 >= regionalIndicatorStart &&
        c1 <= regionalIndicatorEnd &&
        c2 >= regionalIndicatorStart &&
        c2 <= regionalIndicatorEnd
      ) {
        return firstToken;
      }
    }

    // Raw 2-letter code that snuck through as the display
    // string. `isoFlag` round-trips it to the regional pair.
    const fromToken = isoFlag(firstToken);
    if (fromToken) return fromToken;
  }

  return null;
}

/** Render-safe wrapper used by UI surfaces that always reserve a
 * country marker. Invalid or missing metadata becomes a neutral
 * globe instead of a raw code, broken image, or malformed glyph. */
export function flagFromAnyOrFallback(
  country: string | null | undefined,
  countryCode: string | null | undefined,
): string {
  return flagFromAny(country, countryCode) ?? UNKNOWN_COUNTRY_FLAG;
}
