import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { SCENES } from "./timing";
import { Soundtrack } from "./Soundtrack";
import { Night } from "./scenes/Night";
import { Match } from "./scenes/Match";
import { Rounds } from "./scenes/Rounds";
import { Laugh } from "./scenes/Laugh";
import { Rematch } from "./scenes/Rematch";
import { Tagline } from "./scenes/Tagline";
import { EndCard } from "./scenes/EndCard";

const ORDER = [
  ["2 AM", SCENES.night, Night],
  ["Same face", SCENES.match, Match],
  ["3-2-1 + barrage", SCENES.rounds, Rounds],
  ["Don't laugh", SCENES.laugh, Laugh],
  ["Rematch", SCENES.rematch, Rematch],
  ["Tagline", SCENES.tagline, Tagline],
  ["End card", SCENES.end, EndCard],
] as const;

export const EmoggleSpot: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    {ORDER.map(([name, s, Scene]) => (
      <Sequence key={name} name={name} from={s.from} durationInFrames={s.dur}>
        <Scene />
      </Sequence>
    ))}
    <Soundtrack />
  </AbsoluteFill>
);
