export { ResultScreen } from "./ResultScreen";
export type { MatchResultLike } from "./ResultScreen";
export { ShareScoreCard } from "./ShareScoreCard";
export type {
  ScorecardData,
  ScorecardOutcome,
} from "./ShareScoreCard";
export { ShareScoreCardPortal } from "./ShareScoreCardPortal";
export { ShareButton } from "./ShareButton";
export { useShareScorecard } from "./useShareScorecard";
export type { SharePhase } from "./useShareScorecard";
export {
  bandForAccuracy,
  generateReactionMessage,
  scoreToAccuracyPct,
  type AccuracyBand,
  type Outcome,
} from "./SarcasticMessageGenerator";
export {
  trackResultEvent,
  type ResultAnalyticsPayload,
  type ResultView,
} from "./analytics";
