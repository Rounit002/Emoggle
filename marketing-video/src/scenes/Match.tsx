import React from "react";
import { AbsoluteFill, interpolate, Easing, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { Doodles, Emoji, Sticker, WebcamCard, beatPunch, usePop } from "../components";

export const Match: React.FC = () => {
  const frame = useCurrentFrame();
  const inA = usePop(0, 13);
  const inB = usePop(4, 13);
  const badge = usePop(15, 7, 0.6);

  // live meters wiggle up toward the final 9.4 / 9.1
  const meter = (target: number, seed: number) => {
    const base = interpolate(frame, [20, 105], [0, target], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });
    const wobble = frame < 105 ? Math.sin(frame / 3 + seed) * 0.35 * Math.min(1, frame / 40) : 0;
    return Math.max(0, Math.min(10, base + wobble));
  };

  const punch = beatPunch(frame, 0.03);
  const flashOut = interpolate(frame, [0, 6], [1, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: C.yellow, overflow: "hidden" }}>
      <Doodles opacity={0.2} seed="m" />
      <AbsoluteFill style={{ transform: `scale(${punch})` }}>
        <WebcamCard
          src="faces/violet.png"
          label="YOU · 2:07 AM"
          accent={C.purple}
          width={930}
          height={720}
          score={meter(9.4, 0)}
          objectPosition="50% 42%"
          style={{
            left: 75,
            top: 150,
            transform: `translateX(${interpolate(inA, [0, 1], [-1200, 0])}px) rotate(${interpolate(inA, [0, 1], [-14, -1.5])}deg)`,
          }}
        />
        <WebcamCard
          src="faces/pink.png"
          label="STRANGER · 5:37 PM"
          accent={C.pinkDeep}
          width={930}
          height={720}
          score={meter(9.1, 2)}
          objectPosition="50% 45%"
          style={{
            left: 75,
            top: 1060,
            transform: `translateX(${interpolate(inB, [0, 1], [1200, 0])}px) rotate(${interpolate(inB, [0, 1], [14, 1.5])}deg)`,
          }}
        />

        {/* the shared emoji, stamped between the two cams */}
        <div
          style={{
            position: "absolute",
            left: 540 - 140,
            top: 965 - 140,
            width: 280,
            height: 280,
            borderRadius: 140,
            background: C.white,
            border: `10px solid ${C.ink}`,
            boxShadow: `12px 12px 0 ${C.ink}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `scale(${interpolate(badge, [0, 1], [3, 1])}) rotate(${interpolate(badge, [0, 1], [-40, 0]) + Math.sin(frame / 5) * 4}deg)`,
            opacity: frame >= 15 ? 1 : 0,
          }}
        >
          <Emoji code="1F61C" size={220} />
        </div>

        <Sticker at={45} rotate={-6} size={96} bg={C.white} style={{ left: 60, top: 760 }}>
          same face.
        </Sticker>
        <Sticker at={75} rotate={4} size={66} bg={C.purple} color={C.white} style={{ right: 60, top: 1730 }}>
          different time zone.
        </Sticker>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: C.white, opacity: flashOut }} />
    </AbsoluteFill>
  );
};
