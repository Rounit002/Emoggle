import React from "react";
import { AbsoluteFill, interpolate, Easing, random, useCurrentFrame } from "remotion";
import { C, display, mono, sans, sticker } from "../theme";
import { Cursor, Doodles, Emoji, Sticker, usePop } from "../components";
import { REMATCH_COUNT, REMATCH_START, REMATCH_STEP } from "../timing";

const CARD_EMOJI = ["1F92A", "1F631", "1F60F", "1F97A", "1F92F", "1F913", "1F624", "1F644", "1F929"];

// 2:07 -> 3:41 AM over the rematch run
const clockAt = (frame: number) => {
  const mins = Math.round(interpolate(frame, [REMATCH_START, 112], [127, 221], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.quad) }));
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
};

export const Rematch: React.FC = () => {
  const frame = useCurrentFrame();
  const scores = usePop(0, 12);
  const trophy = usePop(10, 8);
  const button = usePop(36, 9);
  const pressed = frame >= 52 && frame < 58;

  const boardUp = interpolate(frame, [34, 46], [0, -520], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const buttonGone = interpolate(frame, [58, 66], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cx = interpolate(frame, [36, 51], [980, 640], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const cy = interpolate(frame, [36, 51], [1900, 1260], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });

  const cards = Array.from({ length: REMATCH_COUNT }).map((_, i) => {
    const at = REMATCH_START + i * REMATCH_STEP;
    if (frame < at) return null;
    const p = Math.min(1, (frame - at) / 5);
    const e = 1 - Math.pow(1 - p, 3);
    const rot = (random(`c${i}`) - 0.5) * 24;
    const dx = (random(`x${i}`) - 0.5) * 360;
    const dy = (random(`y${i}`) - 0.5) * 900 - 60;
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: 540 - 330 + dx,
          top: 900 + dy + (1 - e) * 900,
          width: 660,
          height: 420,
          borderRadius: 50,
          border: `8px solid ${C.ink}`,
          boxShadow: sticker(12),
          background: i % 3 === 0 ? C.yellow : i % 3 === 1 ? C.pink : C.white,
          transform: `rotate(${rot}deg) scale(${0.8 + e * 0.2})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 56px",
        }}
      >
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: 96, color: C.ink, letterSpacing: -3 }}>rematch.</div>
        <Emoji code={CARD_EMOJI[i]} size={170} />
      </div>
    );
  });

  const late = frame >= 106;
  const lateP = interpolate(frame, [106, 114], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(2)) });

  return (
    <AbsoluteFill style={{ background: C.purple, overflow: "hidden" }}>
      <Doodles opacity={0.14} seed="r" speed={1.6} />

      {/* the result */}
      <AbsoluteFill style={{ transform: `translateY(${boardUp}px)`, opacity: interpolate(frame, [58, 70], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        <div style={{ position: "absolute", top: 560, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 50 }}>
          <div style={{ textAlign: "center", transform: `translateX(${(1 - scores) * -700}px)` }}>
            <div style={{ transform: `scale(${trophy}) rotate(${(1 - trophy) * 90}deg)`, display: "flex", justifyContent: "center", marginBottom: 10 }}>
              <Emoji code="1F3C6" size={200} />
            </div>
            <div style={{ fontFamily: display, fontWeight: 700, fontSize: 260, color: C.yellow, WebkitTextStroke: `8px ${C.ink}`, textShadow: `14px 14px 0 ${C.ink}`, lineHeight: 1 }}>9.4</div>
            <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 40, color: C.white, marginTop: 20 }}>YOU</div>
          </div>
          <div style={{ fontFamily: display, fontWeight: 700, fontSize: 80, color: C.white, opacity: 0.7, marginBottom: 140 }}>vs</div>
          <div style={{ textAlign: "center", transform: `translateX(${(1 - scores) * 700}px)` }}>
            <div style={{ fontFamily: display, fontWeight: 700, fontSize: 260, color: C.pink, WebkitTextStroke: `8px ${C.ink}`, textShadow: `14px 14px 0 ${C.ink}`, lineHeight: 1 }}>9.1</div>
            <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 40, color: C.white, marginTop: 20 }}>STRANGER</div>
          </div>
        </div>
        <Sticker at={20} rotate={-3} size={64} bg={C.white} style={{ left: 290, top: 1180 }}>
          won by a nose.
        </Sticker>
      </AbsoluteFill>

      {/* rematch? */}
      {frame >= 36 && (
        <AbsoluteFill style={{ alignItems: "center", opacity: buttonGone }}>
          <div
            style={{
              position: "absolute",
              top: 1100,
              fontFamily: display,
              fontWeight: 700,
              fontSize: 120,
              color: C.ink,
              background: C.yellow,
              border: `10px solid ${C.ink}`,
              borderRadius: 999,
              padding: "30px 90px",
              boxShadow: pressed ? `0 0 0 ${C.ink}` : sticker(16),
              transform: `scale(${button}) translate(${pressed ? 16 : 0}px, ${pressed ? 16 : 0}px)`,
              letterSpacing: -3,
            }}
          >
            rematch?
          </div>
          <Cursor x={cx} y={cy} pressed={pressed} />
        </AbsoluteFill>
      )}

      {cards}

      {/* the clock quietly running away */}
      {frame >= REMATCH_START && (
        <div
          style={{
            position: "absolute",
            top: interpolate(lateP, [0, 1], [120, 300]),
            right: interpolate(lateP, [0, 1], [70, 540 - 330]),
            width: 660,
            textAlign: "right",
            fontFamily: mono,
            fontWeight: 700,
            fontSize: interpolate(lateP, [0, 1], [70, 170]),
            color: C.white,
            textShadow: `8px 8px 0 ${C.ink}`,
          }}
        >
          {clockAt(frame)} AM
        </div>
      )}
      {late && (
        <Sticker at={108} rotate={-6} size={92} bg={C.pink} style={{ left: 280, top: 1500 }}>
          …one more?
        </Sticker>
      )}
    </AbsoluteFill>
  );
};
