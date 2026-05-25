"use client";

import { useState } from "react";
import ModeSelect from "./components/ModeSelect";
import DuelArena from "./components/DuelArena";
import SoloFaceJudge from "./components/SoloFaceJudge";

type Mode = "select" | "camera" | "solo";

export default function Home() {
  const [mode, setMode] = useState<Mode>("select");

  if (mode === "camera") return <DuelArena onBack={() => setMode("select")} />;
  if (mode === "solo") return <SoloFaceJudge onBack={() => setMode("select")} />;
  return <ModeSelect onSelect={(m) => setMode(m)} />;
}
