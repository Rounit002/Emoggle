import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, random } from "remotion";
import { C, display, sticker } from "../theme";
import { Emoji, Rays } from "../components";
import { BARRAGE, BEAT, barrageFrame } from "../timing";

const COUNT = [
  { t: "3", bg: C.purple, fg: C.white },
  { t: "2", bg: C.pink, fg: C.ink },
  { t: "1", bg: C.yellow, fg: C.ink },
  { t: "GO!", bg: C.ink, fg: C.yellow },
];

export const Rounds: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (frame < BEAT * 4) {
    const i = Math.floor(frame / BEAT);
    const c = COUNT[i];
    const local = frame - i * BEAT;
    const s = spring({ frame: local, fps, config: { damping: 10, mass: 0.5, stiffness: 220 } });
    return (
      <AbsoluteFill style={{ background: c.bg, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <Rays color={c.fg} opacity={0.08} speed={2} />
        <div
          style={{
            fontFamily: display,
            fontWeight: 700,
            fontSize: c.t.length > 1 ? 420 : 760,
            color: c.fg,
            transform: `scale(${interpolate(s, [0, 1], [2.6, 1])}) rotate(${interpolate(s, [0, 1], [i % 2 ? 20 : -20, 0])}deg)`,
            textShadow: `18px 18px 0 ${c.bg === C.ink ? C.purple : C.ink}`,
            WebkitTextStroke: c.bg === C.ink ? undefined : `10px ${C.ink}`,
          }}
        >
          {c.t}
        </div>
      </AbsoluteFill>
    );
  }

  // emoji barrage — a new face every eighth note
  let idx = 0;
  for (let i = 0; i < BARRAGE.length; i++) if (frame >= barrageFrame(i)) idx = i;
  const item = BARRAGE[idx];
  const local = frame - barrageFrame(idx);
  const s = spring({ frame: local, fps, config: { damping: 9, mass: 0.4, stiffness: 260 } });
  const rot = (random(`rot${idx}`) - 0.5) * 30;
  const dark = item.bg === C.purple;

  return (
    <AbsoluteFill style={{ background: item.bg, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <Rays color={dark ? C.white : C.ink} opacity={0.07} speed={3} />
      <div style={{ position: "absolute", top: 180, fontFamily: display, fontWeight: 700, fontSize: 54, color: dark ? C.white : C.ink, opacity: 0.8 }}>
        round {idx + 1}
      </div>
      <div style={{ transform: `scale(${interpolate(s, [0, 1], [0.2, 1])}) rotate(${rot * s}deg)`, marginTop: -120 }}>
        <Emoji code={item.code} size={700} />
      </div>
      <div
        style={{
          position: "absolute",
          top: 1360,
          fontFamily: display,
          fontWeight: 700,
          fontSize: 110,
          color: C.ink,
          background: dark ? C.yellow : C.white,
          border: `8px solid ${C.ink}`,
          borderRadius: 50,
          padding: "18px 50px",
          boxShadow: sticker(14),
          transform: `scale(${interpolate(s, [0, 1], [1.6, 1])}) rotate(${-rot * 0.3}deg)`,
          letterSpacing: -2,
        }}
      >
        {item.say}
      </div>
    </AbsoluteFill>
  );
};
