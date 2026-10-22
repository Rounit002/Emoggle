import React from "react";
import { AbsoluteFill, interpolate, Easing, useCurrentFrame, random } from "remotion";
import { C, mono, sans, display } from "../theme";
import { Emoji } from "../components";
import { CLOCK_START, CLOCK_STEP, CLOCK_TEXT, SLEEP_START, SLEEP_STEP, SLEEP_TEXT } from "../timing";

const typed = (frame: number, text: string, start: number, step: number) =>
  text.slice(0, Math.max(0, Math.min(text.length, Math.floor((frame - start) / step) + 1)));

// Orthographic projection of a lon/lat point for a globe centred on `lon0`.
const project = (lon: number, lat: number, lon0: number, R: number) => {
  const toR = Math.PI / 180;
  const l = (lon - lon0) * toR;
  const p = lat * toR;
  const tilt = 12 * toR;
  const x = Math.cos(p) * Math.sin(l);
  const y0 = Math.sin(p);
  const z0 = Math.cos(p) * Math.cos(l);
  const y = y0 * Math.cos(tilt) - z0 * Math.sin(tilt);
  const z = y0 * Math.sin(tilt) + z0 * Math.cos(tilt);
  return { x: x * R, y: -y * R, z };
};

const YOU = { lon: 77, lat: 28 }; // Delhi
const THEM = { lon: -46, lat: -23 }; // São Paulo

const Globe: React.FC<{ frame: number }> = ({ frame }) => {
  const R = 330;
  const lon0 = interpolate(frame, [0, 120], [95, 16], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const lines: React.ReactNode[] = [];
  for (let lon = -180; lon < 180; lon += 20) {
    const pts: string[] = [];
    for (let lat = -90; lat <= 90; lat += 6) {
      const q = project(lon, lat, lon0, R);
      if (q.z > 0) pts.push(`${q.x},${q.y}`);
    }
    if (pts.length > 1) lines.push(<polyline key={`m${lon}`} points={pts.join(" ")} fill="none" stroke={C.nightDim} strokeWidth={2} opacity={0.45} />);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const pts: string[] = [];
    for (let lon = -180; lon <= 180; lon += 5) {
      const q = project(lon, lat, lon0, R);
      if (q.z > 0) pts.push(`${q.x},${q.y}`);
    }
    lines.push(<polyline key={`p${lat}`} points={pts.join(" ")} fill="none" stroke={C.nightDim} strokeWidth={2} opacity={0.45} />);
  }
  // scattered "other people awake" dots twinkling
  const city: React.ReactNode[] = [];
  for (let i = 0; i < 70; i++) {
    const q = project(random(`lo${i}`) * 360 - 180, random(`la${i}`) * 120 - 55, lon0, R);
    if (q.z <= 0.05) continue;
    const tw = 0.3 + 0.7 * Math.abs(Math.sin((frame + i * 13) / 10));
    city.push(<circle key={i} cx={q.x} cy={q.y} r={4} fill={C.nightInk} opacity={tw * 0.6 * q.z} />);
  }

  const a = project(YOU.lon, YOU.lat, lon0, R);
  const b = project(THEM.lon, THEM.lat, lon0, R);
  const aOn = frame >= 10;
  const bOn = frame >= 64;
  const arc = interpolate(frame, [64, 80], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2 - 260;
  const path = `M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`;

  const pulse = (start: number, color: string, q: { x: number; y: number }) => {
    const t = ((frame - start) % 30) / 30;
    return (
      <g>
        <circle cx={q.x} cy={q.y} r={10 + t * 50} fill="none" stroke={color} strokeWidth={4} opacity={1 - t} />
        <circle cx={q.x} cy={q.y} r={14} fill={color} stroke={C.white} strokeWidth={4} />
      </g>
    );
  };

  return (
    <svg width={900} height={900} viewBox="-450 -450 900 900" style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id="g" cx="40%" cy="35%">
          <stop offset="0%" stopColor="#262a5c" />
          <stop offset="100%" stopColor="#10122b" />
        </radialGradient>
      </defs>
      <circle r={R + 40} fill="none" stroke="#5a60c9" strokeWidth={2} opacity={0.2} />
      <circle r={R} fill="url(#g)" stroke={C.nightDim} strokeWidth={3} />
      {lines}
      {city}
      {arc > 0 && (
        <path d={path} fill="none" stroke={C.yellow} strokeWidth={8} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - arc} />
      )}
      {aOn && pulse(10, C.purple, a)}
      {bOn && pulse(64, C.pink, b)}
    </svg>
  );
};

export const Night: React.FC = () => {
  const frame = useCurrentFrame();

  // Part 1 (0-120): the clock + "can't sleep", phone feed scrolling.
  const clock = typed(frame, CLOCK_TEXT, CLOCK_START, CLOCK_STEP);
  const sleep = typed(frame, SLEEP_TEXT, SLEEP_START, SLEEP_STEP);
  const cursorOn = Math.floor(frame / 8) % 2 === 0;
  const part1Out = interpolate(frame, [112, 126], [0, -1400], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  const feed = interpolate(frame, [60, 120], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Part 2 (120-240): globe + a stranger lights up.
  const g = frame - 120;
  const globeIn = interpolate(g, [0, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(1.4)) });

  // 222-240: 👀 slams toward the camera, white flash into the drop.
  const eyes = interpolate(frame, [222, 239], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.quad) });
  const flash = interpolate(frame, [233, 240], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 40%, #1a1d44 0%, ${C.night} 70%)` }}>
      {/* part 1 */}
      {frame < 130 && (
        <AbsoluteFill style={{ transform: `translateY(${part1Out}px)`, alignItems: "center" }}>
          {/* dull feed on a phone, scrolling forever */}
          <div
            style={{
              position: "absolute",
              top: 860,
              width: 560,
              height: 900,
              borderRadius: 70,
              border: `10px solid #2b2f5e`,
              background: "#14163a",
              overflow: "hidden",
              opacity: feed,
              boxShadow: "0 0 120px rgba(111,95,234,0.35)",
            }}
          >
            <div style={{ transform: `translateY(${-((frame * 22) % 300)}px)` }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{ margin: 28, height: 244, borderRadius: 30, background: "#22254f", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {i % 3 === 1 ? <Emoji code="1F634" size={110} style={{ opacity: 0.35, filter: "grayscale(0.8)" }} /> : <div style={{ width: 300, height: 26, borderRadius: 13, background: "#2d3163" }} />}
                </div>
              ))}
            </div>
          </div>
          <div style={{ position: "absolute", top: 330, fontFamily: mono, fontWeight: 700, fontSize: 180, color: C.nightInk, textShadow: "0 0 50px rgba(160,165,255,0.6)", letterSpacing: -6 }}>
            {clock}
            <span style={{ opacity: frame < SLEEP_START && cursorOn ? 1 : 0, color: C.yellow }}>▍</span>
          </div>
          <div style={{ position: "absolute", top: 610, fontFamily: sans, fontWeight: 600, fontSize: 76, color: C.nightDim }}>
            {sleep}
            <span style={{ opacity: frame >= SLEEP_START && cursorOn ? 1 : 0 }}>▍</span>
          </div>
        </AbsoluteFill>
      )}

      {/* part 2 */}
      {frame >= 112 && (
        <AbsoluteFill style={{ alignItems: "center" }}>
          <div
            style={{
              position: "absolute",
              top: 300,
              fontFamily: display,
              fontWeight: 700,
              fontSize: 84,
              color: C.nightInk,
              textAlign: "center",
              lineHeight: 1.1,
              opacity: interpolate(g, [2, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              transform: `translateY(${interpolate(g, [2, 14], [40, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px)`,
            }}
          >
            {g < 60 ? (
              <>somewhere out there…</>
            ) : (
              <>
                someone else
                <br />
                <span style={{ color: C.yellow }}>can't sleep either.</span>
              </>
            )}
          </div>
          <div style={{ position: "absolute", top: 620, transform: `scale(${globeIn}) rotate(${(1 - globeIn) * -30}deg)` }}>
            <Globe frame={g} />
          </div>
          <div style={{ position: "absolute", top: 1560, display: "flex", gap: 60, fontFamily: sans, fontWeight: 800, fontSize: 40, opacity: globeIn }}>
            <span style={{ color: C.purple }}>● you · 2:07 AM</span>
            <span style={{ color: C.pink, opacity: g >= 64 ? 1 : 0.15 }}>● them · 5:37 PM</span>
          </div>
        </AbsoluteFill>
      )}

      {eyes > 0 && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <div style={{ transform: `scale(${0.4 + eyes * 7}) rotate(${eyes * 12}deg)` }}>
            <Emoji code="1F440" size={300} />
          </div>
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ background: C.white, opacity: flash }} />
    </AbsoluteFill>
  );
};
