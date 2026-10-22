import React from "react";
import { Composition } from "remotion";
import { EmoggleSpot } from "./Video";
import { DURATION, FPS } from "./timing";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Emoggle207AM"
    component={EmoggleSpot}
    durationInFrames={DURATION}
    fps={FPS}
    width={1080}
    height={1920}
  />
);
