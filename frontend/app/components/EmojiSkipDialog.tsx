"use client";
import { useEffect, useRef, useState } from "react";
import type { SkipProposal } from "../hooks/useMatchmaking";
export function EmojiSkipDialog({ proposal, respond }: {
    proposal: SkipProposal | null;
    respond: (agree: boolean) => void;
}) {
    const dialog = useRef<HTMLDivElement>(null);
    const [now, setNow] = useState(() => Date.now());
    const [votedFor, setVotedFor] = useState<string | null>(null);
    const proposalId = proposal?.proposalId;
    useEffect(() => {
        if (!proposalId)
            return;
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
        const timer = setInterval(() => setNow(Date.now()), 200);
        const keys = (e: KeyboardEvent) => {
            if (e.key === "Escape")
                respond(false);
            if (e.key !== "Tab")
                return;
            const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
            if (!buttons?.length)
                return;
            const first = buttons[0], last = buttons[buttons.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
            else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener("keydown", keys);
        return () => { clearInterval(timer); document.removeEventListener("keydown", keys); document.body.style.overflow = overflow; previous?.focus(); };
    }, [proposalId, respond]);
    if (!proposal)
        return null;
    const voted = votedFor === proposal.proposalId;
    return <div className="fixed inset-0 z-[105] grid place-items-center bg-black/60 p-4"><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="skip-title" className="w-full max-w-sm rounded-3xl border-4 border-[var(--charcoal)] bg-[var(--off-white-2)] p-6 text-[var(--charcoal)]">
    <h2 id="skip-title" className="text-2xl font-bold">Skip this emoji?</h2>
    <p className="my-3">The timer is paused. Both players must agree. A new emoji starts a fresh round.</p>
    <p role="status">{voted ? "Agreed. Waiting for your friend…" : `${Math.max(0, Math.ceil((proposal.expiresAt - now) / 1000))} seconds to decide`}</p>
    <button type="button" disabled={voted} onClick={() => { setVotedFor(proposal.proposalId); respond(true); }} className="mt-4 min-h-11 rounded-full bg-[var(--purple)] px-5 font-bold disabled:opacity-50">Agree to skip</button>
    <button type="button" onClick={() => respond(false)} className="ml-2 min-h-11 px-3 font-bold">Keep emoji</button>
  </div></div>;
}
