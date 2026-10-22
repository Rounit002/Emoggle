import React from "react";
import { AbsoluteFill, interpolate, Easing, useCurrentFrame } from "remotion";
import { C, display, sticker } from "../theme";
import { Doodles, Emoji, beatPunch, usePop } from "../components";

const LINES = [
  { at: 0, text: "two strangers.", emoji: "1F440", bg: C.white, rot: -4, top: 330 },
  { at: 30, text: "one emoji.", emoji: "1F61C", bg: C.yellow, rot: 3, top: 760 },
  { at: 60, text: "zero chill.", emoji: "1F525", bg: C.purple, rot: -3, top: 1190 },
];

const Line: React.FC<(typeof LINES)[number]> = ({ at, text, emoji, bg, rot, top }) => {
  const frame = useCurrentFrame();
  const p = usePop(at, 9);
  if (frame < at) return null;
  const fromLeft = LINES.findIndex((l) => l.at === at) % 2 === 0;
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        transform: `translateX(${interpolate(p, [0, 1], [fromLeft ? -1300 : 1300, 0])}px) rotate(${rot}deg)`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 30,
          background: bg,
          border: `10px solid ${C.ink}`,
          borderRadius: 70,
          padding: "36px 60px",
          boxShadow: sticker(16),
          fontFamily: display,
          fontWeight: 700,
          fontSize: 96,
          whiteSpace: "nowrap",
          letterSpacing: -4,
          color: bg === C.purple ? C.white : C.ink,
        }}
      >
        {text}
        <Emoji code={emoji} size={120} style={{ transform: `rotate(${Math.sin((frame - at) / 4) * 12}deg)` }} />
      </div>
    </div>
  );
};

export const Tagline: React.FC = () => {
  const frame = useCurrentFrame();
  // yellow circle wipe into the end card
  const wipe = interpolate(frame, [100, 118], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  return (
    <AbsoluteFill style={{ background: C.pink, overflow: "hidden" }}>
      <Doodles opacity={0.18} seed="t" speed={1.2} />
      <AbsoluteFill style={{ transform: `scale(${beatPunch(frame, 0.03)})` }}>
        {LINES.map((l) => (
          <Line key={l.text} {...l} />
        ))}
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 540 - 1200,
          top: 960 - 1200,
          width: 2400,
          height: 2400,
          borderRadius: 1200,
          background: C.paper,
          border: `16px solid ${C.ink}`,
          transform: `scale(${wipe})`,
        }}
      />
    </AbsoluteFill>
  );
};
