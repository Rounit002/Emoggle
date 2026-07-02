"use client";

import { useState } from "react";
import ModeSelect from "./components/ModeSelect";
import DuelArena from "./components/DuelArena";
import SoloFaceJudge from "./components/SoloFaceJudge";
import CelebrityDuelArena from "./components/CelebrityDuelArena";
import OnboardingModal from "./components/OnboardingModal";
import { UserProfileProvider, useUserProfile } from "./context/UserProfileContext";
import { MediaPipeFaceProvider } from "./context/MediaPipeFaceContext";
import type { MatchSeeking } from "./context/UserProfileContext";

type View = "home" | "arena" | "solo" | "celebrity";

export default function Home() {
  return (
    <MediaPipeFaceProvider>
      <UserProfileProvider>
        <HomeContent />
      </UserProfileProvider>
    </MediaPipeFaceProvider>
  );
}

function HomeContent() {
  const [view, setView] = useState<View>("home");
  const [arenaSeeking, setArenaSeeking] = useState<MatchSeeking>("Anyone");
  const { profile, hasLoadedProfile, saveProfile } = useUserProfile();

  if (view === "arena") return <DuelArena onBack={() => setView("home")} initialSeeking={arenaSeeking} />;
  if (view === "solo") return <SoloFaceJudge onBack={() => setView("home")} />;
  if (view === "celebrity") return <CelebrityDuelArena onBack={() => setView("home")} initialSeeking={arenaSeeking} />;
  return (
    <>
      <ModeSelect
        onSelect={(mode, seeking = "Anyone") => {
          if (mode === "camera") setArenaSeeking(seeking);
          if (mode === "celebrity") setArenaSeeking(seeking);
          setView(mode === "camera" ? "arena" : mode === "solo" ? "solo" : "celebrity");
        }}
      />
      {hasLoadedProfile && !profile && <OnboardingModal onSubmit={saveProfile} />}
    </>
  );
}
