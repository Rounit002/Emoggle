import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, display, sans, sticker } from "../theme";
import { Doodles, Wordmark, usePop } from "../components";

export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const tag = usePop(24, 12);
  const cta = usePop(40, 9);
  const small = interpolate(frame, [52, 62], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const moon = interpolate(frame, [80, 92], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const breathe = 1 + Math.sin(frame / 10) * 0.012;

  return (
    <AbsoluteFill style={{ background: C.paper, alignItems: "center", overflow: "hidden" }}>
      <Doodles opacity={0.13} seed="e" speed={0.6} />

      <div style={{ position: "absolute", top: 640, transform: `scale(${breathe})` }}>
        <Wordmark size={200} at={0} />
      </div>

      <div
        style={{
          position: "absolute",
          top: 930,
          fontFamily: display,
          fontWeight: 700,
          fontSize: 76,
          color: C.ink,
          letterSpacing: -2,
          textAlign: "center",
          lineHeight: 1.15,
          opacity: tag,
          transform: `translateY(${(1 - tag) * 50}px)`,
        }}
      >
        make a face.
        <br />
        <span style={{ color: C.pinkDeep }}>meet a stranger.</span>
      </div>

      <div
        style={{
          position: "absolute",
          top: 1200,
          fontFamily: display,
          fontWeight: 700,
          fontSize: 72,
          color: C.ink,
          background: C.yellow,
          border: `9px solid ${C.ink}`,
          borderRadius: 999,
          padding: "26px 70px",
          boxShadow: sticker(14),
          transform: `scale(${cta}) rotate(${(1 - cta) * -10}deg)`,
        }}
      >
        emoggle.com
      </div>

      <div style={{ position: "absolute", top: 1410, fontFamily: sans, fontWeight: 600, fontSize: 40, color: "#4d4633", opacity: small, letterSpacing: 1 }}>
        free · no download · just your webcam
      </div>

      <div style={{ position: "absolute", bottom: 150, fontFamily: display, fontWeight: 700, fontSize: 46, color: C.purpleDeep, opacity: moon }}>
        see you at 2:07 ☾
      </div>
    </AbsoluteFill>
  );
};
