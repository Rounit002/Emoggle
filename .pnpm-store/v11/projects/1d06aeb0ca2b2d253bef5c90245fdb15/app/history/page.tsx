"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo, Pill, Button, ThemeToggle, ArrowLeft, Trash, History as HistoryIcon, cn } from "../ui";

const SOLO_KEY = "emoggle:solo-history";
const DUEL_KEY = "emoggle:duel-history";

interface SoloEntry {
  emoji: string;
  score: number;
  ts: number;
}

interface DuelEntry {
  id: string;
  ts: number;
  mySeat: "a" | "b";
  myScore: number;
  rivalScore: number;
  winner: "you" | "rival" | "tie";
  myTier: string;
  myElo: number;
  myDelta: number | null;
}

type Tab = "solo" | "duels";

export default function HistoryPage() {
  const [tab, setTab] = useState<Tab>("solo");
  const [solo, setSolo] = useState<SoloEntry[]>([]);
  const [duels, setDuels] = useState<DuelEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const s = window.localStorage.getItem(SOLO_KEY);
      if (s) {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) setSolo(parsed.filter(isSolo));
      }
    } catch { /* ignore */ }
    try {
      const d = window.localStorage.getItem(DUEL_KEY);
      if (d) {
        const parsed = JSON.parse(d);
        if (Array.isArray(parsed)) setDuels(parsed.filter(isDuel));
      }
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  const clearAll = () => {
    if (!window.confirm("Clear all history on this device?")) return;
    window.localStorage.removeItem(SOLO_KEY);
    window.localStorage.removeItem(DUEL_KEY);
    setSolo([]);
    setDuels([]);
  };

  const soloBest = solo.length > 0 ? Math.max(...solo.map((e) => e.score)) : null;
  const soloAverage =
    solo.length > 0
      ? Number((solo.reduce((sum, e) => sum + e.score, 0) / solo.length).toFixed(2))
      : null;
  const duelsWon = duels.filter((d) => d.winner === "you").length;
  const duelsTied = duels.filter((d) => d.winner === "tie").length;
  const duelsLost = duels.filter((d) => d.winner === "rival").length;

  return (
    <div className="min-h-screen w-full bg-[var(--off-white)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1200px] flex-col px-5 py-6 sm:px-8 sm:py-10">
        <header className="flex items-center justify-between border-b-[3px] border-[var(--charcoal)] pb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--charcoal)] hover:underline"
          >
            <ArrowLeft size={16} />
            Back
          </Link>
          <Logo size="sm" />
          <div className="flex items-center gap-2">
            <ThemeToggle size="sm" />
            <div className="w-2" />
          </div>
        </header>

        <section className="mt-10">
          <span className="eyebrow">Your history</span>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[var(--charcoal)] sm:text-5xl">
            Every face, every score.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--on-surface-variant)]">
            Your solo scans and live duels live on this device. Nothing here is
            uploaded, sold, or used to train anything.
          </p>
        </section>

        <section className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Solo best"
            value={soloBest === null ? "—" : soloBest.toFixed(1)}
            sub={solo.length === 0 ? "No attempts" : `of ${solo.length} attempts`}
            tilt="tilt-l-1"
            fill="yellow"
          />
          <StatCard
            label="Solo average"
            value={soloAverage === null ? "—" : soloAverage.toFixed(2)}
            sub="Last 50 attempts"
            tilt="tilt-r-1"
            fill="purple"
          />
          <StatCard
            label="Duels won"
            value={duelsWon.toString()}
            sub={`${duelsTied} tied · ${duelsLost} lost`}
            tilt="tilt-l-2"
            fill="pink"
          />
          <StatCard
            label="Duels played"
            value={duels.length.toString()}
            sub="Live 1v1 only"
            tilt="tilt-r-2"
            fill="neutral"
          />
        </section>

        <section className="mt-10">
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-center gap-1 rounded-full border-[3px] border-[var(--charcoal)] bg-[var(--off-white-2)] p-1 shadow-[4px_4px_0_0_var(--charcoal)]">
              <TabButton active={tab === "solo"} onClick={() => setTab("solo")}>Solo</TabButton>
              <TabButton active={tab === "duels"} onClick={() => setTab("duels")}>Duels</TabButton>
            </div>
            {hydrated && (solo.length > 0 || duels.length > 0) && (
              <Button variant="ghost" size="sm" onClick={clearAll} iconLeft={<Trash size={14} />}>
                Clear
              </Button>
            )}
          </div>

          <div
            className="mt-5 overflow-hidden rounded-3xl border-[4px] border-[var(--charcoal)] bg-[var(--off-white-2)] shadow-[6px_6px_0_0_var(--charcoal)]"
          >
            {tab === "solo" ? <SoloTable entries={solo} /> : <DuelTable entries={duels} />}
          </div>
        </section>

        {hydrated && solo.length === 0 && duels.length === 0 && (
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-[3px] border-[var(--charcoal)] bg-[var(--off-white-2)] shadow-[4px_4px_0_0_var(--charcoal)]">
              <HistoryIcon size={28} />
            </div>
            <h2 className="font-display text-2xl font-bold text-[var(--charcoal)]">No games yet</h2>
            <p className="max-w-sm text-sm text-[var(--on-surface-variant)]">
              Your solo scans and live duels will appear here once you start playing.
            </p>
            <Link href="/">
              <Button iconLeft={<HistoryIcon size={16} />}>Back to home</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tilt,
  fill,
}: {
  label: string;
  value: string;
  sub: string;
  tilt: "tilt-l-1" | "tilt-l-2" | "tilt-r-1" | "tilt-r-2";
  fill: "yellow" | "purple" | "pink" | "neutral";
}) {
  const fillClass =
    fill === "yellow"
      ? "bg-[var(--yellow)]"
      : fill === "purple"
        ? "bg-[var(--purple)] text-[var(--off-white)]"
        : fill === "pink"
          ? "bg-[var(--pink)]"
          : "bg-[var(--off-white-2)]";
  const valueColor =
    fill === "purple" ? "text-[var(--off-white)]" : "text-[var(--charcoal)]";
  const subColor =
    fill === "purple" ? "text-[var(--ink-inverse)]/80" : "text-[var(--on-surface-variant)]";
  return (
    <div
      className={cn(
        "rounded-2xl border-[3px] border-[var(--charcoal)] p-5",
        "shadow-[6px_6px_0_0_var(--charcoal)]",
        tilt,
        fillClass,
      )}
    >
      <span className="eyebrow text-[var(--ink-muted)]">{label}</span>
      <div className={cn("mt-2 font-display text-3xl font-bold tracking-tight", valueColor)}>
        {value}
      </div>
      <span className={cn("mt-1 block text-xs", subColor)}>{sub}</span>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
        active
          ? "bg-[var(--charcoal)] text-[var(--off-white)]"
          : "text-[var(--charcoal)] hover:bg-[var(--off-white)]",
      )}
    >
      {children}
    </button>
  );
}

function SoloTable({ entries }: { entries: SoloEntry[] }) {
  if (entries.length === 0) {
    return <div className="px-6 py-12 text-center text-sm text-[var(--on-surface-variant)]">No solo attempts yet.</div>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-[0.14em] text-[var(--on-surface-variant)]">
          <th className="px-5 py-3 font-bold">Emoji</th>
          <th className="px-5 py-3 font-bold">Score</th>
          <th className="px-5 py-3 font-bold">Verdict</th>
          <th className="px-5 py-3 text-right font-bold">When</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.ts} className="border-t-[2px] border-[var(--ink-line)]">
            <td className="px-5 py-3 font-display text-2xl">{entry.emoji}</td>
            <td className="px-5 py-3">
              <span
                className={cn(
                  "font-mono tabular font-bold",
                  entry.score >= 8
                    ? "text-[var(--purple-deep)]"
                    : entry.score >= 5
                      ? "text-[var(--charcoal)]"
                      : "text-[var(--pink-deep)]",
                )}
              >
                {entry.score.toFixed(1)}
              </span>
            </td>
            <td className="px-5 py-3 text-[var(--on-surface-variant)]">{verdictFor(entry.score)}</td>
            <td className="px-5 py-3 text-right text-xs text-[var(--on-surface-variant)]">
              {formatWhen(entry.ts)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DuelTable({ entries }: { entries: DuelEntry[] }) {
  if (entries.length === 0) {
    return <div className="px-6 py-12 text-center text-sm text-[var(--on-surface-variant)]">No duels yet.</div>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-[0.14em] text-[var(--on-surface-variant)]">
          <th className="px-5 py-3 font-bold">Result</th>
          <th className="px-5 py-3 font-bold">You</th>
          <th className="px-5 py-3 font-bold">Rival</th>
          <th className="px-5 py-3 font-bold">Tier</th>
          <th className="px-5 py-3 text-right font-bold">When</th>
        </tr>
      </thead>
      <tbody>
        {duelsToRows(entries).map((d) => (
          <tr key={d.id} className="border-t-[2px] border-[var(--ink-line)]">
            <td className="px-5 py-3">
              <Pill tone={d.winner === "you" ? "purple" : d.winner === "rival" ? "pink" : "yellow"}>
                {d.winner === "you" ? "Won" : d.winner === "rival" ? "Lost" : "Tied"}
              </Pill>
            </td>
            <td className="px-5 py-3 font-mono tabular font-bold text-[var(--charcoal)]">
              {d.myScore.toFixed(1)}
            </td>
            <td className="px-5 py-3 font-mono tabular text-[var(--on-surface-variant)]">
              {d.rivalScore.toFixed(1)}
            </td>
            <td className="px-5 py-3 text-[var(--on-surface-variant)]">
              {d.myTier} {d.myElo} ELO
              {d.myDelta !== null && (
                <span className="ml-1 font-mono tabular">
                  {d.myDelta >= 0 ? "+" : ""}
                  {d.myDelta}
                </span>
              )}
            </td>
            <td className="px-5 py-3 text-right text-xs text-[var(--on-surface-variant)]">
              {formatWhen(d.ts)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function duelsToRows(entries: DuelEntry[]) {
  return entries;
}

function isSolo(entry: unknown): entry is SoloEntry {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  return (
    typeof e.emoji === "string" &&
    typeof e.score === "number" &&
    typeof e.ts === "number"
  );
}

function isDuel(entry: unknown): entry is DuelEntry {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.ts === "number" &&
    typeof e.myScore === "number" &&
    typeof e.rivalScore === "number" &&
    (e.winner === "you" || e.winner === "rival" || e.winner === "tie") &&
    (e.mySeat === "a" || e.mySeat === "b")
  );
}

function verdictFor(score: number) {
  if (score >= 8.5) return "Ate that";
  if (score >= 7) return "Face card valid";
  if (score >= 5) return "Kinda cooked";
  return "Try again";
}

function formatWhen(ts: number) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}
