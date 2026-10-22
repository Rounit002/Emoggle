import React from "react";
import { AbsoluteFill, Img, interpolate, random, staticFile, useCurrentFrame } from "remotion";
import { C, display, sans, sticker } from "../theme";
import { Emoji, Rays, Sticker, beatPunch, usePop } from "../components";
import { BAR } from "../timing";

const Polaroid: React.FC<{ src: string; x: number; y: number; rot: number; frame: number; seed: number }> = ({ src, x, y, rot, frame, seed }) => {
  const shake = Math.sin(frame * 1.7 + seed) * 5;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 440,
        padding: "22px 22px 80px",
        background: C.white,
        border: `8px solid ${C.ink}`,
        borderRadius: 34,
        boxShadow: sticker(14),
        transform: `rotate(${rot + shake}deg) translateY(${Math.abs(Math.sin(frame * 0.9 + seed)) * -18}px)`,
      }}
    >
      <Img src={staticFile(src)} style={{ width: "100%", height: 460, objectFit: "cover", objectPosition: "50% 40%", borderRadius: 18, display: "block" }} />
    </div>
  );
};

export const Laugh: React.FC = () => {
  const frame = useCurrentFrame();
  const facePop = usePop(0, 12);

  // --- bar 1: dead serious
  if (frame < BAR) {
    const zoom = interpolate(frame, [0, BAR], [1, 1.1]);
    const vibrate = frame > 8 ? Math.sin(frame * 3.1) * 2 : 0;
    const face = interpolate(facePop, [0, 1], [0.6, 1]);
    return (
      <AbsoluteFill style={{ background: C.paper, alignItems: "center", justifyContent: "center" }}>
        <AbsoluteFill style={{ transform: `scale(${zoom})`, alignItems: "center", justifyContent: "center" }}>
          <div style={{ transform: `translateX(${vibrate}px) scale(${face})`, marginTop: -360 }}>
            <Emoji code="1F610" size={420} />
          </div>
          <div style={{ position: "absolute", top: 1050, fontFamily: sans, fontWeight: 800, fontSize: 62, color: C.pinkDeep, letterSpacing: 6, opacity: frame >= 4 ? 1 : 0 }}>
            RULE #1:
          </div>
          <div
            style={{
              position: "absolute",
              top: 1140,
              fontFamily: display,
              fontWeight: 700,
              fontSize: 150,
              color: C.ink,
              letterSpacing: -4,
              opacity: frame >= 14 ? 1 : 0,
              transform: `scale(${frame >= 14 ? 1 + Math.exp(-(frame - 14) / 3) * 0.4 : 1})`,
            }}
          >
            don't laugh.
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // --- bar 2: everybody loses it
  const f = frame - BAR;
  const bursts = Array.from({ length: 34 }).map((_, i) => {
    const ang = random(`a${i}`) * Math.PI * 2;
    const speed = 900 + random(`s${i}`) * 900;
    const t = Math.min(1, f / 40);
    const ease = 1 - Math.pow(1 - t, 3);
    const x = Math.cos(ang) * speed * ease;
    const y = Math.sin(ang) * speed * ease + f * f * 0.25;
    const size = 90 + random(`z${i}`) * 110;
    return (
      <div key={i} style={{ position: "absolute", left: 540 - size / 2 + x, top: 820 - size / 2 + y, transform: `rotate(${f * (random(`r${i}`) - 0.5) * 30}deg)` }}>
        <Emoji code="1F602" size={size} />
      </div>
    );
  });
  const bounce = 1 + Math.abs(Math.sin(f / 3.2)) * 0.12;
  return (
    <AbsoluteFill style={{ background: C.yellow, overflow: "hidden", transform: `scale(${beatPunch(frame, 0.035)})` }}>
      <Rays color={C.white} opacity={0.35} speed={3} />
      <Polaroid src="faces/violet.png" x={-60} y={1200} rot={-12} frame={f} seed={0} />
      <Polaroid src="faces/pink.png" x={680} y={1240} rot={11} frame={f} seed={2} />
      {bursts}
      <AbsoluteFill style={{ alignItems: "center" }}>
        <div style={{ position: "absolute", top: 420, transform: `scale(${bounce}) rotate(${Math.sin(f / 2.5) * 8}deg)` }}>
          <Emoji code="1F602" size={640} />
        </div>
      </AbsoluteFill>
      <Sticker at={BAR + 6} rotate={-5} size={120} bg={C.purple} color={C.white} style={{ left: 170, top: 190 }}>
        (you will.)
      </Sticker>
    </AbsoluteFill>
  );
};
