"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "../context/AuthContext";

function ProfileInner() {
  const { user, isLoading, refreshUser, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0b0c14] text-white flex items-center justify-center">
        <p className="text-sm text-zinc-400">Loading profile…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0b0c14] text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 mb-4">You are not logged in.</p>
          <button
            onClick={() => router.push("/")}
            className="rounded-xl border border-violet-500/50 bg-violet-600/20 px-4 py-2 text-sm font-bold text-violet-200 hover:bg-violet-600/30 transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  const fmt = (d?: string) => (d ? new Date(d).toLocaleString() : "-");

  return (
    <div className="min-h-screen bg-[#0b0c14] text-white">
      <div className="mx-auto max-w-2xl px-5 py-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tight">My Profile</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/")}
              className="rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:text-white"
            >
              Home
            </button>
            <button
              onClick={logout}
              className="rounded-full border border-red-400/40 bg-red-700/30 px-3 py-1.5 text-xs font-bold text-red-200 hover:bg-red-700/40"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-700 bg-zinc-950 p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-zinc-400 uppercase text-[10px] font-black tracking-[0.14em]">Username</div>
              <div className="mt-1 text-white font-bold">{user.username}</div>
            </div>
            <div>
              <div className="text-zinc-400 uppercase text-[10px] font-black tracking-[0.14em]">Email</div>
              <div className="mt-1 text-white font-bold">{user.email ?? "-"}</div>
            </div>
            <div>
              <div className="text-zinc-400 uppercase text-[10px] font-black tracking-[0.14em]">Provider</div>
              <div className="mt-1 text-white font-bold">{user.authProvider}</div>
            </div>
            <div>
              <div className="text-zinc-400 uppercase text-[10px] font-black tracking-[0.14em]">VIP</div>
              <div className="mt-1 font-bold {user.isVIP ? 'text-yellow-300' : 'text-zinc-200'}">{user.isVIP ? 'Yes' : 'No'}</div>
            </div>
            <div>
              <div className="text-zinc-400 uppercase text-[10px] font-black tracking-[0.14em]">ELO</div>
              <div className="mt-1 text-cyan-200 font-bold">{user.elo}</div>
            </div>
            <div>
              <div className="text-zinc-400 uppercase text-[10px] font-black tracking-[0.14em]">Created</div>
              <div className="mt-1 text-white font-bold">{fmt(user.createdAt)}</div>
            </div>
            <div>
              <div className="text-zinc-400 uppercase text-[10px] font-black tracking-[0.14em]">Last Login</div>
              <div className="mt-1 text-white font-bold">{fmt((user as any).lastLoginAt)}</div>
            </div>
            <div>
              <div className="text-zinc-400 uppercase text-[10px] font-black tracking-[0.14em]">Login Count</div>
              <div className="mt-1 text-white font-bold">{(user as any).loginCount ?? 0}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  // Wrap this page with AuthProvider to ensure useAuth is available on /profile
  return (
    <AuthProvider>
      <ProfileInner />
    </AuthProvider>
  );
}
