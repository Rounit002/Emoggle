/**
 * Test-only route. Mounts the real ShareScoreCard with
 * representative data and renders it on the page so the headless
 * verifier can capture it through the same DOM path the live
 * app uses.
 *
 * This file lives at /verify-scorecard and is never linked
 * from the real UI. It exists so a regression in the share-card
 * capture flow can be caught by `npm run verify:scorecard`
 * without a full E2E suite.
 */
import { ShareScoreCard } from "../components/result/ShareScoreCard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function VerifyScoreCardPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        margin: 0,
        padding: 0,
        background: "transparent",
      }}
    >
      <ShareScoreCard
        outcome="win"
        accuracyPct={87}
        myScore={8.7}
        opponentScore={7.3}
        emoji="😱"
        reactionMessage="Bro became the emoji 💀"
        playerName="ME"
        opponentName="STRANGER"
        matchId="verify-1"
      />
    </main>
  );
}
