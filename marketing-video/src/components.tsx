import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, display, sans, sticker } from "./theme";
import { BEAT } from "./timing";

/** Spring that starts at `at` (local frames). 0 before, ~1 after. */
export const usePop = (at: number, damping = 11, mass = 0.7) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - at, fps, config: { damping, mass, stiffness: 180 } });
};

/** A tiny zoom "punch" on every beat, decaying fast. */
export const beatPunch = (frame: number, amount = 0.022) =>
  1 + amount * Math.exp(-(frame % BEAT) / 2.6);

export const Emoji: React.FC<{ code: string; size: number; style?: React.CSSProperties }> = ({
  code,
  size,
  style,
}) => (
  <Img
    src={staticFile(`emoji/${code}.svg`)}
    style={{ width: size, height: size, display: "block", ...style }}
  />
);

/** Text on a rounded, ink-bordered sticker that springs in. */
export const Sticker: React.FC<{
  at: number;
  children: React.ReactNode;
  bg?: string;
  color?: string;
  size?: number;
  rotate?: number;
  font?: string;
  style?: React.CSSProperties;
}> = ({ at, children, bg = C.white, color = C.ink, size = 88, rotate = -3, font = display, style }) => {
  const p = usePop(at, 10);
  const frame = useCurrentFrame();
  if (frame < at) return null;
  return (
    <div
      style={{
        position: "absolute",
        transform: `scale(${interpolate(p, [0, 1], [0.3, 1])}) rotate(${rotate * p}deg)`,
        background: bg,
        color,
        fontFamily: font,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1.05,
        letterSpacing: -1.5,
        padding: `${size * 0.22}px ${size * 0.42}px`,
        border: `8px solid ${C.ink}`,
        borderRadius: size * 0.45,
        boxShadow: sticker(12),
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

const DOODLES = ["1F61C", "1F602", "1F631", "1F92A", "1F60F", "1F97A", "1F92F", "1F913", "1F929", "1F644", "1F62E", "1F973"];

/** The drifting emoji wallpaper from the site's home page. */
export const Doodles: React.FC<{ opacity?: number; speed?: number; seed?: string }> = ({
  opacity = 0.16,
  speed = 1,
  seed = "d",
}) => {
  const frame = useCurrentFrame();
  const cols = 5;
  const rows = 10;
  const cell = 260;
  const drift = (frame * 1.4 * speed) % cell;
  const items = [];
  for (let r = -1; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = (r + 1) * cols + c;
      const code = DOODLES[Math.floor(random(`${seed}${i}`) * DOODLES.length)];
      const rot = (random(`${seed}r${i}`) - 0.5) * 50 + Math.sin((frame + i * 9) / 22) * 8;
      items.push(
        <div
          key={i}
          style={{
            position: "absolute",
            left: c * 230 + (r % 2 ? 115 : 0) - 60,
            top: r * cell - drift + 40,
            transform: `rotate(${rot}deg)`,
          }}
        >
          <Emoji code={code} size={150} />
        </div>,
      );
    }
  }
  return <AbsoluteFill style={{ opacity }}>{items}</AbsoluteFill>;
};

/** Rotating sunburst rays behind a hero element. */
export const Rays: React.FC<{ color: string; opacity?: number; speed?: number }> = ({
  color,
  opacity = 0.25,
  speed = 0.5,
}) => {
  const frame = useCurrentFrame();
  const n = 18;
  return (
    <AbsoluteFill style={{ opacity, alignItems: "center", justifyContent: "center" }}>
      <svg width={2600} height={2600} viewBox="-100 -100 200 200" style={{ transform: `rotate(${frame * speed}deg)` }}>
        {Array.from({ length: n }).map((_, i) => {
          const a0 = (i / n) * Math.PI * 2;
          const a1 = a0 + Math.PI / n;
          return (
            <path
              key={i}
              d={`M0 0 L${Math.cos(a0) * 150} ${Math.sin(a0) * 150} L${Math.cos(a1) * 150} ${Math.sin(a1) * 150} Z`}
              fill={color}
            />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

/** A webcam tile: photo, LIVE dot, name pill and a live match meter. */
export const WebcamCard: React.FC<{
  src: string;
  label: string;
  accent: string;
  width: number;
  height: number;
  score?: number; // 0-10, animated by the caller
  objectPosition?: string;
  style?: React.CSSProperties;
}> = ({ src, label, accent, width, height, score, objectPosition = "50% 35%", style }) => {
  const frame = useCurrentFrame();
  const blink = Math.floor(frame / 12) % 2 === 0;
  return (
    <div
      style={{
        position: "absolute",
        width,
        height,
        borderRadius: 56,
        border: `10px solid ${C.ink}`,
        boxShadow: sticker(16),
        overflow: "hidden",
        background: accent,
        ...style,
      }}
    >
      <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition }} />
      {/* face-tracking brackets */}
      <FaceBrackets w={width} h={height} color={C.white} />
      <div
        style={{
          position: "absolute",
          top: 28,
          left: 28,
          background: accent,
          color: C.white,
          fontFamily: sans,
          fontWeight: 800,
          fontSize: 34,
          letterSpacing: 1,
          padding: "10px 24px",
          borderRadius: 999,
          border: `5px solid ${C.ink}`,
        }}
      >
        {label}
      </div>
      <div
        style={{
          position: "absolute",
          top: 34,
          right: 30,
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "rgba(26,28,28,0.7)",
          color: C.white,
          fontFamily: sans,
          fontWeight: 800,
          fontSize: 26,
          padding: "8px 18px",
          borderRadius: 999,
        }}
      >
        <div style={{ width: 16, height: 16, borderRadius: 8, background: blink ? C.live : "#7a2020" }} />
        LIVE
      </div>
      {score !== undefined && (
        <div
          style={{
            position: "absolute",
            left: 28,
            right: 28,
            bottom: 28,
            height: 64,
            borderRadius: 999,
            background: "rgba(255,255,255,0.92)",
            border: `5px solid ${C.ink}`,
            overflow: "hidden",
          }}
        >
          <div style={{ width: `${score * 10}%`, height: "100%", background: C.yellow, borderRight: `5px solid ${C.ink}` }} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              paddingRight: 24,
              fontFamily: display,
              fontWeight: 700,
              fontSize: 38,
              color: C.ink,
            }}
          >
            {score.toFixed(1)}
          </div>
        </div>
      )}
    </div>
  );
};

const FaceBrackets: React.FC<{ w: number; h: number; color: string }> = ({ w, h, color }) => {
  const frame = useCurrentFrame();
  const bw = w * 0.42;
  const bh = h * 0.55;
  const x = w / 2 - bw / 2 + Math.sin(frame / 9) * 6;
  const y = h * 0.16 + Math.cos(frame / 11) * 5;
  const L = 50;
  const s = { stroke: color, strokeWidth: 7, fill: "none", strokeLinecap: "round" as const, opacity: 0.85 };
  return (
    <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
      <path d={`M${x} ${y + L} V${y} H${x + L}`} {...s} />
      <path d={`M${x + bw - L} ${y} H${x + bw} V${y + L}`} {...s} />
      <path d={`M${x} ${y + bh - L} V${y + bh} H${x + L}`} {...s} />
      <path d={`M${x + bw - L} ${y + bh} H${x + bw} V${y + bh - L}`} {...s} />
    </svg>
  );
};

/** The Emoggle wordmark: "Em" + smiling face + "ggle" (see frontend/app/ui/Logo.tsx). */
export const Wordmark: React.FC<{ size: number; at: number }> = ({ size, at }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const parts = ["E", "m", "FACE", "g", "g", "l", "e"];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        fontFamily: display,
        fontWeight: 700,
        fontSize: size,
        color: C.purpleDeep,
        letterSpacing: -size * 0.03,
        padding: `${size * 0.04}px ${size * 0.16}px`,
        borderRadius: size * 0.3,
        background: C.paper,
        boxShadow: `0 0 0 ${size * 0.07}px ${C.white}, 0 0 ${size * 0.5}px rgba(255,217,61,0.75)`,
      }}
    >
      {parts.map((p, i) => {
        const s = spring({ frame: frame - at - i * 2.5, fps, config: { damping: 9, mass: 0.6 } });
        const y = interpolate(s, [0, 1], [size * 0.6, 0]);
        const common: React.CSSProperties = {
          display: "inline-block",
          transform: `translateY(${y}px) scale(${interpolate(s, [0, 1], [0.2, 1])})`,
          opacity: Math.min(1, s * 2),
        };
        if (p === "FACE") {
          const spin = interpolate(s, [0, 1], [-200, 0]);
          return (
            <svg
              key={i}
              viewBox="0 0 32 32"
              style={{ ...common, width: size * 0.78, height: size * 0.78, margin: `0 ${size * 0.02}px`, transform: `${common.transform} rotate(${spin}deg)` }}
            >
              <circle cx="16" cy="16" r="14" fill={C.yellow} />
              <path d="M9 14 Q11 11 13 14" stroke={C.purpleDeep} strokeWidth="2.5" fill="none" strokeLinecap="round" />
              <path d="M19 14 Q21 11 23 14" stroke={C.purpleDeep} strokeWidth="2.5" fill="none" strokeLinecap="round" />
              <path d="M9 19 Q16 25 23 19" stroke={C.purpleDeep} strokeWidth="2.5" fill="none" strokeLinecap="round" />
            </svg>
          );
        }
        return (
          <span key={i} style={common}>
            {p}
          </span>
        );
      })}
    </div>
  );
};

/** Mouse cursor arrow. */
export const Cursor: React.FC<{ x: number; y: number; pressed?: boolean }> = ({ x, y, pressed }) => (
  <svg
    width={110}
    height={130}
    viewBox="0 0 22 26"
    style={{ position: "absolute", left: x, top: y, transform: `scale(${pressed ? 0.86 : 1})`, transformOrigin: "0 0" }}
  >
    <path d="M2 2 L2 21 L7 16.5 L10.5 24 L14 22.5 L10.5 15 L17 15 Z" fill={C.white} stroke={C.ink} strokeWidth="2" strokeLinejoin="round" />
  </svg>
);
