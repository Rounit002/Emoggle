"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import MyProfileCard from "./MyProfileCard";
import { useUserProfile } from "../context/UserProfileContext";
import { useAuth } from "../context/AuthContext";
import AuthModal from "./AuthModal";
import type { MatchSeeking } from "../context/UserProfileContext";
// Auth removed — rely on local profile only

interface ModeSelectProps {
  onSelect: (mode: "camera" | "solo", seeking?: MatchSeeking) => void;
}

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL ?? "http://localhost:3001";

export default function ModeSelect({ onSelect }: ModeSelectProps) {
  const { user } = useAuth();
  const [showModes, setShowModes] = useState(false);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [showPreferenceModal, setShowPreferenceModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<null | { type: "duel" | "solo" }>(null);
  const [preferenceError, setPreferenceError] = useState("");
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const { profile, saveProfile } = useUserProfile();
  // ── Device VIP persistence (local)
  const DEVICE_ID_KEY = "emoggle:device-id";
  const VIP_RECEIPT_KEY = "emoggle:vip-receipt";
  const [isDeviceVIP, setIsDeviceVIP] = useState(false);
  const [hasLocalVipReceipt, setHasLocalVipReceipt] = useState(false);

  function getOrCreateDeviceId(): string {
    try {
      const existing = window.localStorage.getItem(DEVICE_ID_KEY);
      let id: string | null = existing;
      if (!existing) {
        const rnd = (typeof crypto !== "undefined" && (crypto as any).randomUUID)
          ? (crypto as any).randomUUID()
          : `${Math.random().toString(36).slice(2)}-${Date.now()}`;
        id = rnd;
        window.localStorage.setItem(DEVICE_ID_KEY, id as string);
      }
      return id as string;
    } catch {
      return `${Math.random().toString(36).slice(2)}-${Date.now()}`;
    }
  }

  function getVipReceipt(): { deviceId?: string; ts?: number; provider?: string } | null {
    try {
      const raw = window.localStorage.getItem(VIP_RECEIPT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function markDeviceVip(provider: string = "razorpay") {
    const deviceId = getOrCreateDeviceId();
    try {
      const payload = JSON.stringify({ deviceId, ts: Date.now(), provider });
      const v1 = `v1:${btoa(payload)}`;
      window.localStorage.setItem(VIP_RECEIPT_KEY, v1);
      setHasLocalVipReceipt(true);
      setIsDeviceVIP(true);
    } catch {
      // ignore storage errors
    }
    if (profile) saveProfile({ ...profile, isVIP: true });
  }

  function restoreVipFromReceipt() {
    const rec = getVipReceipt();
    const deviceId = getOrCreateDeviceId();
    if (rec && rec.deviceId === deviceId) {
      setIsDeviceVIP(true);
      if (profile) saveProfile({ ...profile, isVIP: true });
    }
  }

  useEffect(() => {
    let cancelled = false;
    const fetchCount = async () => {
      try {
        const res = await fetch(`${SIGNALING_URL}/online`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.count === "number") {
          setOnlineCount(data.count);
        }
      } catch {
        /* ignore — server may be offline */
      }
    };
    fetchCount();
    const interval = setInterval(fetchCount, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Read VIP receipt on mount
  useEffect(() => {
    const rec = getVipReceipt();
    const deviceId = getOrCreateDeviceId();
    const match = !!rec && rec.deviceId === deviceId;
    setIsDeviceVIP(match);
    setHasLocalVipReceipt(!!rec);
  }, []);

  const loadRazorpayScript = () =>
    new Promise<boolean>((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

  const startPremiumCheckout = async (selectedSeeking: MatchSeeking) => {
    const checkoutUsername = profile?.username;
    if (!checkoutUsername) return;
    setPreferenceError("");
    setIsCheckingOut(true);
    try {
      const ready = await loadRazorpayScript();
      if (!ready || !window.Razorpay) throw new Error("Razorpay checkout could not load.");

      const res = await fetch(`${SIGNALING_URL}/api/premium/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: checkoutUsername }),
      });
      const order = await res.json();
      if (!res.ok) throw new Error(order.detail ?? "Could not create premium order.");

      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Emoggle VIP",
        description: "Unlimited gender filters",
        order_id: order.orderId,
        prefill: { name: checkoutUsername },
        theme: { color: "#facc15" },
        handler: async (response: RazorpayResponse) => {
          try {
            const verifyRes = await fetch(`${SIGNALING_URL}/api/premium/verify`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...response, username: checkoutUsername }),
            });
            const data = await verifyRes.json();
            if (!verifyRes.ok || !data.isVIP) throw new Error(data.detail ?? "Payment verification failed.");
            // Mark VIP locally for this device and persist profile flag
            markDeviceVip("razorpay");
            if (profile) saveProfile({ ...profile, isVIP: true, freeGenderMatchesLeft: data.freeGenderMatchesLeft ?? profile.freeGenderMatchesLeft });
            setShowPreferenceModal(false);
            onSelect("camera", selectedSeeking);
          } catch (verifyError) {
            setPreferenceError(verifyError instanceof Error ? verifyError.message : "Payment verification failed.");
          }
        },
      });
      checkout.open();
    } catch (checkoutError) {
      setPreferenceError(checkoutError instanceof Error ? checkoutError.message : "Checkout failed.");
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handlePreference = (selectedSeeking: MatchSeeking) => {
    setPreferenceError("");
    const effectiveIsVIP = profile?.isVIP ?? false;
    const effectiveFreeLeft = profile?.freeGenderMatchesLeft ?? 0;

    if (selectedSeeking === "Anyone") {
      setShowPreferenceModal(false);
      onSelect("camera", "Anyone");
      return;
    }

    if (effectiveIsVIP) {
      setShowPreferenceModal(false);
      onSelect("camera", selectedSeeking);
      return;
    }

    startPremiumCheckout(selectedSeeking);
  };

  return (
    <div className="relative w-screen min-h-screen bg-[#0b0c14] flex flex-col items-center overflow-x-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[320px] bg-violet-700/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-indigo-900/20 rounded-full blur-[80px] pointer-events-none" />
      <MyProfileCard profile={profile} className="absolute right-4 top-4 z-20 hidden sm:block" />

      <div className="w-full max-w-sm sm:max-w-md lg:max-w-lg px-5 sm:px-8 py-8 sm:py-12 lg:py-16 flex flex-col items-center gap-4 sm:gap-5 z-10">

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="text-center"
        >
          <h1 className="text-[3rem] sm:text-[4.5rem] lg:text-[6rem] font-black tracking-[-0.03em] text-white uppercase leading-none">
            Emoggle
          </h1>
        </motion.div>

        {/* Privacy notice */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="text-center text-xs sm:text-sm text-zinc-400 leading-snug max-w-[260px] sm:max-w-sm"
        >
          <span className="text-yellow-400 mr-1">⚠</span>
          Emoggle does not sell, store, or use your face to train AI models.
        </motion.div>

        {/* Online badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25, duration: 0.4 }}
          className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-zinc-900 border border-zinc-700"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          {onlineCount !== null ? (
            <span className="text-xs font-bold text-zinc-200 uppercase tracking-widest">
              ~{onlineCount < 10 ? onlineCount : Math.round(onlineCount / 5) * 5} Online Now
            </span>
          ) : (
            <span className="text-xs font-bold text-zinc-200 uppercase tracking-widest">Online Now</span>
          )}
        </motion.div>

        {/* Device VIP badge + restore */}
        <div className="mt-2 flex items-center gap-2">
          {(isDeviceVIP || profile?.isVIP) && (
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-300">
              VIP active on this device
            </span>
          )}
          {!profile?.isVIP && hasLocalVipReceipt && (
            <button
              onClick={restoreVipFromReceipt}
              className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300 hover:text-cyan-200 border border-cyan-300/30 rounded-full px-2 py-0.5"
            >
              Restore VIP on this device
            </button>
          )}
          {(isDeviceVIP || hasLocalVipReceipt) && (
            <button
              onClick={() => {
                try { window.localStorage.removeItem(VIP_RECEIPT_KEY); } catch {}
                setIsDeviceVIP(false);
                setHasLocalVipReceipt(false);
              }}
              className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 rounded-full px-2 py-0.5"
            >
              Clear device VIP
            </button>
          )}
        </div>

        {/* Main action card */}
        <AnimatePresence mode="wait">
          {!showModes ? (
            <motion.div
              key="arena-card"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, scale: 0.96 }}
              transition={{ delay: 0.35, duration: 0.5, ease: "easeOut" }}
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/70 backdrop-blur-sm px-6 py-8 sm:py-10 flex flex-col items-center gap-4 text-center"
            >
              {/* Swords icon */}
              <div className="relative w-16 h-16 flex items-center justify-center">
                <span className="text-5xl">⚔️</span>
              </div>

              <div>
                <h2 className="text-xl sm:text-2xl font-black uppercase tracking-[0.06em] text-white">
                  Enter the Arena
                </h2>
                <button
                  onClick={() => setShowModes(true)}
                  className="mt-2 text-sm font-bold text-violet-400 hover:text-violet-300 uppercase tracking-[0.12em] transition-colors"
                >
                  Choose your mode →
                </button>
              </div>

              <p className="text-[11px] text-zinc-500 leading-relaxed max-w-[220px]">
                By entering the arena you agree to fair play and emoji expression rules.
              </p>

              <motion.button
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setShowModes(true)}
                className="w-full mt-1 py-3 sm:py-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black uppercase tracking-[0.12em] text-sm transition-colors shadow-lg shadow-violet-900/40"
              >
                Enter the Arena
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="mode-cards"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.42, ease: "easeOut" }}
              className="w-full flex flex-col gap-3 sm:gap-4"
            >
              <div className="flex items-center justify-between mb-1">
                <button
                  onClick={() => setShowModes(false)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Pick your mode</span>
              </div>

              {/* Live Duel card */}
              <motion.button
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05, duration: 0.38 }}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  if (!user) {
                    setPendingAction({ type: "duel" });
                    setShowAuthModal(true);
                    return;
                  }
                  setShowPreferenceModal(true);
                }}
                className="group relative w-full flex items-center gap-4 sm:gap-5 p-4 sm:p-5 rounded-2xl bg-zinc-900 border border-zinc-700 hover:border-yellow-400/60 text-left transition-colors overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex-none w-14 h-14 rounded-xl bg-yellow-500/15 border border-yellow-400/30 flex items-center justify-center group-hover:bg-yellow-500/25 transition-colors">
                  <svg className="w-7 h-7 text-yellow-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-2.796A.75.75 0 0121 8.374v7.252a.75.75 0 01-1.03.696L15.75 13.5M3.375 7.5h10.5A1.875 1.875 0 0115.75 9.375v5.25A1.875 1.875 0 0113.875 16.5H3.375A1.875 1.875 0 011.5 14.625v-5.25A1.875 1.875 0 013.375 7.5z" />
                  </svg>
                </div>
                <div className="flex-1 z-10">
                  <p className="text-base font-black text-white tracking-tight">Live Face Duel</p>
                  <p className="text-zinc-400 text-xs mt-0.5 leading-snug">Match the emoji vs a random stranger. Mic + cam.</p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                    <span className="text-[10px] font-bold text-yellow-300 uppercase tracking-widest">Live Match</span>
                  </div>
                </div>
                <svg className="w-4 h-4 text-zinc-600 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </motion.button>

              {/* Solo card */}
              <motion.button
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.12, duration: 0.38 }}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  if (!user) {
                    setPendingAction({ type: "solo" });
                    setShowAuthModal(true);
                    return;
                  }
                  onSelect("solo");
                }}
                className="group relative w-full flex items-center gap-4 sm:gap-5 p-4 sm:p-5 rounded-2xl bg-zinc-900 border border-zinc-700 hover:border-cyan-400/60 text-left transition-colors overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex-none w-14 h-14 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-2xl group-hover:bg-cyan-500/25 transition-colors">
                  🤳
                </div>
                <div className="flex-1 z-10">
                  <p className="text-base font-black text-white tracking-tight">Solo Emoji Scan</p>
                  <p className="text-zinc-400 text-xs mt-0.5 leading-snug">Practice the emoji face and get an instant score.</p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="text-[10px] font-bold text-cyan-300 uppercase tracking-widest">Solo Scan</span>
                  </div>
                </div>
                <svg className="w-4 h-4 text-zinc-600 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

      {/* Auth modal */}
      <AnimatePresence>
        {showAuthModal && (
          <AuthModal
            onClose={() => setShowAuthModal(false)}
            onSuccess={() => {
              const action = pendingAction;
              setPendingAction(null);
              setShowAuthModal(false);
              if (!action) return;
              if (action.type === "duel") {
                setShowPreferenceModal(true);
              } else if (action.type === "solo") {
                onSelect("solo");
              }
            }}
          />
        )}
      </AnimatePresence>

        {/* Bottom feature links (always visible on landing) */}
        <AnimatePresence>
          {!showModes && (
            <motion.div
              key="bottom-links"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ delay: 0.55, duration: 0.45 }}
              className="w-full flex flex-col gap-3 mt-1 sm:grid sm:grid-cols-2"
            >
              <div className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 cursor-default">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/15 flex items-center justify-center text-lg flex-none">🏆</div>
                <div className="flex-1">
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-zinc-200">Leaderboard</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">See top players and rankings.</p>
                </div>
                <svg className="w-4 h-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>

              <div className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-indigo-950/50 border border-indigo-800/40 cursor-default">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-lg flex-none">💬</div>
                <div className="flex-1">
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-zinc-200">Join Discord</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Chat, events &amp; updates.</p>
                </div>
                <svg className="w-4 h-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          className="text-[10px] text-zinc-600 uppercase tracking-widest text-center mt-2 pb-6"
        >
          Fair play · Expression only · No ID verification
        </motion.p>
      </div>
      <AnimatePresence>
        {showPreferenceModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              className="w-full max-w-md rounded-2xl border border-yellow-300/25 bg-zinc-950 p-5 text-white shadow-[0_0_60px_rgba(250,204,21,0.16)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-yellow-300">Match Preference</p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight">Who do you want to match?</h2>
                </div>
                <button
                  onClick={() => setShowPreferenceModal(false)}
                  className="rounded-full border border-white/15 bg-black/50 px-3 py-1 text-xs font-black text-zinc-300 hover:text-white"
                >
                  Close
                </button>
              </div>

              <div className="mt-5 grid gap-3">
                {(["Male", "Female", "Anyone"] as MatchSeeking[]).map((option) => {
                  const isGenderFilter = option !== "Anyone";
                  const effectiveIsVIP = profile?.isVIP ?? false;
                  const effectiveFreeLeft = profile?.freeGenderMatchesLeft ?? 0;
                  const locked = isGenderFilter && !effectiveIsVIP;
                  return (
                    <button
                      key={option}
                      onClick={() => handlePreference(option)}
                      disabled={isCheckingOut}
                      className={`rounded-2xl border px-5 py-4 text-left transition-colors ${
                        option === "Anyone"
                          ? "border-cyan-300/35 bg-cyan-950/30 hover:border-cyan-300"
                          : locked
                            ? "border-yellow-300/35 bg-yellow-950/20 hover:border-yellow-300"
                            : "border-emerald-300/30 bg-emerald-950/25 hover:border-emerald-300"
                      }`}
                    >
                      <span className="block text-lg font-black uppercase tracking-[0.12em]">{option}</span>
                      <span className="mt-1 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-400">
                        {option === "Anyone"
                          ? "Always free"
                          : effectiveIsVIP
                            ? "VIP unlimited"
                            : "Unlock unlimited filters"}
                      </span>
                    </button>
                  );
                })}
              </div>

              {preferenceError && (
                <p className="mt-4 rounded-xl border border-red-400/40 bg-red-950/70 px-3 py-2 text-sm font-bold text-red-100">
                  {preferenceError}
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auth modal removed */}
    </div>
  );
}
