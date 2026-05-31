"use client";

import { useState } from "react";
import ModeSelect from "./components/ModeSelect";
import DuelArena from "./components/DuelArena";
import SoloFaceJudge from "./components/SoloFaceJudge";
import OnboardingModal from "./components/OnboardingModal";
import { UserProfileProvider, useUserProfile } from "./context/UserProfileContext";
import { MediaPipeFaceProvider } from "./context/MediaPipeFaceContext";
import type { MatchSeeking } from "./context/UserProfileContext";

type View = "home" | "arena" | "solo";

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
  return (
    <>
      <ModeSelect
        onSelect={(mode, seeking = "Anyone") => {
          if (mode === "camera") setArenaSeeking(seeking);
          setView(mode === "camera" ? "arena" : "solo");
        }}
      />
      {hasLoadedProfile && !profile && <OnboardingModal onSubmit={saveProfile} />}
    </>
  );
}
