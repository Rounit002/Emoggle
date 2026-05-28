"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";

interface AuthModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (element: HTMLElement, config: Record<string, unknown>) => void;
        };
      };
    };
  }
}

type AuthMode = "login" | "register";

export default function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const { login, register, googleLogin } = useAuth();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const googleBtnRef = useRef<HTMLDivElement>(null);
  const googleCallbackRef = useRef<((idToken: string) => Promise<void>) | null>(null);

  googleCallbackRef.current = async (idToken: string) => {
    setIsSubmitting(true);
    setError("");
    try {
      await googleLogin(idToken);
      onSuccess?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || !googleBtnRef.current) return;

    const mount = () => {
      if (!window.google?.accounts?.id || !googleBtnRef.current) return false;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: { credential: string }) => {
          googleCallbackRef.current?.(response.credential);
        },
      });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: "filled_black",
        size: "large",
        shape: "pill",
        text: "signin_with",
        width: googleBtnRef.current.offsetWidth || 380,
      });
      return true;
    };

    if (!mount()) {
      const gsiScript = document.querySelector<HTMLScriptElement>(
        'script[src*="accounts.google.com/gsi"]'
      );
      if (gsiScript) {
        gsiScript.addEventListener("load", mount);
        return () => gsiScript.removeEventListener("load", mount);
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      if (mode === "login") {
        await login(email.trim().toLowerCase(), password);
      } else {
        await register({ email: email.trim().toLowerCase(), password, username: username.trim() });
      }
      onSuccess?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError("");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 px-4 backdrop-blur-md"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 22, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.97 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className="w-full max-w-md rounded-2xl border border-zinc-700/60 bg-zinc-950 p-6 shadow-[0_0_80px_rgba(124,58,237,0.2)]"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-violet-400">
              {mode === "login" ? "Welcome back" : "Create account"}
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-white">
              {mode === "login" ? "Sign in to Emoggle" : "Join the Arena"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-xs font-bold text-zinc-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Google button slot */}
        <div ref={googleBtnRef} className="w-full min-h-[44px] mb-4 flex items-center justify-center" />

        {/* Divider */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-zinc-800" />
          <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">or</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>

        {/* Email / Password form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {mode === "register" && (
              <motion.input
                key="username"
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: "auto", marginBottom: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={24}
                required
                autoComplete="username"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-violet-500 focus:outline-none transition-colors"
              />
            )}
          </AnimatePresence>

          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-violet-500 focus:outline-none transition-colors"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-violet-500 focus:outline-none transition-colors"
          />

          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border border-red-400/40 bg-red-950/70 px-3 py-2.5 text-xs font-bold text-red-200"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-1 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black uppercase tracking-[0.1em] text-sm transition-colors shadow-lg shadow-violet-900/30"
          >
            {isSubmitting
              ? "Please wait..."
              : mode === "login"
                ? "Sign In"
                : "Create Account"}
          </motion.button>
        </form>

        {/* Mode toggle */}
        <p className="mt-5 text-center text-xs text-zinc-500">
          {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => switchMode(mode === "login" ? "register" : "login")}
            className="font-bold text-violet-400 hover:text-violet-300 transition-colors"
          >
            {mode === "login" ? "Sign up" : "Sign in"}
          </button>
        </p>

        <p className="mt-3 text-center text-[10px] text-zinc-600 leading-relaxed">
          By continuing you agree to fair play and emoji expression rules.
        </p>
      </motion.div>
    </motion.div>
  );
}
