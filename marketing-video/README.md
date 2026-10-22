# Emoggle — "2:07 AM" (Remotion spot)

A 32-second vertical (1080×1920) video for Reels / Shorts / TikTok. It sells the
feeling of Emoggle, not its feature list.

| Time | Beat |
|---|---|
| 0–4s | `2:07 AM` types itself. "can't sleep." A dull feed scrolls. |
| 4–8s | A globe. You light up in Delhi. Then someone lights up in São Paulo. 👀 → **drop** |
| 8–12s | Two webcams, one 😜. "same face." "different time zone." |
| 12–16s | 3 · 2 · 1 · GO → eight emoji rounds, one every eighth note |
| 16–20s | *record scratch* "RULE #1: don't laugh." … 😂 explosion: "(you will.)" |
| 20–24s | 9.4 vs 9.1 → "rematch?" *click* → rematch ×9 while the clock slides to 3:41 AM |
| 24–28s | two strangers. / one emoji. / zero chill. |
| 28–32s | Emoggle wordmark · "make a face. meet a stranger." · emoggle.com · "see you at 2:07 ☾" |

## Commands

```bash
npm install
npm run sounds   # regenerate music + SFX (python + numpy)
npm run studio   # live preview / tweak in the browser
npm run render   # -> out/emoggle-207am.mp4
```

## How it's built

- **Audio is 100% synthesized** in `scripts/make_audio.py` (numpy only), so it's
  royalty-free. It makes an original 120 BPM track (`public/music.wav`) and 22 one-shot SFX
  (`public/sfx/`).
- **Everything is on one beat grid:** at 120 BPM and 30 fps, 1 beat = 15 frames.
  `src/timing.ts` holds the scene boundaries. `src/Soundtrack.tsx` holds every SFX cue,
  in frames.
- Palette, fonts and wordmark mirror `frontend/` (the "Vibrant Party Play" tokens,
  Quicksand, and `app/ui/Logo.tsx`).
- Emoji art is **OpenMoji** (CC BY-SA 4.0). If you post it, credit "Emoji: OpenMoji"
  in the caption.
- The faces are the site's own preview images (`frontend/public/preview-faces/*.png`).
