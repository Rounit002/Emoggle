"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { SUPPORT_KEY, SUPPORT_COOLDOWN_MS, parseSupportRecord, completeSupportRound, type SupportRecord } from "../lib/supportPrompt";
const SupportModal = dynamic(() => import("../components/SupportModal").then(m => m.SupportModal));
interface Controls {
    open: boolean;
    show: () => void;
    close: () => void;
    completeRound: (id: string) => void;
    boundary: (safe: boolean) => void;
}
const Context = createContext<Controls | null>(null);
export function SupportPromptProvider({ children, privateGame = false }: {
    children: ReactNode;
    privateGame?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [revision, setRevision] = useState(0);
    const record = useRef<SupportRecord>(parseSupportRecord(null));
    const eligible = useRef(false), safe = useRef(false), alive = useRef(true);
    const channel = useRef<BroadcastChannel | null>(null);
    const read = useCallback(() => { try {
        record.current = parseSupportRecord(localStorage.getItem(SUPPORT_KEY));
    }
    catch { /* per-tab fallback */ } return record.current; }, []);
    const write = useCallback((next: SupportRecord) => { record.current = next; try {
        localStorage.setItem(SUPPORT_KEY, JSON.stringify(next));
    }
    catch { /* per-tab fallback */ } channel.current?.postMessage(next); }, []);
    useEffect(() => {
        alive.current = true;
        read();
        try {
            channel.current = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(SUPPORT_KEY);
        }
        catch {
            channel.current = null;
        }
        if (channel.current)
            channel.current.onmessage = () => { read(); setRevision(v => v + 1); };
        const sync = () => { read(); setRevision(v => v + 1); };
        window.addEventListener("storage", sync);
        document.addEventListener("visibilitychange", sync);
        return () => { alive.current = false; channel.current?.close(); window.removeEventListener("storage", sync); document.removeEventListener("visibilitychange", sync); };
    }, [read]);
    const completeRound = useCallback((id: string) => {
        const result = completeSupportRound(read(), id);
        write(result.record);
        eligible.current = eligible.current || result.eligible;
        setRevision(v => v + 1);
    }, [read, write]);
    const boundary = useCallback((value: boolean) => { safe.current = value; setRevision(v => v + 1); }, []);
    const close = useCallback(() => setOpen(false), []);
    const show = useCallback(() => { write({ ...read(), lastShown: Date.now() }); eligible.current = false; setOpen(true); }, [read, write]);
    useEffect(() => {
        if (process.env.NEXT_PUBLIC_FEATURE_AUTO_SUPPORT === "false" || open || !eligible.current || !safe.current)
            return;
        const timer = setTimeout(() => {
            const display = () => {
                if (!alive.current || !safe.current || !eligible.current || document.hidden || document.querySelector('[aria-modal="true"]:not([data-round-result])'))
                    return;
                const current = read();
                if (current.lastShown && Date.now() - current.lastShown < SUPPORT_COOLDOWN_MS) {
                    eligible.current = false;
                    return;
                }
                show();
            };
            if (navigator.locks)
                void navigator.locks.request(SUPPORT_KEY, display).catch(display);
            else
                display();
        }, 650);
        return () => clearTimeout(timer);
    }, [open, revision, read, show]);
    const value = useMemo(() => ({ open, show, close, completeRound, boundary }), [open, show, close, completeRound, boundary]);
    return <Context.Provider value={value}>{children}{open && <SupportModal open onClose={close} preserveGame={privateGame}/>}</Context.Provider>;
}
export function useSupportPrompt() { const context = useContext(Context); if (!context)
    throw new Error("SupportPromptProvider is missing"); return context; }
export function useRoundSupport(id: string | null | undefined, safeResult: boolean) {
    const { completeRound, boundary } = useSupportPrompt();
    useEffect(() => { if (id)
        completeRound(id); }, [id, completeRound]);
    useEffect(() => { boundary(safeResult); return () => boundary(false); }, [boundary, safeResult]);
}
