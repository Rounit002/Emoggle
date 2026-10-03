"use client";
import { terminalSeries, type SeriesState } from "../lib/privateDuels";
import { useSupportPrompt } from "../context/SupportPromptContext";
export function SeriesPanel({ series, ready, leave, inviteLink }: {
    series: SeriesState | null;
    ready: () => void;
    leave: () => void;
    inviteLink?: string | null;
}) {
    const { open, show, boundary } = useSupportPrompt();
    if (!series)
        return <p role="status">Connecting to your 1v1…</p>;
    const ended = terminalSeries(series.state), complete = series.state === "completed";
    const faceSync = series.gameMode === "facesync";
    const preparing = ["ready", "waiting", "round_result", "suspended"].includes(series.state);
    return <section aria-label="1v1 series" className="mx-auto my-3 w-full max-w-xl rounded-2xl border-2 border-[var(--charcoal)] bg-[var(--off-white-2)] p-4 text-center text-[var(--charcoal)]">
    <p className="font-bold">Private 1v1 · Round {series.currentRound} of {series.totalRounds} · Unranked</p>
    <p className="text-xl font-bold">{faceSync ? `Face Sync with ${series.partnerName || "your friend"}` : <>You {series.myPoints} : {series.partnerPoints} {series.partnerName || "Friend"}</>}</p>
    <p role="status" className="my-2 text-sm">{complete ? (faceSync ? "Comparisons complete!" : series.myPoints === series.partnerPoints ? "Series draw!" : series.myPoints > series.partnerPoints ? "You won the series!" : "Your friend won the series!") : ended ? "This 1v1 has ended." : series.state === "playing" ? "Round in progress." : series.state === "suspended" ? "Friend disconnected. Reconnect within 30 seconds; this round will restart." : !series.partnerJoined ? "Waiting for your friend to join." : !series.partnerConnected ? "Waiting for your friend to enter the lobby." : series.myReady ? "You are ready. Waiting for your friend." : "Both players must be ready to start."}</p>
    {inviteLink && !series.partnerJoined && <input aria-label="Invitation link" readOnly value={inviteLink} onFocus={event => event.target.select()} className="mb-3 min-h-11 w-full rounded-xl border-2 p-2 text-sm"/>}
    {(complete || series.state === "round_result") && <ol className="mb-3 text-sm">{series.results.map(r => <li key={r.matchId}>{faceSync ? `Comparison ${r.roundNumber} complete` : <>Round {r.roundNumber}: you {r.myScore.toFixed(1)} · friend {r.partnerScore.toFixed(1)}</>}</li>)}</ol>}
    {!ended && preparing && <button type="button" disabled={open || series.myReady || !series.partnerConnected || series.state === "suspended"} onClick={() => { boundary(false); ready(); }} className="min-h-11 rounded-full bg-[var(--purple)] px-5 font-bold disabled:opacity-50">{series.myReady ? "Ready" : series.state === "round_result" ? "Ready for next round" : "I'm ready"}</button>}
    {(ended || preparing) && <button type="button" onClick={leave} className="ml-3 min-h-11 rounded-full border-2 px-4 font-bold">{ended ? "Back to 1v1 setup" : "Leave 1v1"}</button>}
    {(ended || preparing) && <button type="button" onClick={show} className="ml-3 min-h-11 px-2 text-sm underline">Support Emoggle</button>}
  </section>;
}
