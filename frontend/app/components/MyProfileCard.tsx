"use client";

import { useEffect, useState } from "react";
import { UserProfile, useUserProfile } from "../context/UserProfileContext";

interface MyProfileCardProps {
  profile: UserProfile | null;
  elo?: number;
  className?: string;
}

const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL ?? "http://localhost:3001";

function calculateAge(dateOfBirth: string) {
  const dob = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

export default function MyProfileCard({ profile, elo = 400, className = "" }: MyProfileCardProps) {
  const { saveProfile } = useUserProfile();
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState(profile?.username ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(profile?.dateOfBirth ?? "");
  const [error, setError] = useState("");

  useEffect(() => {
    setUsername(profile?.username ?? "");
    setDateOfBirth(profile?.dateOfBirth ?? "");
  }, [profile?.dateOfBirth, profile?.username]);

  useEffect(() => {
    if (!profile?.isVerified || profile.isVIP) return;
    let cancelled = false;
    const syncVip = async () => {
      try {
        const userId = (profile as { userId?: string }).userId ?? "";
        const statusUrl = `${SIGNALING_URL}/api/premium/status?username=${encodeURIComponent(profile.username)}${userId ? `&userId=${encodeURIComponent(userId)}` : ""}`;
        const res = await fetch(statusUrl, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          saveProfile({
            ...profile,
            isVIP: data.isVIP === true,
            freeGenderMatchesLeft:
              typeof data.freeGenderMatchesLeft === "number"
                ? data.freeGenderMatchesLeft
                : profile.freeGenderMatchesLeft,
          });
        }
      } catch {
        /* backend may be offline */
      }
    };
    syncVip();
    const interval = window.setInterval(syncVip, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [profile, saveProfile]);

  if (!profile?.isVerified) return null;

  const handleSave = () => {
    const trimmed = username.trim();
    const age = calculateAge(dateOfBirth);
    if (trimmed.length < 2) {
      setError("Username must be at least 2 characters.");
      return;
    }
    if (age === null || age < 18) {
      setError("Date of birth must keep the verified profile 18+.");
      return;
    }
    saveProfile({
      ...profile,
      username: trimmed.slice(0, 24),
      dateOfBirth,
      age,
    });
    setError("");
    setIsEditing(false);
  };

  return (
    <div
      className={`rounded-2xl border border-cyan-300/25 bg-zinc-950/85 px-4 py-3 text-white shadow-[0_0_30px_rgba(34,211,238,0.16)] backdrop-blur-md ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[9px] font-black uppercase tracking-[0.22em] text-cyan-300">My Profile</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (isEditing) handleSave();
              else setIsEditing(true);
            }}
            className="rounded-full border border-white/15 bg-black/50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-200 transition-colors hover:border-cyan-300 hover:text-cyan-200"
          >
            {isEditing ? "Save" : "Edit"}
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        {isEditing ? (
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            maxLength={24}
            className="min-w-0 flex-1 rounded-lg border border-cyan-300/45 bg-black px-2 py-1 text-sm font-black text-white outline-none"
          />
        ) : (
          <span className="max-w-36 truncate text-sm font-black uppercase tracking-[0.08em]">{profile.username}</span>
        )}
        <span className="rounded-full border border-emerald-300/35 bg-emerald-950/70 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-200">
          Verified
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400">
        <label>
          Age
          {isEditing ? (
            <input
              type="date"
              value={dateOfBirth}
              onChange={(event) => setDateOfBirth(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-cyan-300/45 bg-black px-2 py-1 text-xs font-bold text-white outline-none"
            />
          ) : (
            <strong className="block text-sm text-white">{profile.age}</strong>
          )}
        </label>
        <span>
          Elo <strong className="block text-sm text-cyan-200">{elo}</strong>
        </span>
        <span className="col-span-2">
          Verified Gender <strong className="block text-sm text-zinc-200">{profile.verifiedGender}</strong>
        </span>
        <span className="col-span-2">
          Gender Filters{" "}
          <strong className="block text-sm text-zinc-200">
            {profile.isVIP ? "Unlimited" : "Requires VIP"}
          </strong>
        </span>
      </div>

      {profile.isVIP && (
        <div className="mt-3 rounded-xl border border-yellow-300/50 bg-yellow-400/15 px-3 py-2 text-center text-xs font-black uppercase tracking-[0.18em] text-yellow-200 shadow-[0_0_22px_rgba(250,204,21,0.22)]">
          VIP Member
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-lg border border-red-400/40 bg-red-950/70 px-2 py-1.5 text-xs font-bold text-red-100">
          {error}
        </p>
      )}
    </div>
  );
}
