"use client";

/**
 * ShareScoreCard
 * --------------
 * A 1080 × 1350 (4:5) social-media-optimized scorecard that is
 * rendered off-screen and captured to PNG by `html-to-image` when
 * the user taps "Share Scorecard". It uses the same Neo-Pop /
 * sticker design language as the rest of Emoggle so the result
 * looks intentional and on-brand in a feed, not like a screenshot
 * of a webpage.
 *
 * The component is purely presentational: the parent decides what
 * to render by passing a `ScorecardData` shape. Layout is locked
 * to fixed pixel dimensions; do NOT make it responsive — the
 * export must always be the same shape regardless of the device
 * the user is sharing from.
 *
 * Notes
 *  - The wrapper is positioned off-screen but still in the
 *    document, which keeps `html-to-image`'s traversal happy. We
 *    intentionally use `left: -10000px` instead of `display: none`
 *    because some browsers will skip rendering hidden subtrees
 *    and the resulting PNG will be blank.
 *  - The fonts are inherited from the page (Quicksand / Plus
 *    Jakarta Sans / JetBrains Mono). html-to-image's default font
 *    embedding will pull them in as data URIs.
 *  - No camera frames, no partner PII — just the player's name,
 *    their score, the opponent's score, the round emoji, and the
 *    pre-generated sarcastic line.
 */

import { forwardRef, type CSSProperties } from "react";
import { siteConfig } from "../../lib/site";

export type ScorecardOutcome = "win" | "loss" | "draw";

export interface ScorecardData {
  outcome: ScorecardOutcome;
  /** Final accuracy as a 0-100 integer percentage. */
  accuracyPct: number;
  /** Player score (out of 10). */
  myScore: number;
  /** Opponent score (out of 10). */
  opponentScore: number;
  /** The target emoji the round was about, e.g. "😱". */
  emoji: string;
  /** Pre-generated sarcastic line. The SAME string shown on the
   *  on-screen ResultScreen MUST be passed here. */
  reactionMessage: string;
  /** Optional player name; falls back to "ME". */
  playerName?: string | null;
  /** Optional opponent name; falls back to "OPPONENT". */
  opponentName?: string | null;
  /** Optional matchId for analytics — never rendered. */
  matchId?: string | null;
}

const SCORECARD_WIDTH = 1080;
const SCORECARD_HEIGHT = 1350;

const OUTCOME_LABELS: Record<ScorecardOutcome, { label: string; emoji: string }> = {
  win: { label: "I WON", emoji: "😎" },
  loss: { label: "I LOST", emoji: "💀" },
  draw: { label: "WE TIED", emoji: "🤝" },
};

const OUTCOME_COLORS: Record<
  ScorecardOutcome,
  { background: string; chip: string; chipText: string; ringText: string }
> = {
  win: {
    background: "#fff8d6", // soft yellow wash
    chip: "#ffd93d", // --yellow
    chipText: "#1a1c1c", // --charcoal
    ringText: "#5644d0", // --purple-deep
  },
  loss: {
    background: "#fde7e3", // soft pink wash
    chip: "#ffb3b0", // --pink
    chipText: "#1a1c1c",
    ringText: "#ae2f34", // --pink-deep
  },
  draw: {
    background: "#ece9ff", // soft purple wash
    chip: "#6f5fea", // --purple
    chipText: "#f9f9f9",
    ringText: "#5644d0",
  },
};

interface ShareScoreCardProps extends ScorecardData {
  className?: string;
  style?: CSSProperties;
}

/**
 * The visible-render wrapper. `forwardRef` is required because
 * `html-to-image.toBlob` accepts a ref'd DOM node.
 */
export const ShareScoreCard = forwardRef<HTMLDivElement, ShareScoreCardProps>(
  function ShareScoreCard(props, ref) {
    const {
      outcome,
      accuracyPct,
      myScore,
      opponentScore,
      emoji,
      reactionMessage,
      playerName,
      opponentName,
      matchId,
      className,
      style,
    } = props;

    const colors = OUTCOME_COLORS[outcome];
    const { label, emoji: outcomeEmoji } = OUTCOME_LABELS[outcome];

    return (
      <div
        ref={ref}
        data-emoggle-scorecard
        data-scorecard-width={SCORECARD_WIDTH}
        data-scorecard-height={SCORECARD_HEIGHT}
        // Capture-time metadata — read back by `useShareScorecard`
        // so the share text and filename reflect what's actually
        // rendered without the parent having to thread props
        // through.
        data-outcome={outcome}
        data-accuracy={accuracyPct}
        data-my-score={myScore}
        data-opponent-score={opponentScore}
        data-emoji={emoji}
        data-reaction={reactionMessage}
        data-player-name={playerName ?? ""}
        data-opponent-name={opponentName ?? ""}
        data-match-id={matchId ?? ""}
        // Off-screen positioning. The element is rendered in the
        // normal paint tree (NOT display: none, NOT visibility:
        // hidden, NOT z-index: -1) so html-to-image and the
        // browser both paint it. `transform: translateX(-200%)`
        // slides it off-canvas to the left so the user never sees
        // it. The host `<ShareScoreCardPortal>` lives directly
        // under document.body, so there's no transformed ancestor
        // interfering with the fixed positioning.
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: SCORECARD_WIDTH,
          height: SCORECARD_HEIGHT,
          transform: "translateX(-200%)",
          pointerEvents: "none",
          // z-index: 0 keeps us in the normal stacking context.
          // Negative z-index made the render path skip the element
          // entirely on some browsers, producing blank captures.
          zIndex: 0,
          fontFamily: "var(--font-display), 'Quicksand', 'Plus Jakarta Sans', system-ui, sans-serif",
          color: "#1a1c1c",
          background: colors.background,
          // Containment keeps the card's paint isolated so the
          // browser actually renders it (some engines de-prioritize
          // off-screen fixed elements).
          contain: "layout paint style",
          ...style,
        }}
        className={className}
        aria-hidden
      >
        <CardBody
          outcome={outcome}
          label={label}
          outcomeEmoji={outcomeEmoji}
          accuracyPct={accuracyPct}
          myScore={myScore}
          opponentScore={opponentScore}
          emoji={emoji}
          reactionMessage={reactionMessage}
          playerName={playerName}
          opponentName={opponentName}
          colors={colors}
        />
      </div>
    );
  },
);

/**
 * The actual card body. Pulled out as a pure render so the layout
 * is easy to inspect during development — drop a `<ShareScoreCard
 * data-emoggle-scorecard />` with `left: 0` to preview it
 * on-screen.
 */
function CardBody({
  outcome,
  label,
  outcomeEmoji,
  accuracyPct,
  myScore,
  opponentScore,
  emoji,
  reactionMessage,
  playerName,
  opponentName,
  colors,
}: {
  outcome: ScorecardOutcome;
  label: string;
  outcomeEmoji: string;
  accuracyPct: number;
  myScore: number;
  opponentScore: number;
  emoji: string;
  reactionMessage: string;
  playerName?: string | null;
  opponentName?: string | null;
  colors: typeof OUTCOME_COLORS.win;
}) {
  const isWin = outcome === "win";
  const isLoss = outcome === "loss";
  const meLabel = (playerName || "ME").slice(0, 14).toUpperCase();
  const oppLabel = (opponentName || "OPPONENT").slice(0, 14).toUpperCase();

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        padding: 64,
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      {/* Top row — wordmark + outcome chip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        <Wordmark />
        <div
          // `whiteSpace: "nowrap"` + `flexShrink: 0` keeps the chip
          // from wrapping its label or getting squeezed when the
          // outer flex row doesn't have enough space.
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 28px",
            borderRadius: 9999,
            border: "5px solid #1a1c1c",
            background: colors.chip,
            color: colors.chipText,
            fontWeight: 800,
            letterSpacing: "0.18em",
            fontSize: 28,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            flexShrink: 0,
            boxShadow: "8px 8px 0 0 #1a1c1c",
            fontFamily: "var(--font-display), 'Quicksand', system-ui, sans-serif",
          }}
        >
          <span aria-hidden style={{ fontSize: 36, lineHeight: 1 }}>
            {outcomeEmoji}
          </span>
          <span>{label}</span>
        </div>
      </div>

      {/* Hero — the emoji that was played */}
      <div
        style={{
          marginTop: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 48,
        }}
      >
        <EmojiTile emoji={emoji} tone={isWin ? "yellow" : isLoss ? "pink" : "purple"} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <span
            style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#4d4633",
              fontFamily: "var(--font-sans), 'Plus Jakarta Sans', system-ui, sans-serif",
            }}
          >
            Expression match
          </span>
          <span
            style={{
              fontSize: 156,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: "-0.04em",
              color: colors.ringText,
              fontFamily: "var(--font-display), 'Quicksand', system-ui, sans-serif",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {accuracyPct}%
          </span>
        </div>
      </div>

      {/* Score blocks — ME vs OPPONENT */}
      <div
        style={{
          marginTop: 56,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 32,
        }}
      >
        <ScoreBlock
          label={meLabel}
          score={myScore}
          tone={isWin ? "purple" : isLoss ? "pink" : "yellow"}
          emphasis={isWin}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 96,
            height: 96,
            borderRadius: 9999,
            border: "5px solid #1a1c1c",
            background: "#ffd93d",
            color: "#1a1c1c",
            fontSize: 36,
            fontWeight: 800,
            textTransform: "uppercase",
            boxShadow: "6px 6px 0 0 #1a1c1c",
            fontFamily: "var(--font-display), 'Quicksand', system-ui, sans-serif",
          }}
        >
          vs
        </div>
        <ScoreBlock
          label={oppLabel}
          score={opponentScore}
          tone={isWin ? "pink" : isLoss ? "purple" : "yellow"}
          emphasis={isLoss}
        />
      </div>

      {/* Reaction message — italic, large, prominent */}
      <div
        style={{
          marginTop: 64,
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            padding: "40px 48px",
            background: "#ffffff",
            border: "5px solid #1a1c1c",
            borderRadius: 32,
            boxShadow: "10px 10px 0 0 #1a1c1c",
            textAlign: "center",
            position: "relative",
          }}
        >
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: -28,
              left: 36,
              fontSize: 36,
              lineHeight: 1,
              padding: "4px 18px",
              borderRadius: 9999,
              border: "4px solid #1a1c1c",
              background: "#ffd93d",
              color: "#1a1c1c",
              fontWeight: 800,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontFamily: "var(--font-sans), 'Plus Jakarta Sans', system-ui, sans-serif",
              whiteSpace: "nowrap",
            }}
          >
            Take that
          </span>
          <span
            style={{
              display: "block",
              fontStyle: "italic",
              fontWeight: 700,
              fontSize: 52,
              lineHeight: 1.2,
              color: "#1a1c1c",
              fontFamily: "var(--font-display), 'Quicksand', system-ui, sans-serif",
              // Long reaction lines can run wider than the card.
              // Cap to ~2 lines so the card stays compact; longer
              // strings get ellipsised instead of overflowing.
              overflowWrap: "break-word",
              wordBreak: "normal",
            }}
          >
            “{reactionMessage}”
          </span>
        </div>
      </div>

      {/* Footer CTA — challenge line + domain */}
      <div
        style={{
          marginTop: 32,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          textAlign: "center",
        }}
      >
        <span
          style={{
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: "0.04em",
            color: "#1a1c1c",
            fontFamily: "var(--font-display), 'Quicksand', system-ui, sans-serif",
            whiteSpace: "nowrap",
          }}
        >
          Think you can beat me?
        </span>
        <span
          style={{
            display: "inline-block",
            padding: "10px 28px",
            borderRadius: 9999,
            border: "4px solid #1a1c1c",
            background: "#1a1c1c",
            color: "#f9f9f9",
            fontWeight: 800,
            letterSpacing: "0.12em",
            fontSize: 28,
            textTransform: "uppercase",
            fontFamily: "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace",
            whiteSpace: "nowrap",
          }}
        >
          {siteConfig.url.replace(/^https?:\/\//, "")}
        </span>
      </div>
    </div>
  );
}

/**
 * Inline SVG wordmark so the export doesn't depend on the next/font
 * CSS variable being resolvable inside the captured subtree. The
 * `fontFamily` falls back through system fonts; the capture is
 * sharp either way.
 */
function Wordmark() {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 22px",
        background: "#ffffff",
        border: "5px solid #1a1c1c",
        borderRadius: 28,
        boxShadow: "8px 8px 0 0 #1a1c1c",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: 44,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color: "#5644d0",
          fontFamily: "var(--font-display), 'Quicksand', system-ui, sans-serif",
        }}
      >
        Em
      </span>
      <svg viewBox="0 0 32 32" width="44" height="44" aria-hidden>
        <circle cx="16" cy="16" r="14" fill="#ffd93d" />
        <path d="M9 14 Q11 11 13 14" stroke="#5644d0" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M19 14 Q21 11 23 14" stroke="#5644d0" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M9 19 Q16 25 23 19" stroke="#5644d0" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </svg>
      <span
        style={{
          fontSize: 44,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color: "#5644d0",
          fontFamily: "var(--font-display), 'Quicksand', system-ui, sans-serif",
        }}
      >
        ggle
      </span>
    </div>
  );
}

function EmojiTile({ emoji, tone }: { emoji: string; tone: "yellow" | "purple" | "pink" }) {
  const bg = tone === "yellow" ? "#ffd93d" : tone === "purple" ? "#6f5fea" : "#ffb3b0";
  const fg = tone === "yellow" ? "#1a1c1c" : tone === "purple" ? "#f9f9f9" : "#1a1c1c";
  return (
    <div
      style={{
        width: 260,
        height: 260,
        borderRadius: 40,
        background: bg,
        color: fg,
        border: "6px solid #1a1c1c",
        boxShadow: "12px 12px 0 0 #1a1c1c",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 184,
        lineHeight: 1,
        transform: "rotate(-4deg)",
      }}
    >
      {emoji}
    </div>
  );
}

function ScoreBlock({
  label,
  score,
  tone,
  emphasis,
}: {
  label: string;
  score: number;
  tone: "yellow" | "purple" | "pink";
  emphasis: boolean;
}) {
  const bg = tone === "yellow" ? "#ffd93d" : tone === "purple" ? "#6f5fea" : "#ffb3b0";
  const fg = tone === "yellow" ? "#1a1c1c" : tone === "purple" ? "#f9f9f9" : "#1a1c1c";
  return (
    <div
      style={{
        padding: "28px 24px",
        borderRadius: 32,
        background: bg,
        color: fg,
        border: "5px solid #1a1c1c",
        boxShadow: emphasis ? "10px 10px 0 0 #1a1c1c" : "6px 6px 0 0 #1a1c1c",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        transform: emphasis ? "rotate(-1.5deg)" : "rotate(1.5deg)",
      }}
    >
      <span
        style={{
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          opacity: 0.85,
          fontFamily: "var(--font-sans), 'Plus Jakarta Sans', system-ui, sans-serif",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 108,
          fontWeight: 800,
          lineHeight: 1,
          letterSpacing: "-0.04em",
          fontFamily: "var(--font-display), 'Quicksand', system-ui, sans-serif",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {Math.round(score * 10) / 10}
      </span>
    </div>
  );
}

/** Fixed dimensions of the share card. Used by the capture helper to
 *  set canvas width/height. */
export const SCORECARD_EXPORT_WIDTH = SCORECARD_WIDTH;
export const SCORECARD_EXPORT_HEIGHT = SCORECARD_HEIGHT;
