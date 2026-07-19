"use client";

import { useState } from "react";
import CelebrityDuelArena from "./CelebrityDuelArena";
import DuelArena from "./DuelArena";
import ModeSelect from "./ModeSelect";
import SoloFaceJudge from "./SoloFaceJudge";
import { MediaPipeFaceProvider } from "../context/MediaPipeFaceContext";
import { UserProfileProvider } from "../context/UserProfileContext";

type View = "home" | "arena" | "solo" | "celebrity";

export default function HomeExperience() {
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

  if (view === "arena") {
    return <DuelArena onBack={() => setView("home")} />;
  }

  if (view === "solo") {
    return <SoloFaceJudge onBack={() => setView("home")} />;
  }

  if (view === "celebrity") {
    return <CelebrityDuelArena onBack={() => setView("home")} />;
  }

  return (
    <ModeSelect
      onSelect={(mode) => {
        setView(
          mode === "camera"
            ? "arena"
            : mode === "solo"
              ? "solo"
              : "celebrity",
        );
      }}
    />
  );
}
