"""
Synthesises the whole soundtrack for the "2:07 AM" Emoggle spot.

Everything is generated from scratch with numpy, so there are no
licensing questions: one music bed (public/music.wav) plus a set of
one-shot sound effects (public/sfx/*.wav) that the Remotion
composition places on exact frames.

Timing contract (must match src/timing.ts):
  120 BPM, 30 fps  ->  1 beat = 0.5 s = 15 frames, 1 bar = 60 frames.
  Bars 0-3   night intro (pad, riser into the drop)
  Bar  4     DROP
  Bar  8     record scratch, music cuts ("rule #1: don't laugh")
  Bar  9     beat 1 of bar 9 = back in ("you will.")
  Bar  14    final chord, ring out to bar 16 (32 s)

Run:  python scripts/make_audio.py
"""

import os
import wave

import numpy as np

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4
TOTAL = 16 * BAR + 1.0
ROOT = os.path.join(os.path.dirname(__file__), "..", "public")
rng = np.random.default_rng(207)


# ------------------------------------------------------------------ utils
def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def env_exp(dur, decay, attack=0.002):
    t = t_axis(dur)
    a = np.clip(t / attack, 0, 1)
    return a * np.exp(-t / decay)


def env_adsr(dur, a=0.01, d=0.1, s=0.7, r=0.2):
    t = t_axis(dur)
    e = np.ones_like(t) * s
    e[t < a] = t[t < a] / a
    m = (t >= a) & (t < a + d)
    e[m] = 1 - (1 - s) * (t[m] - a) / d
    rel = t > dur - r
    e[rel] *= np.clip((dur - t[rel]) / r, 0, 1)
    return e


def fft_filter(x, lo=None, hi=None, soft=1.0):
    """Brick-ish band filter in the frequency domain with soft edges."""
    n = len(x)
    if n == 0:
        return x
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    m = np.ones_like(f)
    if hi is not None:
        m *= 1 / (1 + (f / hi) ** (4 * soft))
    if lo is not None:
        m *= 1 / (1 + (lo / np.maximum(f, 1e-3)) ** (4 * soft))
    return np.fft.irfft(X * m, n)


def sweep_filter(x, lo_fn, hi_fn, block=2048):
    """Time-varying band filter via overlapping FFT blocks."""
    hop = block // 2
    win = np.hanning(block)
    out = np.zeros(len(x) + block)
    xp = np.concatenate([x, np.zeros(block)])
    f = np.fft.rfftfreq(block, 1 / SR)
    for i in range(0, len(x), hop):
        seg = xp[i:i + block] * win
        tt = i / SR
        lo, hi = lo_fn(tt), hi_fn(tt)
        m = 1 / (1 + (f / hi) ** 4) * 1 / (1 + (lo / np.maximum(f, 1e-3)) ** 4)
        out[i:i + block] += np.fft.irfft(np.fft.rfft(seg) * m, block)
    return out[:len(x)]


def saw(freq, dur, detune=0.0):
    t = t_axis(dur)
    ph = rng.random()
    return 2 * ((t * freq * (1 + detune) + ph) % 1) - 1


def square(freq, dur, duty=0.5, vib=0.0):
    t = t_axis(dur)
    f = freq * (1 + vib * np.sin(2 * np.pi * 5.5 * t))
    ph = np.cumsum(f) / SR
    return np.where((ph % 1) < duty, 1.0, -1.0)


def sine_sweep(f0, f1, dur, curve=6.0):
    t = t_axis(dur)
    f = f1 + (f0 - f1) * np.exp(-t * curve)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def noise(dur):
    return rng.uniform(-1, 1, int(dur * SR))


def place(buf, clip, at, gain=1.0):
    i = int(at * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(clip))
    buf[i:j] += clip[: j - i] * gain


def reverb(x, seconds=1.6, mix=0.25, lo=200, hi=7000):
    ir_t = t_axis(seconds)
    ir = rng.normal(0, 1, len(ir_t)) * np.exp(-ir_t * 5 / seconds)
    ir = fft_filter(ir, lo, hi)
    ir /= np.sqrt(np.sum(ir ** 2))
    n = len(x) + len(ir)
    nfft = 1 << (n - 1).bit_length()
    wet = np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(ir, nfft), nfft)[:len(x)]
    return x * (1 - mix) + wet * mix


def normalize(x, peak=0.89):
    m = np.max(np.abs(x))
    return x if m == 0 else x / m * peak


def soft_clip(x, drive=1.2):
    return np.tanh(x * drive) / np.tanh(drive)


def write(path, x, stereo_width=0.0):
    x = normalize(x)
    if stereo_width:
        d = int(0.012 * SR)
        r = np.concatenate([np.zeros(d), x[:-d]])
        left, right = x, x * (1 - stereo_width) + r * stereo_width
    else:
        left = right = x
    data = np.stack([left, right], axis=1)
    pcm = (np.clip(data, -1, 1) * 32767).astype(np.int16)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print("wrote", os.path.relpath(path, ROOT))


# ------------------------------------------------------------ instruments
def kick(gain=1.0):
    d = 0.45
    body = sine_sweep(170, 44, d, curve=28) * env_exp(d, 0.22)
    click = fft_filter(noise(0.01), 1500, 8000) * 0.4
    body[: len(click)] += click
    return soft_clip(body * gain, 1.6)


def clap():
    d = 0.35
    x = np.zeros(int(d * SR))
    for k, off in enumerate([0, 0.011, 0.022]):
        burst = noise(0.3) * env_exp(0.3, 0.012 if k < 2 else 0.09)
        place(x, burst, off)
    return fft_filter(x, 900, 5200) * 1.4


def hat(open_=False):
    d = 0.22 if open_ else 0.05
    return fft_filter(noise(d), 7000, None) * env_exp(d, 0.07 if open_ else 0.012)


def snare_hit():
    d = 0.2
    tone = sine_sweep(330, 180, d, 30) * env_exp(d, 0.05) * 0.5
    return tone + fft_filter(noise(d), 1500, 9000) * env_exp(d, 0.06)


def bass_note(n, dur):
    f = midi(n)
    x = saw(f, dur) * 0.6 + np.sin(2 * np.pi * f * t_axis(dur)) * 0.8
    x = fft_filter(x, None, 700)
    return x * env_adsr(dur, 0.004, 0.08, 0.6, 0.04)


def supersaw(notes, dur, cutoff=2600, voices=5):
    x = np.zeros(int(dur * SR))
    for n in notes:
        for v in range(voices):
            x += saw(midi(n), dur, detune=(v - voices // 2) * 0.006)
    return fft_filter(x / (len(notes) * voices), 90, cutoff)


def stab(notes, dur=0.22):
    return supersaw(notes, dur, 3800) * env_exp(dur, 0.09, 0.003)


def pad(notes, dur):
    return supersaw(notes, dur, 1100, voices=7) * env_adsr(dur, 0.6, 0.3, 0.85, 0.8)


def lead_note(n, dur):
    f = midi(n)
    x = square(f, dur, 0.35, vib=0.004) * 0.5 + np.sin(2 * np.pi * 2 * f * t_axis(dur)) * 0.25
    x = fft_filter(x, 200, 5200)
    return x * env_exp(dur, 0.16, 0.004)


def bell(n, dur=1.2, decay=0.45):
    f = midi(n)
    t = t_axis(dur)
    x = np.zeros_like(t)
    for ratio, amp, dk in [(1, 1, 1), (2.76, 0.45, 0.6), (5.4, 0.25, 0.35), (8.93, 0.12, 0.2)]:
        x += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / (decay * dk))
    return x * np.clip(t / 0.002, 0, 1)


# --------------------------------------------------------------- the music
def music():
    buf = np.zeros(int(TOTAL * SR))
    drums = np.zeros_like(buf)
    duck = np.ones_like(buf)  # sidechain envelope driven by the kick

    def at(bar, beat=0.0):
        return bar * BAR + beat * BEAT

    # Chords: IV  V  iii  vi  in C major -> uplifting, "late night turns fun"
    F = [53, 57, 60, 64]
    G = [55, 59, 62, 67]
    Em = [52, 55, 59, 62]
    Am = [57, 60, 64, 67]
    C = [48, 55, 60, 64, 67, 72]
    prog = [F, G, Em, Am]
    roots = {id(F): 41, id(G): 43, id(Em): 40, id(Am): 45}

    # --- Intro (bars 0-3): moody pad, the room at 2 AM
    place(buf, pad([57, 60, 64, 71], BAR * 2 + 0.3), at(0), 1.3)
    place(buf, pad([53, 57, 60, 64, 67], BAR * 2), at(2), 1.0)
    # soft sub pulse on every beat of bar 2, doubling in bar 3
    for b in range(4):
        place(drums, kick(0.35), at(2, b))
    for b in range(8):
        place(drums, kick(0.45), at(3, b * 0.5))
    # snare build: 8ths then 16ths, rising volume, stops a beat early
    for i in range(8):
        place(drums, snare_hit(), at(2, 2 + i * 0.25), 0.15 + i * 0.02)
    for i in range(12):
        place(drums, snare_hit(), at(3, i * 0.25), 0.3 + i * 0.04)
    # noise riser, bars 2-3, cutoff climbing
    rdur = BAR * 2 - BEAT
    r = sweep_filter(noise(rdur), lambda s: 300 + s * 900, lambda s: 800 + (s / rdur) ** 2 * 11000)
    r *= np.linspace(0, 1, len(r)) ** 2
    place(buf, r, at(2), 0.35)
    # tonal riser (pitch climbs an octave)
    tr = t_axis(rdur)
    fr = midi(60) * 2 ** (tr / rdur)
    tone = np.sin(2 * np.pi * np.cumsum(fr) / SR) * (tr / rdur) ** 2
    place(buf, tone, at(2), 0.12)

    # --- Groove (bars 4-13)
    melody = {
        0: [72, None, 69, 72, None, 74, 72, None],
        1: [74, None, 71, 74, None, 76, 74, 71],
        2: [76, None, 74, 71, None, 72, 74, None],
        3: [72, None, 69, 67, 69, None, None, None],
    }
    stab_rhythm = [0, 0.75, 1.5, 2.5, 3.0, 3.5]

    for bar in range(4, 14):
        chord = prog[(bar - 4) % 4]
        root = roots[id(chord)]
        is_break = bar == 8  # "rule #1: don't laugh" - tension bar

        if is_break:
            # just a ticking bass + heartbeat kick under the tension
            for b in range(4):
                place(buf, bass_note(root - 12 + 12, 0.12), at(bar, b), 0.35)
            place(drums, kick(0.5), at(bar, 0))
            place(drums, kick(0.5), at(bar, 2))
            continue

        for b in range(4):
            place(drums, kick(), at(bar, b))
            s = int(at(bar, b) * SR)
            e = min(len(duck), s + int(0.3 * SR))
            duck[s:e] = np.minimum(duck[s:e], 0.35 + 0.65 * np.linspace(0, 1, e - s) ** 0.7)
            place(drums, hat(True), at(bar, b + 0.5), 0.35)
            for k in range(4):
                place(drums, hat(False), at(bar, b + k * 0.25), 0.18 if k % 2 else 0.1)
        place(drums, clap(), at(bar, 1), 0.7)
        place(drums, clap(), at(bar, 3), 0.7)

        # pumping offbeat bass, octave jumps
        for e8 in range(8):
            n = root if e8 % 2 == 0 else root + 12
            place(buf, bass_note(n, BEAT / 2 * 0.9), at(bar, e8 * 0.5), 0.55)

        # plucky stabs
        for off in stab_rhythm:
            place(buf, stab(chord), at(bar, off), 0.42)

        # lead melody (not in bar 9: it re-enters with a bang in bar 10)
        if bar != 9:
            line = melody[(bar - 4) % 4]
            for i, n in enumerate(line):
                if n is None:
                    continue
                note = lead_note(n, BEAT * 0.9)
                place(buf, note, at(bar, i * 0.5), 0.3)
                place(buf, note, at(bar, i * 0.5 + 0.75), 0.1)  # dotted-8th echo

        # extra excitement in the rematch section: 16th bell sparkles
        if bar in (10, 11):
            for i in range(16):
                place(buf, bell(chord[i % len(chord)] + 24, 0.25, 0.08), at(bar, i * 0.25), 0.05)

    # fill into the end card
    for i in range(8):
        place(drums, snare_hit(), at(13, 2 + i * 0.25), 0.25 + i * 0.05)

    # --- End (bars 14-15): big C chord, ring out
    place(drums, kick(1.2), at(14))
    place(buf, supersaw(C, BAR * 2, 3000, 7) * env_exp(BAR * 2, 1.4, 0.005), at(14), 0.9)
    place(buf, bass_note(36, BAR * 1.5) * env_exp(BAR * 1.5, 0.9), at(14), 0.8)
    for i, n in enumerate([72, 76, 79, 84]):
        place(buf, bell(n, 2.0, 0.7), at(14, 0.5 + i * 0.25), 0.18)
    place(buf, bell(84, 2.5, 0.9), at(15, 0), 0.12)

    mix = buf * duck
    mix = reverb(mix, 1.8, 0.22) + drums * 0.9
    # gentle master fade at the very end
    fade = np.ones_like(mix)
    fs = int((16 * BAR - 0.6) * SR)
    fade[fs:] = np.linspace(1, 0, len(fade) - fs) ** 2
    return soft_clip(mix * fade, 1.1)


# ----------------------------------------------------------------- the SFX
def sfx_tick():
    x = fft_filter(noise(0.04), 2500, 9000) * env_exp(0.04, 0.006)
    x += np.sin(2 * np.pi * 1900 * t_axis(0.04)) * env_exp(0.04, 0.004) * 0.3
    return x


def sfx_whoosh(dur=0.9):
    t = t_axis(dur)
    shape = np.sin(np.pi * t / dur) ** 2
    x = sweep_filter(noise(dur), lambda s: 200 + 1800 * s / dur, lambda s: 900 + 7000 * np.sin(np.pi * s / dur))
    return x * shape


def sfx_pop(semitones=0):
    k = 2 ** (semitones / 12)
    d = 0.18
    x = sine_sweep(1100 * k, 260 * k, d, 32) * env_exp(d, 0.05)
    x[: int(0.004 * SR)] += fft_filter(noise(0.004), 2000, 10000) * 0.6
    return x


def sfx_beep(n=76, d=0.2):
    return (square(midi(n), d, 0.5) * 0.3 + np.sin(2 * np.pi * midi(n) * t_axis(d))) * env_adsr(d, 0.003, 0.05, 0.6, 0.06)


def sfx_boing():
    d = 0.6
    t = t_axis(d)
    f = 180 + 260 * t / d + 60 * np.sin(2 * np.pi * 14 * t) * np.exp(-t * 3)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    return x * env_exp(d, 0.25)


def sfx_scratch():
    d = 0.55
    t = t_axis(d)
    # hand pulling the record back and forth
    speed = np.sin(2 * np.pi * 3.2 * t) * np.exp(-t * 1.5)
    ph = np.cumsum(np.abs(speed) * 700 + 60) / SR
    tone = np.sin(2 * np.pi * ph) * 0.4
    grit = fft_filter(noise(d), 600, 4000) * (np.abs(speed) ** 0.8)
    x = (tone + grit) * np.clip((d - t) / 0.08, 0, 1)
    return soft_clip(x * 1.5, 2.0)


def sfx_click():
    d = 0.06
    return fft_filter(noise(d), 1500, 6000) * env_exp(d, 0.008) + sine_sweep(2400, 900, d, 80) * env_exp(d, 0.01) * 0.5


def sfx_clock():
    d = 0.08
    return fft_filter(noise(d), 1800, 4500) * env_exp(d, 0.01) + np.sin(2 * np.pi * 1250 * t_axis(d)) * env_exp(d, 0.015) * 0.6


def sfx_ping():
    x = np.zeros(int(1.4 * SR))
    place(x, bell(83, 1.2, 0.5), 0)
    place(x, bell(88, 1.2, 0.6), 0.12)
    return reverb(x, 1.2, 0.3)


def sfx_ding():
    x = np.zeros(int(1.8 * SR))
    for i, n in enumerate([72, 76, 79, 84]):
        place(x, bell(n, 1.4, 0.5), i * 0.07, 1 - i * 0.1)
    return reverb(x, 1.5, 0.3)


def sfx_sparkle():
    x = np.zeros(int(1.6 * SR))
    for i, n in enumerate([84, 88, 91, 96, 100, 103]):
        place(x, bell(n, 0.8, 0.25), i * 0.045, 0.7)
    return reverb(x, 1.4, 0.35)


def sfx_impact():
    d = 1.6
    sub = sine_sweep(120, 38, d, 5) * env_exp(d, 0.55)
    crash = fft_filter(noise(d), 3000, None) * env_exp(d, 0.35) * 0.35
    return soft_clip(reverb(sub + crash, 1.8, 0.3) * 1.3, 1.5)


def sfx_swoosh():
    return sfx_whoosh(0.4)


def sfx_hum():
    """Low fridge-at-night room tone for the intro."""
    d = 8.0
    t = t_axis(d)
    x = fft_filter(noise(d), 60, 400) * 0.6 + np.sin(2 * np.pi * 50 * t) * 0.15
    e = np.clip(t / 1.0, 0, 1) * np.clip((d - t) / 0.4, 0, 1)
    return x * e


def main():
    write(os.path.join(ROOT, "music.wav"), music(), stereo_width=0.35)
    sfx = os.path.join(ROOT, "sfx")
    write(os.path.join(sfx, "tick.wav"), sfx_tick())
    write(os.path.join(sfx, "whoosh.wav"), sfx_whoosh())
    write(os.path.join(sfx, "swoosh.wav"), sfx_swoosh())
    for i in range(8):
        write(os.path.join(sfx, f"pop{i}.wav"), sfx_pop(i * 2))
    write(os.path.join(sfx, "beep.wav"), sfx_beep(76))
    write(os.path.join(sfx, "beep-go.wav"), sfx_beep(88, 0.45))
    write(os.path.join(sfx, "boing.wav"), sfx_boing())
    write(os.path.join(sfx, "scratch.wav"), sfx_scratch())
    write(os.path.join(sfx, "click.wav"), sfx_click())
    write(os.path.join(sfx, "clock.wav"), sfx_clock())
    write(os.path.join(sfx, "ping.wav"), sfx_ping())
    write(os.path.join(sfx, "ding.wav"), sfx_ding())
    write(os.path.join(sfx, "sparkle.wav"), sfx_sparkle())
    write(os.path.join(sfx, "impact.wav"), sfx_impact())
    write(os.path.join(sfx, "hum.wav"), sfx_hum())


if __name__ == "__main__":
    main()
