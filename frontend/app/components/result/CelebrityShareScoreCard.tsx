"use client";

/**
 * CelebrityShareScoreCard
 * -----------------------
 * The 1080×1350 (4:5) social card for the Celebrity Face Mimic
 * mode. Mirrors the layout language of the emoji-mode
 * `ShareScoreCard` so a regular player can immediately tell
 * they came from the same app, but the "round emoji" tile is
 * replaced with the celebrity target photo so the share image
 * tells a complete "I tried to be like X and got 78% accuracy"
 * story in a single picture.
 *
 * Pure presentational. Parent passes the `CelebrityShareData`
 * shape and we render an off-screen fixed div that
 * `useShareScorecard` captures to PNG. No webcam, no partner
 * PII, no scoring data beyond what the visible result screen
 * already shows.
 */

import { forwardRef, type CSSProperties } from "react";
import { siteConfig } from "../../lib/site";

export type ScorecardOutcome = "win" | "loss" | "draw";

export interface CelebrityShareData {
  outcome: ScorecardOutcome;
  /** Player accuracy as a 0-100 integer percentage (we round for display). */
  accuracyPct: number;
  /** Player score (out of 10). */
  myScore: number;
  /** Opponent score (out of 10). */
  opponentScore: number;
  /** Pre-generated reaction line — same as the on-screen result. */
  reactionMessage: string;
  /** Player name; falls back to "ME". */
  playerName?: string | null;
  /** Opponent name; falls back to "OPPONENT". */
  opponentName?: string | null;
  /** Optional matchId for analytics — never rendered. */
  matchId?: string | null;
  /** Celebrity being imitated. */
  celebrity: {
    id: number | null;
    name: string;
    imageUrl: string;
    category?: string;
    difficulty?: string;
  } | null;
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
  { background: string; chip: string; chipText: string; ringText: string; cardBorder: string }
> = {
  win: {
    background: "#fff8d6", // soft yellow wash
    chip: "#ffd93d", // --yellow
    chipText: "#1a1c1c", // --charcoal
    ringText: "#5644d0", // --purple-deep
    cardBorder: "#1a1c1c",
  },
  loss: {
    background: "#fde7e3", // soft pink wash
    chip: "#ffb3b0", // --pink
    chipText: "#1a1c1c",
    ringText: "#ae2f34", // --pink-deep
    cardBorder: "#1a1c1c",
  },
  draw: {
    background: "#ece9ff", // soft purple wash
    chip: "#6f5fea", // --purple
    chipText: "#f9f9f9",
    ringText: "#5644d0",
    cardBorder: "#1a1c1c",
  },
};

interface CelebrityShareScoreCardProps extends CelebrityShareData {
  className?: string;
  style?: CSSProperties;
}

export const SCORECARD_EXPORT_WIDTH = SCORECARD_WIDTH;
export const SCORECARD_EXPORT_HEIGHT = SCORECARD_HEIGHT;

export const CelebrityShareScoreCard = forwardRef<
  HTMLDivElement,
  CelebrityShareScoreCardProps
>(function CelebrityShareScoreCard(props, ref) {
  const {
    outcome,
    accuracyPct,
    myScore,
    opponentScore,
    reactionMessage,
    playerName,
    opponentName,
    matchId,
    celebrity,
    className,
    style,
  } = props;

  const colors = OUTCOME_COLORS[outcome];
  const { label, emoji: outcomeEmoji } = OUTCOME_LABELS[outcome];
  const meLabel = (playerName || "ME").slice(0, 14).toUpperCase();
  const oppLabel = (opponentName || "OPPONENT").slice(0, 14).toUpperCase();
  const celebName = (celebrity?.name ?? "Celebrity").slice(0, 26).toUpperCase();

  return (
    <div
      ref={ref}
      data-emoggle-scorecard
      data-celebrity-share="true"
      data-scorecard-width={SCORECARD_WIDTH}
      data-scorecard-height={SCORECARD_HEIGHT}
      data-outcome={outcome}
      data-accuracy={accuracyPct}
      data-my-score={myScore}
      data-opponent-score={opponentScore}
      // The `data-emoji` field is kept for backwards compatibility
      // with the existing share-text generator in
      // `useShareScorecard.ts` (which falls back to it when the
      // celebrity-specific label isn't provided). The actual
      // "expression" for celebrity rounds is the celebrity name.
      data-emoji={celebrity?.name ?? "celebrity"}
      data-celebrity-name={celebrity?.name ?? ""}
      data-celebrity-id={celebrity?.id ?? ""}
      data-reaction={reactionMessage}
      data-player-name={playerName ?? ""}
      data-opponent-name={opponentName ?? ""}
      data-match-id={matchId ?? ""}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: SCORECARD_WIDTH,
        height: SCORECARD_HEIGHT,
        transform: "translateX(-200%)",
        pointerEvents: "none",
        zIndex: 0,
        fontFamily: "var(--font-display), 'Quicksand', 'Plus Jakarta Sans', system-ui, sans-serif",
        color: "#1a1c1c",
        background: colors.background,
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
        reactionMessage={reactionMessage}
        playerName={meLabel}
        opponentName={oppLabel}
        celebrity={celebrity}
        celebName={celebName}
        colors={colors}
      />
    </div>
  );
});

function CardBody({
  outcome,
  label,
  outcomeEmoji,
  accuracyPct,
  myScore,
  opponentScore,
  reactionMessage,
  playerName,
  opponentName,
  celebrity,
  celebName,
  colors,
}: {
  outcome: ScorecardOutcome;
  label: string;
  outcomeEmoji: string;
  accuracyPct: number;
  myScore: number;
  opponentScore: number;
  reactionMessage: string;
  playerName: string;
  opponentName: string;
  celebrity: CelebrityShareData["celebrity"];
  celebName: string;
  colors: typeof OUTCOME_COLORS.win;
}) {
  const isWin = outcome === "win";
  const isLoss = outcome === "loss";

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

      {/* Hero — celebrity target + accuracy percentage */}
      <div
        style={{
          marginTop: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 48,
        }}
      >
        <CelebrityTile celebrity={celebrity} tone={isWin ? "yellow" : isLoss ? "pink" : "purple"} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#4d4633",
              fontFamily: "var(--font-sans), 'Plus Jakarta Sans', system-ui, sans-serif",
            }}
          >
            Mimic accuracy
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
          <span
            style={{
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#1a1c1c",
              fontFamily: "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace",
            }}
          >
            Imitating {celebName}
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
          label={playerName}
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
          label={opponentName}
          score={opponentScore}
          tone={isWin ? "pink" : isLoss ? "purple" : "yellow"}
          emphasis={isLoss}
        />
      </div>

      {/* Reaction */}
      <div
        style={{
          marginTop: 48,
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            padding: "32px 40px",
            background: "#ffffff",
            border: "5px solid #1a1c1c",
            borderRadius: 28,
            boxShadow: "8px 8px 0 0 #1a1c1c",
            textAlign: "center",
            position: "relative",
          }}
        >
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: -22,
              left: 32,
              fontSize: 28,
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
            Verdict
          </span>
          <span
            style={{
              display: "block",
              fontStyle: "italic",
              fontWeight: 700,
              fontSize: 42,
              lineHeight: 1.25,
              color: "#1a1c1c",
              fontFamily: "var(--font-display), 'Quicksand', system-ui, sans-serif",
              overflowWrap: "break-word",
            }}
          >
            “{reactionMessage}”
          </span>
        </div>
      </div>

      {/* Footer */}
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
          Think you can do better?
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

function CelebrityTile({
  celebrity,
  tone,
}: {
  celebrity: CelebrityShareData["celebrity"];
  tone: "yellow" | "purple" | "pink";
}) {
  const fill =
    tone === "yellow" ? "#ffd93d" : tone === "purple" ? "#6f5fea" : "#ffb3b0";
  const textColor = tone === "purple" ? "#f9f9f9" : "#1a1c1c";
  return (
    <div
      style={{
        flexShrink: 0,
        width: 280,
        height: 280,
        borderRadius: 40,
        border: "8px solid #1a1c1c",
        background: fill,
        color: textColor,
        boxShadow: "10px 10px 0 0 #1a1c1c",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {celebrity?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={celebrity.imageUrl}
          alt={celebrity.name}
          crossOrigin="anonymous"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        <span style={{ fontSize: 120, lineHeight: 1 }} aria-hidden>
          🏆
        </span>
      )}
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
  tone: "purple" | "pink" | "yellow";
  emphasis: boolean;
}) {
  const fill =
    tone === "yellow" ? "#ffd93d" : tone === "purple" ? "#6f5fea" : "#ffb3b0";
  const textColor = tone === "purple" ? "#f9f9f9" : "#1a1c1c";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: "24px 16px",
        borderRadius: 32,
        border: "5px solid #1a1c1c",
        background: fill,
        color: textColor,
        boxShadow: "8px 8px 0 0 #1a1c1c",
      }}
    >
      <span
        style={{
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontFamily: "var(--font-sans), 'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 96,
          fontWeight: 800,
          lineHeight: 1,
          fontFamily: "var(--font-display), 'Quicksand', system-ui, sans-serif",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {score.toFixed(1)}
      </span>
      {emphasis && (
        <span
          style={{
            display: "inline-block",
            padding: "6px 18px",
            borderRadius: 9999,
            border: "4px solid #1a1c1c",
            background: "#1a1c1c",
            color: "#ffd93d",
            fontWeight: 800,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontSize: 18,
          }}
        >
          Winner
        </span>
      )}
    </div>
  );
}

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
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "#1a1c1c",
          fontFamily: "var(--font-sans), 'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        Celebrity Mode
      </span>
    </div>
  );
}
