"use client";

import { useEffect } from "react";

/** How many mounted views are currently covering the landing page. */
let coverCount = 0;

/**
 * Flags the document while a full-screen view — a camera arena, or the
 * "Play now" mode picker — sits on top of the landing page.
 *
 * The page-level doodle backdrop watches for the flag and drops itself
 * out of the page rather than compositing eight animated tracks behind
 * something opaque. The picker's own backdrop is exempt, so the
 * wallpaper carries straight through the transition.
 *
 * Ref-counted rather than a plain set/remove pair: picking a mode
 * closes the picker and opens an arena in the same commit, and the
 * closing view's cleanup runs before the opening view's effect. A
 * naive implementation would clear the flag on the way past and leave
 * the backdrop running behind the arena for the rest of the session.
 */
export function useCoveredView(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const root = document.documentElement;
    coverCount += 1;
    root.setAttribute("data-covered", "");

    return () => {
      coverCount -= 1;
      if (coverCount === 0) {
        root.removeAttribute("data-covered");
      }
    };
  }, [active]);
}
