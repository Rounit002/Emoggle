/**
 * Smoke test for the sarcastic message generator.
 * Run with: npx tsx scripts/test-sarcastic.ts
 */
import {
  bandForAccuracy,
  scoreToAccuracyPct,
  generateReactionMessage,
  pickBucket,
  __resetReactionStateForTests,
} from "../app/components/result/SarcasticMessageGenerator";

let failed = 0;
const expect = (name: string, actual: unknown, predicate: (v: unknown) => boolean) => {
  const ok = predicate(actual);
  console.log(`${ok ? "OK  " : "FAIL"}  ${name}  ->  ${JSON.stringify(actual).slice(0, 80)}`);
  if (!ok) failed++;
};

console.log("--- scoreToAccuracyPct ---");
expect("0 score -> 0%", scoreToAccuracyPct(0), (v) => v === 0);
expect("5 score -> 50%", scoreToAccuracyPct(5), (v) => v === 50);
expect("10 score -> 100%", scoreToAccuracyPct(10), (v) => v === 100);
expect("7.3 score -> 73%", scoreToAccuracyPct(7.3), (v) => v === 73);

console.log("\n--- bandForAccuracy ---");
expect("100% -> excellent", bandForAccuracy(100), (v) => v === "excellent");
expect("90% -> excellent", bandForAccuracy(90), (v) => v === "excellent");
expect("89% -> good", bandForAccuracy(89), (v) => v === "good");
expect("75% -> good", bandForAccuracy(75), (v) => v === "good");
expect("74% -> average", bandForAccuracy(74), (v) => v === "average");
expect("50% -> average", bandForAccuracy(50), (v) => v === "average");
expect("49% -> poor", bandForAccuracy(49), (v) => v === "poor");
expect("25% -> poor", bandForAccuracy(25), (v) => v === "poor");
expect("24% -> veryPoor", bandForAccuracy(24), (v) => v === "veryPoor");
expect("0% -> veryPoor", bandForAccuracy(0), (v) => v === "veryPoor");

console.log("\n--- pickBucket ---");
expect(
  "win + excellent -> dominantWin or closeWin",
  pickBucket("win", "excellent", 5),
  (v) => v === "dominantWin" || v === "closeWin",
);
expect(
  "win + excellent, close delta -> closeWin",
  pickBucket("win", "excellent", 0.5),
  (v) => v === "closeWin",
);
expect("win + poor -> lowScoreWin", pickBucket("win", "poor", 3), (v) => v === "lowScoreWin");
expect("loss + close delta -> closeLoss", pickBucket("loss", "good", 1), (v) => v === "closeLoss");
expect("loss + big delta -> heavyLoss", pickBucket("loss", "good", 10), (v) => v === "heavyLoss");
expect("draw -> draw", pickBucket("draw", "good", 0), (v) => v === "draw");

console.log("\n--- generateReactionMessage smoke (10 calls per scenario) ---");
const scenarios = [
  { outcome: "win" as const, score: 9.2, opp: 6.0, label: "Dominant win" },
  { outcome: "win" as const, score: 5.1, opp: 4.9, label: "Close low-score win" },
  { outcome: "loss" as const, score: 8.5, opp: 8.7, label: "Close loss" },
  { outcome: "loss" as const, score: 2.0, opp: 9.0, label: "Heavy loss" },
  { outcome: "draw" as const, score: 6.0, opp: 6.0, label: "Draw" },
];
for (const s of scenarios) {
  const band = bandForAccuracy(scoreToAccuracyPct(s.score));
  const delta = s.score - s.opp;
  __resetReactionStateForTests();
  const samples = Array.from({ length: 10 }, () =>
    generateReactionMessage({ outcome: s.outcome, band, delta }),
  );
  const unique = new Set(samples);
  console.log(`\n${s.label} (${band}, delta ${delta.toFixed(1)}):`);
  samples.forEach((line) => console.log(`  - ${line}`));
  console.log(`  unique: ${unique.size}/10`);
  if (unique.size < 2) {
    console.log("  WARN: low variety");
    failed++;
  }
}

console.log(`\n${failed === 0 ? "ALL OK" : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
