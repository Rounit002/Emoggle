import { loadFont as loadQuicksand } from "@remotion/google-fonts/Quicksand";
import { loadFont as loadJakarta } from "@remotion/google-fonts/PlusJakartaSans";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

// Same "Vibrant Party Play" palette as frontend/app/globals.css.
export const C = {
  ink: "#1a1c1c",
  paper: "#f9f9f9",
  white: "#ffffff",
  yellow: "#ffd93d",
  yellowDeep: "#705d00",
  purple: "#6f5fea",
  purpleDeep: "#5644d0",
  purpleSoft: "#ece9ff",
  pink: "#ffb3b0",
  pinkDeep: "#ae2f34",
  night: "#0b0d1f",
  nightInk: "#c9ccff",
  nightDim: "#7d82b8",
  live: "#ff4d4d",
};

export const display = loadQuicksand("normal", {
  weights: ["600", "700"],
  subsets: ["latin"],
}).fontFamily;

export const sans = loadJakarta("normal", {
  weights: ["600", "800"],
  subsets: ["latin"],
}).fontFamily;

export const mono = loadMono("normal", {
  weights: ["500", "700"],
  subsets: ["latin"],
}).fontFamily;

// Hard offset "sticker" shadow used across the site — never soft.
export const sticker = (px = 12) => `${px}px ${px}px 0 ${C.ink}`;
