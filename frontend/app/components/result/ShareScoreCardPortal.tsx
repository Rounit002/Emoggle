"use client";

/**
 * ShareScoreCardPortal
 * --------------------
 * Renders the off-screen `<ShareScoreCard>` through a React portal
 * so it ends up directly under `document.body`, with no transformed
 * ancestor in between.
 *
 * Why a portal
 *  The result modal uses framer-motion `transform` for the
 *  spring-in animation. A `position: fixed` element nested inside
 *  a transformed parent is positioned relative to that parent —
 *  not the viewport — which would (a) make the card 1080x1350
 *  overflow the modal's 600-ish pixel box and get clipped, and
 *  (b) confuse `html-to-image` into capturing a 0x0 region.
 *
 * Why not `display: none` or `visibility: hidden`
 *  Both prevent the browser from laying out the subtree. The
 *  resulting capture is empty. We use `position: fixed` with
 *  `transform: translateX(-200%)` so the element keeps its
 *  computed box but sits entirely off-screen. z-index is `0` —
 *  not negative, because some renderers drop elements with
 *  `z-index < 0` from the paint tree.
 *
 * Lifecycle
 *  - On mount, create a host `<div>` and append to `document.body`.
 *  - On unmount, remove the host so we never leave orphans.
 *  - The ref passed in is forwarded to the underlying card so
 *    `html-to-image` can read the rendered DOM.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ShareScoreCardPortalProps {
  children: React.ReactNode;
}

export const ShareScoreCardPortal = forwardRef<HTMLElement, ShareScoreCardPortalProps>(
  function ShareScoreCardPortal({ children }, forwardedRef) {
    const [host, setHost] = useState<HTMLDivElement | null>(null);
    // The internal ref holds the actual card DOM node (children
    // ref). We forward to that so `useShareScorecard` can read
    // the rendered scorecard.
    const innerRef = useRef<HTMLElement | null>(null);
    useImperativeHandle(forwardedRef, () => innerRef.current as HTMLElement);

    useEffect(() => {
      if (typeof document === "undefined") return;
      const node = document.createElement("div");
      // The host div is itself positioned off-screen and given a
      // normal stacking context. Its children (the scorecard)
      // inherit `position: fixed; transform: translateX(-200%)` so
      // they remain rendered but invisible.
      node.setAttribute("data-emoggle-scorecard-host", "");
      node.style.position = "fixed";
      node.style.top = "0";
      node.style.left = "0";
      node.style.width = "0";
      node.style.height = "0";
      node.style.overflow = "visible";
      node.style.pointerEvents = "none";
      node.style.zIndex = "0";
      document.body.appendChild(node);
      setHost(node);
      return () => {
        // Defensive: only remove if it's still ours.
        if (node.parentNode === document.body) {
          document.body.removeChild(node);
        }
      };
    }, []);

    if (!host) return null;
    return createPortal(
      // Clone the child and inject our ref. We use a render prop
      // pattern by wrapping the child in a div with our own ref
      // callback so the consumer's `ref` ends up pointing at the
      // actually-rendered DOM node.
      <div
        ref={(el) => {
          if (el) {
            // Pick the first child HTMLElement — that's the
            // ShareScoreCard's root div.
            innerRef.current = (el.firstElementChild as HTMLElement | null) ?? (el as unknown as HTMLElement);
          } else {
            innerRef.current = null;
          }
        }}
        style={{ display: "contents" }}
      >
        {children}
      </div>,
      host,
    );
  },
);
