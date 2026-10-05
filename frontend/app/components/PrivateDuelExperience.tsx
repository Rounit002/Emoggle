"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import ExperienceProviders from "./ExperienceProviders";
import { MediaPipeFaceProvider } from "../context/MediaPipeFaceContext";
import { usePlayerName } from "../context/PlayerNameContext";
import { useSupportPrompt } from "../context/SupportPromptContext";
import { useUserProfile } from "../context/UserProfileContext";
import { NameEntryModal } from "./NameEntryModal";
import { duelRequest, terminalSeries, type SeriesState } from "../lib/privateDuels";
import { SIGNALING_URL } from "../lib/signaling";
import { useSmoothScrollController } from "./SmoothScroll";
import styles from "./PrivateDuelExperience.module.css";
const DuelArena = dynamic(() => import("./DuelArena"));
const CelebrityDuelArena = dynamic(() => import("./CelebrityDuelArena"));
const FaceSyncArena = dynamic(() => import("./FaceSyncArena"));
const games = [
    { id: "emoji", name: "Emoji Duel", icon: "😮", description: "Match the emoji. Make your best face.", color: "#ffde59" },
    { id: "celebrity", name: "Celebrity Face", icon: "⭐", description: "Recreate the iconic celebrity expression.", color: "#ffb8bd" },
    { id: "facesync", name: "Face Sync", icon: "⚡", description: "Find out how much you and your friend look alike.", color: "#bcebd9" },
] as const;
const gameName = (id: SeriesState["gameMode"]) => games.find(game => game.id === id)?.name;
type Invitation = {
    gameMode: SeriesState["gameMode"];
    totalRounds: number;
    expiresAt: number;
};
type Created = {
    series: SeriesState;
    roomCode: string;
    inviteExpiresAt: number;
};
const button = "min-h-12 rounded-full border-2 border-[var(--charcoal)] bg-[var(--yellow)] px-6 py-2 font-bold text-[var(--charcoal)] shadow-[3px_3px_0_var(--charcoal)] disabled:opacity-50";
export default function PrivateDuelExperience() { return <ExperienceProviders privateGame><PrivateContent /></ExperienceProviders>; }
function PrivateContent() {
    const { show: support } = useSupportPrompt();
    const { name, save, isHydrated } = usePlayerName();
    const { sessionToken, isSessionReady } = useUserProfile();
    const scroll = useSmoothScrollController();
    const [available, setAvailable] = useState<boolean | null>(null);
    const [rounds, setRounds] = useState(3), [mode, setMode] = useState<SeriesState["gameMode"]>("emoji");
    const [invite, setInvite] = useState<string | null>(null), [preview, setPreview] = useState<Invitation | null>(null);
    const [series, setSeries] = useState<SeriesState | null>(null), [roomCode, setRoomCode] = useState<string | null>(null);
    const [arena, setArena] = useState(false), [nameOpen, setNameOpen] = useState(false), [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null), [copied, setCopied] = useState(false), [loaded, setLoaded] = useState(false);
    const [codeDraft, setCodeDraft] = useState("");
    const capturedInvite = useRef<string | null | undefined>(undefined);
    const pending = useRef<"create" | "join" | null>(null), mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        const fragment = new URLSearchParams(window.location.hash.slice(1));
        if (capturedInvite.current === undefined)
            capturedInvite.current = fragment.get("invite");
        // Initial URL hydration must happen after mount; the secret is then removed from the URL.
        setInvite(capturedInvite.current);
        window.history.replaceState(window.history.state, "", window.location.pathname);
        setLoaded(true);
        return () => { mounted.current = false; };
    }, []);
    useEffect(() => {
        const controller = new AbortController();
        fetch(`${SIGNALING_URL}/api/capabilities`, { cache: "no-store", signal: controller.signal })
            .then(async (response) => { if (!response.ok)
            throw new Error(); const data = await response.json(); setAvailable(data.privateDuels === true); })
            .catch(() => { if (!controller.signal.aborted)
            setAvailable(false); });
        return () => controller.abort();
    }, []);
    useEffect(() => { scroll(!arena); return () => scroll(true); }, [arena, scroll]);
    useEffect(() => {
        if (!loaded || !sessionToken)
            return;
        let cancelled = false;
        if (invite) {
            duelRequest<Invitation>(sessionToken, "/invite-preview", { code: invite }).then(data => { if (!cancelled)
                setPreview(data); }).catch(e => { if (!cancelled)
                setError(e.message); });
        }
        else {
            let id: string | null = null;
            try {
                id = sessionStorage.getItem("emoggle:private-series");
            }
            catch { /* storage optional */ }
            if (id)
                duelRequest<SeriesState>(sessionToken, `/${id}`).then(data => { if (!cancelled && !terminalSeries(data.state))
                    setSeries(data); }).catch(() => { });
        }
        return () => { cancelled = true; };
    }, [loaded, sessionToken, invite]);
    const lobbyId = series?.id, lobbyState = series?.state;
    useEffect(() => {
        if (!lobbyId || arena || !sessionToken || terminalSeries(lobbyState ?? ""))
            return;
        let cancelled = false;
        const timer = setInterval(() => { if (document.hidden) return; void duelRequest<SeriesState>(sessionToken, `/${lobbyId}`).then(data => { if (!cancelled)
            setSeries(data); }).catch(e => { if (!cancelled)
            setError(e.message); }); }, 5000);
        return () => { cancelled = true; clearInterval(timer); };
    }, [lobbyId, lobbyState, arena, sessionToken]);
    const remember = (s: SeriesState) => { setSeries(s); try {
        sessionStorage.setItem("emoggle:private-series", s.id);
    }
    catch { /* storage optional */ } };
    const formatCode = (code: string) => code.match(/.{1,4}/g)?.join("-") ?? code;
    const perform = async (action: "create" | "join") => {
        if (!sessionToken || busy)
            return;
        setBusy(true);
        setError(null);
        try {
            if (action === "create") {
                const result = await duelRequest<Created>(sessionToken, "/", { gameMode: mode, totalRounds: rounds });
                if (!mounted.current)
                    return;
                remember(result.series);
                setRoomCode(formatCode(result.roomCode));
            }
            else {
                const result = await duelRequest<SeriesState>(sessionToken, "/join", { code: invite });
                if (!mounted.current)
                    return;
                remember(result);
                setArena(true);
            }
        }
        catch (e) {
            if (mounted.current)
                setError(e instanceof Error ? e.message : "Please try again.");
        }
        finally {
            if (mounted.current)
                setBusy(false);
        }
    };
    const begin = (action: "create" | "join") => { if (!name) {
        pending.current = action;
        setNameOpen(true);
    }
    else
        void perform(action); };
    const back = useCallback(() => { setArena(false); setSeries(null); setInvite(null); setCodeDraft(""); setPreview(null); setRoomCode(null); try {
        sessionStorage.removeItem("emoggle:private-series");
    }
    catch { /* storage optional */ } }, []);
    const cancel = async () => {
        if (!sessionToken || !series)
            return;
        try {
            await duelRequest<void>(sessionToken, `/${series.id}/cancel`, {});
            back();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Could not cancel.");
        }
    };
    if (arena && series)
        return <MediaPipeFaceProvider>{series.gameMode === "emoji" ? <DuelArena privateRoomCode={roomCode} privateSeriesId={series.id} onBack={back}/> : series.gameMode === "facesync" ? <FaceSyncArena privateRoomCode={roomCode} privateSeriesId={series.id} onBack={back}/> : <CelebrityDuelArena privateRoomCode={roomCode} privateSeriesId={series.id} onBack={back}/>}</MediaPipeFaceProvider>;
    return <main className={styles.page}>
    <Link href="/" className="mb-8 w-fit rounded-full border-2 bg-[var(--off-white-2)] px-4 py-3 font-bold">← Explore Emoggle</Link>
    <section className={styles.panel}>
      <div className={styles.heading}><div><p className={styles.eyebrow}>JUST YOU + YOUR FRIEND</p><h1 className={styles.title}>Your own 1v1<span>.</span></h1>
      <p className={styles.subtitle}>Pick your rounds. Choose your game. Share the room code.</p></div><span className={styles.badge} aria-hidden="true">1 vs 1</span></div>
      {available === false && <p role="status" className="my-3 font-bold">Private 1v1 is unavailable right now. Please try again later.</p>}
      {error && <p role="alert" className="my-4 rounded-xl bg-[var(--yellow)] p-3 font-bold">{error}</p>}
      {!loaded ? <p role="status">Loading…</p> : series ? <>
        <h2 className="text-2xl font-bold">{gameName(series.gameMode)} · {series.totalRounds} {series.totalRounds === 1 ? "round" : "rounds"}</h2>
        <p className="my-3" role="status">{terminalSeries(series.state) ? "This game has ended." : series.partnerJoined ? "Your friend joined! Enter the lobby, check your cameras, and both click ready." : "Share your room code. Your friend enters it on the 1v1 page to join."}</p>
        {roomCode && !series.partnerJoined && <>
          <input aria-label="Room code" readOnly value={roomCode} className="my-3 min-h-12 w-full rounded-xl border-2 p-3"/>
          <button className={button} onClick={async () => { try {
                await navigator.clipboard.writeText(roomCode);
                setCopied(true);
            }
            catch {
                setError("Select the code above and copy it.");
            } }}>{copied ? "Copied!" : "Copy room code"}</button>
        </>}
        {series.role === "host" && !series.partnerJoined && !terminalSeries(series.state) && <button disabled={busy} className="ml-3 min-h-12 underline" onClick={async () => { if (!sessionToken)
            return; setBusy(true); try {
            const data = await duelRequest<Created>(sessionToken, `/${series.id}/invite`, {});
            setRoomCode(formatCode(data.roomCode));
            setCopied(false);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Please retry.");
        }
        finally {
            setBusy(false);
        } }}>Regenerate code</button>}
        <p className="my-3 text-sm">Codes expire after 15 minutes and admit one friend. Regenerating revokes your previous code.</p>
        {!terminalSeries(series.state) && <button className={`${button} mt-4`} onClick={() => { if (!name) {
            pending.current = null;
            setNameOpen(true);
        }
        else
            setArena(true); }}>Enter camera lobby</button>}
        {series.role === "host" && !terminalSeries(series.state) && <button className="ml-4 min-h-12 underline" onClick={() => void cancel()}>Cancel 1v1</button>}
        {terminalSeries(series.state) && <button className={button} onClick={back}>Start another 1v1</button>}
      </> : invite ? <><button className="mb-4 min-h-11 underline" onClick={() => { setInvite(null); setPreview(null); setError(null); }}>← Back to setup</button>{preview ? <>
        <h2 className="text-2xl font-bold">You’re invited!</h2><p className="my-3">{gameName(preview.gameMode)} · {preview.totalRounds} {preview.totalRounds === 1 ? "round" : "rounds"} · Private, unranked</p>
        <p className="my-3">Joining reserves your seat. Cameras open after you choose to join; both players must be ready before the timer starts.</p>
        <button className={button} disabled={!available || busy || !isHydrated || !sessionToken} onClick={() => begin("join")}>{busy ? "Joining…" : "Join 1v1"}</button>
      </> : <p role="status">{error ? "Ask your friend for a new room code." : "Checking room…"}</p>}</> : <div className={styles.setup}>
        <div className={styles.rounds}>
          <div className={styles.sectionHeading}><label htmlFor="private-rounds">01 <strong>Choose your rounds</strong></label><output htmlFor="private-rounds" className={styles.roundValue}>{rounds}<span>{rounds === 1 ? "round" : "rounds"}</span></output></div>
          <input id="private-rounds" className={styles.slider} type="range" min={1} max={5} step={2} value={rounds} aria-valuetext={`${rounds} rounds`} onChange={event => setRounds(Number(event.target.value))} style={{ background: `linear-gradient(to right, #7055e8 ${(rounds - 1) * 25}%, #ddd7f4 ${(rounds - 1) * 25}%)` }}/>
          <div className={styles.ticks} aria-hidden="true"><span>1 · Quick match</span><span>3 · A little rivalry</span><span>5 · Make it a series</span></div>
        </div>
        <fieldset className={styles.games}><legend>02 <strong>Choose your game</strong></legend><div className={styles.gameGrid}>{games.map(game => <label key={game.id} className={`${styles.game} ${mode === game.id ? styles.selected : ""}`}>
          <input type="radio" name="private-game" value={game.id} checked={mode === game.id} onChange={() => setMode(game.id)}/><span className={styles.gameIcon} style={{ background: game.color }} aria-hidden="true">{game.icon}</span><span className={styles.gameName}>{game.name}</span><span className={styles.gameDescription}>{game.description}</span><span className={styles.check} aria-hidden="true">{mode === game.id ? "✓" : ""}</span>
        </label>)}</div></fieldset>
        <div className={styles.footer}><div><p className={styles.summary}>{rounds} {rounds === 1 ? "round" : "rounds"} · {gameName(mode)}</p><p className={styles.note}>{mode === "facesync" ? "Shared resemblance results. No points, just curiosity." : mode === "celebrity" ? "IShowSpeed Squint challenge. One point per win." : "One point per win. Half a point each for a tie."}</p></div>
        <button className={styles.create} aria-label={busy ? "Creating…" : "Create room"} disabled={!available || busy || !isHydrated || !isSessionReady || !sessionToken} onClick={() => begin("create")}>{busy ? "Creating…" : "Create room"}<span aria-hidden="true">↗</span></button></div>
        <p className={styles.reassurance}>Private room · Same friend every round · No ranking changes</p>
        <form className={styles.joinRoom} onSubmit={event => {
            event.preventDefault();
            const code = codeDraft.replace(/[\s-]/g, "").toUpperCase();
            if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/.test(code)) {
                setError("Enter the 12-character room code your friend shared.");
                return;
            }
            setError(null); setPreview(null); setInvite(code);
        }}>
          <label htmlFor="join-room-code"><strong>Have a room code?</strong><span>Enter your friend’s code to see the game and join.</span></label>
          <div className={styles.joinControls}><input id="join-room-code" aria-label="Enter room code" placeholder="ABCD-EFGH-JKLM" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={32} value={codeDraft} onChange={event => setCodeDraft(event.target.value)} required/>
          <button className={button} disabled={!available || !sessionToken || busy} type="submit">Find room</button></div>
        </form>
      </div>}
    </section>
    <button type="button" onClick={support} className="mt-5 min-h-11 self-center font-bold underline">Support Emoggle</button>
    {nameOpen && <NameEntryModal open required currentName={name} onCancel={() => { pending.current = null; setNameOpen(false); }} onSubmit={value => { if (!save(value))
        return; setNameOpen(false); const action = pending.current; pending.current = null; if (action)
        void perform(action);
    else if (series)
        setArena(true); }}/>}
  </main>;
}
